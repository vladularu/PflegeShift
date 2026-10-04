import { Temporal } from "@js-temporal/polyfill";
import type { RuleTariffPackage, RuleTimeWindow } from "@/rules/contracts.generated";
import { resolveTariffSelection } from "@/rules/tariff-selection";
import { validateRulePackage } from "@/rules/validation";
import { roundRemunerationCents } from "./remuneration-money";

/** Already split by local calendar date, with actual breaks removed. No pause is invented here. */
export interface CaritasDraftWorkedSlice {
  readonly date: string;
  readonly fromMinute: number;
  readonly throughMinute: number;
  readonly publicHoliday: boolean | null;
  readonly holidayTimeOff: boolean | null;
  readonly shiftWork: boolean | null;
}

export interface CaritasDraftTimePremiumInput {
  readonly pkg: RuleTariffPackage;
  readonly variantId: string;
  readonly regionId: string;
  readonly groupId: string;
  readonly workedSlices: readonly CaritasDraftWorkedSlice[];
  readonly workDataComplete: boolean;
  readonly localAgreement: "NONE_CONFIRMED" | "UNKNOWN" | "DIFFERENT";
}

type Premium =
  | "NIGHT"
  | "SUNDAY"
  | "HOLIDAY_WITH_TIME_OFF"
  | "HOLIDAY_WITHOUT_TIME_OFF"
  | "PRE_HOLIDAY"
  | "SATURDAY";

export type CaritasDraftTimePremiumResult =
  | {
      readonly kind: "federal-baseline-time-premiums";
      readonly status: "estimated";
      readonly amountCents: number;
      readonly packageId: string;
      readonly versionId: string;
      readonly sourceIds: readonly string[];
      readonly localAgreementUnconfirmed: boolean;
      readonly positions: readonly {
        readonly date: string;
        readonly premium: Premium;
        readonly minutes: number;
        readonly referenceHourlyCents: number;
        readonly percentageBasisPoints: number;
        readonly amountCents: number;
      }[];
    }
  | {
      readonly kind: "unavailable";
      readonly reason:
        | "INVALID_PACKAGE"
        | "UNKNOWN_SELECTION"
        | "MISSING_POLICY"
        | "OUTSIDE_VALIDITY"
        | "MISSING_REFERENCE_PAY"
        | "MISSING_WORKING_TIME"
        | "INVALID_WORKED_SLICE"
        | "WORK_DATA_INCOMPLETE"
        | "HOLIDAY_UNKNOWN"
        | "HOLIDAY_TIME_OFF_UNKNOWN"
        | "SHIFT_WORK_UNKNOWN"
        | "LOCAL_AGREEMENT_UNSUPPORTED";
    };

function realDate(value: string): boolean {
  try {
    return (
      /^\d{4}-\d{2}-\d{2}$/u.test(value) && Temporal.PlainDate.from(value).toString() === value
    );
  } catch {
    return false;
  }
}

function inWindow(minute: number, window: RuleTimeWindow): boolean {
  return window.startMinute < window.endMinute
    ? minute >= window.startMinute && minute < window.endMinute
    : minute >= window.startMinute || minute < window.endMinute;
}

/** Candidate-only § 6(1) baseline; overtime, employer increases and final payroll remain out of scope. */
export function calculateCaritasCareDraftTimePremiums({
  pkg,
  variantId,
  regionId,
  groupId,
  workedSlices,
  workDataComplete,
  localAgreement,
}: CaritasDraftTimePremiumInput): CaritasDraftTimePremiumResult {
  if (pkg.engineContractVersion !== 14 || pkg.status !== "DRAFT" || !validateRulePackage(pkg).ok)
    return { kind: "unavailable", reason: "INVALID_PACKAGE" };
  const selected = resolveTariffSelection(pkg, variantId, regionId);
  if (selected?.familyId !== "avr-caritas-p" || selected.engineId !== "avr-caritas-p-v1")
    return { kind: "unavailable", reason: "UNKNOWN_SELECTION" };
  const policy = pkg.rules.caritasTimePremiumPolicy;
  if (!policy) return { kind: "unavailable", reason: "MISSING_POLICY" };
  if (!workDataComplete) return { kind: "unavailable", reason: "WORK_DATA_INCOMPLETE" };
  if (!["NONE_CONFIRMED", "UNKNOWN", "DIFFERENT"].includes(localAgreement))
    return { kind: "unavailable", reason: "LOCAL_AGREEMENT_UNSUPPORTED" };
  if (localAgreement === "DIFFERENT")
    return { kind: "unavailable", reason: "LOCAL_AGREEMENT_UNSUPPORTED" };
  const tableId = selected.region.payTableId ?? pkg.rules.selector.payTableId;
  const table = pkg.rules.payTables.find((item) => item.id === tableId);
  const reference = table?.entries.find(
    (entry) => entry.groupId === groupId && entry.stepId === policy.referenceStepId,
  );
  if (!reference) return { kind: "unavailable", reason: "MISSING_REFERENCE_PAY" };

  const buckets = new Map<
    string,
    {
      date: string;
      premium: Premium;
      minutes: number;
      referenceHourlyCents: number;
      percentageBasisPoints: number;
    }
  >();
  const count = (date: string, premium: Premium, hourlyCents: number, rate: number) => {
    const key = `${date}:${premium}:${hourlyCents}`;
    const prior = buckets.get(key);
    buckets.set(key, {
      date,
      premium,
      minutes: (prior?.minutes ?? 0) + 1,
      referenceHourlyCents: hourlyCents,
      percentageBasisPoints: rate,
    });
  };

  for (const slice of workedSlices) {
    if (
      !realDate(slice.date) ||
      !Number.isInteger(slice.fromMinute) ||
      !Number.isInteger(slice.throughMinute) ||
      slice.fromMinute < 0 ||
      slice.throughMinute > 1440 ||
      slice.fromMinute >= slice.throughMinute
    )
      return { kind: "unavailable", reason: "INVALID_WORKED_SLICE" };
    if (
      slice.date < pkg.validFrom ||
      (pkg.validTo !== null && slice.date > pkg.validTo) ||
      slice.date < policy.validFrom ||
      slice.date > policy.validTo
    )
      return { kind: "unavailable", reason: "OUTSIDE_VALIDITY" };
    if (typeof slice.publicHoliday !== "boolean")
      return { kind: "unavailable", reason: "HOLIDAY_UNKNOWN" };
    if (slice.publicHoliday && typeof slice.holidayTimeOff !== "boolean")
      return { kind: "unavailable", reason: "HOLIDAY_TIME_OFF_UNKNOWN" };
    const times = pkg.rules.employmentWorkingTimeRules?.filter(
      (rule) =>
        rule.variantId === variantId &&
        rule.regionId === regionId &&
        rule.validFrom <= slice.date &&
        rule.validTo !== null &&
        slice.date <= rule.validTo,
    );
    if (times?.length !== 1) return { kind: "unavailable", reason: "MISSING_WORKING_TIME" };
    const hourlyCents = roundRemunerationCents(
      reference.monthlyCents * 60000,
      times[0].fullTimeWeeklyMinutes * policy.monthlyFactorThousandths,
    );
    const date = Temporal.PlainDate.from(slice.date);
    const weekday = date.dayOfWeek;
    for (let minute = slice.fromMinute; minute < slice.throughMinute; minute++) {
      if (inWindow(minute, policy.nightWindow))
        count(slice.date, "NIGHT", hourlyCents, policy.nightBasisPoints);
      const dayRates: { premium: Premium; rate: number }[] = [];
      if (weekday === 7) dayRates.push({ premium: "SUNDAY", rate: policy.sundayBasisPoints });
      if (slice.publicHoliday)
        dayRates.push(
          slice.holidayTimeOff
            ? { premium: "HOLIDAY_WITH_TIME_OFF", rate: policy.holidayWithTimeOffBasisPoints }
            : {
                premium: "HOLIDAY_WITHOUT_TIME_OFF",
                rate: policy.holidayWithoutTimeOffBasisPoints,
              },
        );
      if (
        policy.preHolidayMonthDays.includes(slice.date.slice(5) as "12-24" | "12-31") &&
        inWindow(minute, policy.preHolidayWindow)
      )
        dayRates.push({ premium: "PRE_HOLIDAY", rate: policy.preHolidayBasisPoints });
      if (weekday === 6 && inWindow(minute, policy.saturdayWindow)) {
        if (typeof slice.shiftWork !== "boolean")
          return { kind: "unavailable", reason: "SHIFT_WORK_UNKNOWN" };
        if (!slice.shiftWork)
          dayRates.push({ premium: "SATURDAY", rate: policy.saturdayBasisPoints });
      }
      const winner = dayRates.reduce<(typeof dayRates)[number] | null>(
        (best, item) => (best === null || item.rate > best.rate ? item : best),
        null,
      );
      if (winner) count(slice.date, winner.premium, hourlyCents, winner.rate);
    }
  }
  const positions = [...buckets.values()].map((item) => ({
    ...item,
    amountCents: roundRemunerationCents(
      item.referenceHourlyCents * item.percentageBasisPoints * item.minutes,
      600000,
    ),
  }));
  return {
    kind: "federal-baseline-time-premiums",
    status: "estimated",
    amountCents: positions.reduce((sum, item) => sum + item.amountCents, 0),
    packageId: pkg.packageId,
    versionId: pkg.versionId,
    sourceIds: policy.sourceIds,
    localAgreementUnconfirmed: localAgreement === "UNKNOWN",
    positions,
  };
}
