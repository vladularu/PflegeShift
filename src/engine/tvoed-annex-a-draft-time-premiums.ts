import { Temporal } from "@js-temporal/polyfill";
import type { RuleTariffPackage } from "../rules/contracts.generated";
import { resolveTariffSelection } from "../rules/tariff-selection";
import { validateRulePackage } from "../rules/validation";
import { roundRemunerationCents } from "./remuneration-money";

type Premium =
  | "NIGHT"
  | "SUNDAY"
  | "HOLIDAY_WITH_TIME_OFF"
  | "HOLIDAY_WITHOUT_TIME_OFF"
  | "PRE_HOLIDAY"
  | "SATURDAY";

interface WorkedSlice {
  /** Confirmed net active work, already split at midnight and after actual breaks. */
  date: string;
  fromMinute: number;
  throughMinute: number;
  actualElapsedMinutes: number;
  workKind: "REGULAR_ACTIVE" | "SPECIAL";
  publicHoliday: boolean;
  holidayTimeOff?: boolean;
  shiftWork?: boolean;
  /** TVöD-AT § 38(5) sentence 1; required for Saturday shift-work exception. */
  legacyAngestellteClass?: boolean;
}

export interface TvoedAnnexADraftTimePremiumInput {
  pkg: RuleTariffPackage;
  month: string;
  variantId: "BT_K" | "BT_B";
  groupId: string;
  fullTimeWeeklyMinutes: number;
  fullTimeReferenceConfirmed: boolean;
  applicabilityConfirmed: boolean;
  workDataComplete: boolean;
  cashPaymentConfirmed: boolean;
  localAgreement: "NONE_CONFIRMED" | "UNKNOWN" | "DIFFERENT";
  workedSlices: readonly WorkedSlice[];
}

export type TvoedAnnexADraftTimePremiumResult =
  | { kind: "unavailable"; reason: string }
  | {
      kind: "draft-time-premiums";
      completeGross: false;
      status: "estimated";
      amountCents: number;
      referenceHourlyCents: number;
      packageId: string;
      versionId: string;
      sourceIds: string[];
      excludedComponents: readonly [
        "OVERTIME",
        "ALLOWANCES",
        "ANNUAL_PAYMENT",
        "OTHER_INDIVIDUAL_TERMS",
      ];
      positions: {
        date: string;
        premium: Premium;
        minutes: number;
        percentageBasisPoints: number;
        amountCents: number;
      }[];
    };

function inWindow(minute: number, start: number, end: number): boolean {
  return start < end ? minute >= start && minute < end : minute >= start || minute < end;
}

function validDate(value: string): boolean {
  try {
    return (
      /^\d{4}-\d{2}-\d{2}$/u.test(value) && Temporal.PlainDate.from(value).toString() === value
    );
  } catch {
    return false;
  }
}

/** Isolated draft calculation of TVöD-AT § 8(1) b–f cash premiums, not a salary estimate. */
export function calculateTvoedAnnexADraftTimePremiums(
  input: TvoedAnnexADraftTimePremiumInput,
): TvoedAnnexADraftTimePremiumResult {
  const { pkg, month } = input;
  if (pkg.engineContractVersion !== 16 || pkg.status !== "DRAFT" || !validateRulePackage(pkg).ok)
    return { kind: "unavailable", reason: "INVALID_PACKAGE" };
  let yearMonth: Temporal.PlainYearMonth;
  try {
    yearMonth = Temporal.PlainYearMonth.from(month);
    if (!/^\d{4}-\d{2}$/u.test(month) || yearMonth.toString() !== month)
      return { kind: "unavailable", reason: "INVALID_MONTH" };
  } catch {
    return { kind: "unavailable", reason: "INVALID_MONTH" };
  }
  if (
    `${month}-01` < pkg.validFrom ||
    (pkg.validTo !== null &&
      `${month}-${String(yearMonth.daysInMonth).padStart(2, "0")}` > pkg.validTo)
  )
    return { kind: "unavailable", reason: "OUTSIDE_VALIDITY" };
  if (!input.applicabilityConfirmed)
    return { kind: "unavailable", reason: "TARIFF_APPLICABILITY_UNCONFIRMED" };
  if (!input.fullTimeReferenceConfirmed || input.fullTimeWeeklyMinutes !== 2340)
    return { kind: "unavailable", reason: "FULL_TIME_REFERENCE_UNSUPPORTED" };
  if (!input.workDataComplete) return { kind: "unavailable", reason: "WORK_DATA_INCOMPLETE" };
  if (!input.cashPaymentConfirmed)
    return { kind: "unavailable", reason: "CASH_PAYMENT_UNCONFIRMED" };
  if (input.localAgreement !== "NONE_CONFIRMED")
    return { kind: "unavailable", reason: "LOCAL_AGREEMENT_UNSUPPORTED" };
  const selected = resolveTariffSelection(pkg, input.variantId, "VKA");
  if (selected?.familyId !== "tvoed-vka-annex-a" || selected.engineId !== "tvoed-annex-a-v1")
    return { kind: "unavailable", reason: "UNKNOWN_SELECTION" };
  const policy = pkg.rules.tvoedAnnexATimePremiumPolicy;
  if (!policy) return { kind: "unavailable", reason: "MISSING_POLICY" };
  const table = pkg.rules.payTables.find((item) => item.id === selected.region.payTableId);
  const reference = table?.entries.filter(
    (entry) =>
      entry.groupId === input.groupId.toLowerCase() && entry.stepId === policy.referenceStepId,
  );
  if (reference?.length !== 1) return { kind: "unavailable", reason: "MISSING_REFERENCE_PAY" };
  const hourlyNumerator = reference[0].monthlyCents * 60000;
  if (!Number.isSafeInteger(hourlyNumerator))
    return { kind: "unavailable", reason: "AMOUNT_OVERFLOW" };
  const referenceHourlyCents = roundRemunerationCents(
    hourlyNumerator,
    input.fullTimeWeeklyMinutes * policy.monthlyFactorThousandths,
  );
  const buckets = new Map<
    string,
    { date: string; premium: Premium; minutes: number; rate: number }
  >();
  const priorSlices = new Map<string, { from: number; through: number }[]>();
  const count = (date: string, premium: Premium, rate: number) => {
    const key = `${date}:${premium}`;
    const prior = buckets.get(key);
    buckets.set(key, { date, premium, minutes: (prior?.minutes ?? 0) + 1, rate });
  };
  for (const slice of input.workedSlices) {
    if (
      !validDate(slice.date) ||
      slice.date.slice(0, 7) !== month ||
      !Number.isSafeInteger(slice.fromMinute) ||
      !Number.isSafeInteger(slice.throughMinute) ||
      slice.fromMinute < 0 ||
      slice.throughMinute > 1440 ||
      slice.fromMinute >= slice.throughMinute ||
      !Number.isSafeInteger(slice.actualElapsedMinutes) ||
      slice.actualElapsedMinutes !== slice.throughMinute - slice.fromMinute
    )
      return { kind: "unavailable", reason: "INVALID_WORKED_SLICE" };
    const day = Temporal.PlainDate.from(slice.date);
    const zonedStart = day.toZonedDateTime({ timeZone: "Europe/Berlin", plainTime: "00:00" });
    if (zonedStart.add({ days: 1 }).epochMilliseconds - zonedStart.epochMilliseconds !== 86400000)
      return { kind: "unavailable", reason: "DST_DAY_UNSUPPORTED" };
    if (slice.workKind !== "REGULAR_ACTIVE")
      return { kind: "unavailable", reason: "SPECIAL_WORK_UNSUPPORTED" };
    if (typeof slice.publicHoliday !== "boolean")
      return { kind: "unavailable", reason: "HOLIDAY_UNKNOWN" };
    if (slice.publicHoliday && typeof slice.holidayTimeOff !== "boolean")
      return { kind: "unavailable", reason: "HOLIDAY_TIME_OFF_UNKNOWN" };
    const prior = priorSlices.get(slice.date) ?? [];
    if (prior.some((item) => slice.fromMinute < item.through && slice.throughMinute > item.from))
      return { kind: "unavailable", reason: "OVERLAPPING_WORK" };
    prior.push({ from: slice.fromMinute, through: slice.throughMinute });
    priorSlices.set(slice.date, prior);
    for (let minute = slice.fromMinute; minute < slice.throughMinute; minute++) {
      if (inWindow(minute, policy.nightWindow.startMinute, policy.nightWindow.endMinute))
        count(slice.date, "NIGHT", policy.nightBasisPoints);
      const dayRates: { premium: Premium; rate: number }[] = [];
      if (day.dayOfWeek === 7) dayRates.push({ premium: "SUNDAY", rate: policy.sundayBasisPoints });
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
        inWindow(minute, policy.preHolidayWindow.startMinute, policy.preHolidayWindow.endMinute)
      )
        dayRates.push({ premium: "PRE_HOLIDAY", rate: policy.preHolidayBasisPoints });
      if (
        day.dayOfWeek === 6 &&
        inWindow(minute, policy.saturdayWindow.startMinute, policy.saturdayWindow.endMinute)
      ) {
        if (typeof slice.shiftWork !== "boolean")
          return { kind: "unavailable", reason: "SHIFT_WORK_UNKNOWN" };
        if (slice.shiftWork && typeof slice.legacyAngestellteClass !== "boolean")
          return { kind: "unavailable", reason: "LEGACY_CLASS_UNKNOWN" };
        if (!slice.shiftWork || slice.legacyAngestellteClass)
          dayRates.push({ premium: "SATURDAY", rate: policy.saturdayBasisPoints });
      }
      const winner = dayRates.reduce<(typeof dayRates)[number] | null>(
        (best, item) => (best === null || item.rate > best.rate ? item : best),
        null,
      );
      if (winner) count(slice.date, winner.premium, winner.rate);
    }
  }
  const positions = [...buckets.values()].map((item) => ({
    date: item.date,
    premium: item.premium,
    minutes: item.minutes,
    percentageBasisPoints: item.rate,
    amountCents: roundRemunerationCents(referenceHourlyCents * item.rate * item.minutes, 600000),
  }));
  const amountCents = positions.reduce((sum, item) => sum + item.amountCents, 0);
  if (!Number.isSafeInteger(amountCents)) return { kind: "unavailable", reason: "AMOUNT_OVERFLOW" };
  return {
    kind: "draft-time-premiums",
    completeGross: false,
    status: "estimated",
    amountCents,
    referenceHourlyCents,
    packageId: pkg.packageId,
    versionId: pkg.versionId,
    sourceIds: [...policy.sourceIds],
    excludedComponents: ["OVERTIME", "ALLOWANCES", "ANNUAL_PAYMENT", "OTHER_INDIVIDUAL_TERMS"],
    positions,
  };
}
