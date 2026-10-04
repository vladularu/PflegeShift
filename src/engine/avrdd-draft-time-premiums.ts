import { Temporal } from "@js-temporal/polyfill";
import type { RuleTariffPackage, RuleTimeWindow } from "@/rules/contracts.generated";
import { resolveTariffSelection } from "@/rules/tariff-selection";
import { validateRulePackage } from "@/rules/validation";
import { roundRemunerationCents } from "./remuneration-money";

/** Local calendar-date pieces of confirmed net active work, after actual breaks were removed. */
export interface AvrddDraftWorkedSlice {
  readonly date: string;
  readonly fromMinute: number;
  readonly throughMinute: number;
  /** Confirmed for the actual place of work, not inferred from residence. */
  readonly publicHoliday: boolean | null;
  /** False when the § 20a(2) night exclusions apply; required only for night minutes. */
  readonly nightPremiumEligible: boolean | null;
  readonly workKind: "REGULAR_ACTIVE" | "STANDBY" | "ON_CALL_ACTIVE" | "UNKNOWN";
}

export interface AvrddDraftTimePremiumInput {
  readonly pkg: RuleTariffPackage;
  readonly month: string;
  readonly variantId: string;
  readonly regionId: string;
  readonly groupId: string;
  readonly workedSlices: readonly AvrddDraftWorkedSlice[];
  readonly avrddApplicabilityConfirmed: boolean;
  readonly workDataComplete: boolean;
  /** A § 20a(4) lump-sum arrangement must be handled separately. */
  readonly premiumArrangement: "NONE_CONFIRMED" | "LUMP_SUM" | "UNKNOWN";
}

type Premium = "NIGHT" | "SUNDAY" | "HOLIDAY" | "HOLIDAY_ON_SUNDAY" | "SATURDAY";

export type AvrddDraftTimePremiumResult =
  | {
      readonly kind: "draft-time-premiums";
      readonly status: "estimated";
      readonly completeGross: false;
      readonly packageId: string;
      readonly versionId: string;
      readonly month: string;
      readonly groupId: string;
      readonly amountCents: number;
      readonly sourceIds: readonly string[];
      readonly positions: readonly {
        readonly date: string;
        readonly premium: Premium;
        readonly minutes: number;
        readonly printedRateCentsPerHour: number;
        readonly amountCents: number;
      }[];
      readonly excludedComponents: readonly [
        "OVERTIME",
        "ALLOWANCES",
        "ANNUAL_PAYMENT",
        "OTHER_LOCAL_TERMS",
      ];
    }
  | {
      readonly kind: "unavailable";
      readonly reason:
        | "INVALID_PACKAGE"
        | "INVALID_MONTH"
        | "OUTSIDE_VALIDITY"
        | "AVRDD_APPLICABILITY_UNCONFIRMED"
        | "WORK_DATA_INCOMPLETE"
        | "LOCAL_AGREEMENT_UNKNOWN"
        | "LOCAL_AGREEMENT_UNSUPPORTED"
        | "UNKNOWN_SELECTION"
        | "MISSING_POLICY"
        | "MISSING_HOURLY_RATE"
        | "INVALID_WORKED_SLICE"
        | "OUTSIDE_MONTH"
        | "WORKED_SLICES_OVERLAP"
        | "SPECIAL_WORK_UNSUPPORTED"
        | "HOLIDAY_UNKNOWN"
        | "NIGHT_ELIGIBILITY_UNKNOWN"
        | "AMOUNT_OVERFLOW";
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

/** Isolated § 20a DRAFT component. It never claims a complete salary or handles standby/on-call rules. */
export function calculateAvrddDraftTimePremiums({
  pkg,
  month,
  variantId,
  regionId,
  groupId,
  workedSlices,
  avrddApplicabilityConfirmed,
  workDataComplete,
  premiumArrangement,
}: AvrddDraftTimePremiumInput): AvrddDraftTimePremiumResult {
  if (pkg.engineContractVersion !== 15 || pkg.status !== "DRAFT" || !validateRulePackage(pkg).ok)
    return { kind: "unavailable", reason: "INVALID_PACKAGE" };
  let yearMonth: Temporal.PlainYearMonth;
  try {
    yearMonth = Temporal.PlainYearMonth.from(month);
    if (!/^\d{4}-\d{2}$/u.test(month) || yearMonth.toString() !== month)
      return { kind: "unavailable", reason: "INVALID_MONTH" };
  } catch {
    return { kind: "unavailable", reason: "INVALID_MONTH" };
  }
  const firstDate = `${month}-01`;
  const lastDate = `${month}-${String(yearMonth.daysInMonth).padStart(2, "0")}`;
  if (firstDate < pkg.validFrom || (pkg.validTo !== null && lastDate > pkg.validTo))
    return { kind: "unavailable", reason: "OUTSIDE_VALIDITY" };
  if (!avrddApplicabilityConfirmed)
    return { kind: "unavailable", reason: "AVRDD_APPLICABILITY_UNCONFIRMED" };
  if (!workDataComplete) return { kind: "unavailable", reason: "WORK_DATA_INCOMPLETE" };
  if (premiumArrangement === "UNKNOWN")
    return { kind: "unavailable", reason: "LOCAL_AGREEMENT_UNKNOWN" };
  if (premiumArrangement !== "NONE_CONFIRMED")
    return { kind: "unavailable", reason: "LOCAL_AGREEMENT_UNSUPPORTED" };
  const selected = resolveTariffSelection(pkg, variantId, regionId);
  const canonicalGroupId = groupId.toLowerCase();
  if (
    selected?.familyId !== "avr-dd" ||
    selected.engineId !== "avr-dd-v1" ||
    !selected.groups.some((group) => group.id === canonicalGroupId)
  )
    return { kind: "unavailable", reason: "UNKNOWN_SELECTION" };
  const policy = pkg.rules.avrddTimePremiumPolicy;
  if (!policy) return { kind: "unavailable", reason: "MISSING_POLICY" };
  const rates = pkg.rules.avrddHourlyRates?.filter((rate) => rate.groupId === canonicalGroupId);
  if (rates?.length !== 1) return { kind: "unavailable", reason: "MISSING_HOURLY_RATE" };
  const rate = rates[0];
  const sourceIds = [...new Set([...rate.sourceIds, ...policy.sourceIds])];
  const buckets = new Map<
    string,
    { date: string; premium: Premium; minutes: number; printedRateCentsPerHour: number }
  >();
  const priorSlices = new Map<string, { from: number; through: number }[]>();
  const count = (date: string, premium: Premium, printedRateCentsPerHour: number) => {
    const key = `${date}:${premium}`;
    const prior = buckets.get(key);
    buckets.set(key, {
      date,
      premium,
      minutes: (prior?.minutes ?? 0) + 1,
      printedRateCentsPerHour,
    });
  };

  for (const slice of workedSlices) {
    if (
      !realDate(slice.date) ||
      !Number.isSafeInteger(slice.fromMinute) ||
      !Number.isSafeInteger(slice.throughMinute) ||
      slice.fromMinute < 0 ||
      slice.throughMinute > 1440 ||
      slice.fromMinute >= slice.throughMinute
    )
      return { kind: "unavailable", reason: "INVALID_WORKED_SLICE" };
    if (slice.date.slice(0, 7) !== month) return { kind: "unavailable", reason: "OUTSIDE_MONTH" };
    if (slice.workKind !== "REGULAR_ACTIVE")
      return { kind: "unavailable", reason: "SPECIAL_WORK_UNSUPPORTED" };
    if (typeof slice.publicHoliday !== "boolean")
      return { kind: "unavailable", reason: "HOLIDAY_UNKNOWN" };
    const existing = priorSlices.get(slice.date) ?? [];
    if (
      existing.some((prior) => slice.fromMinute < prior.through && slice.throughMinute > prior.from)
    )
      return { kind: "unavailable", reason: "WORKED_SLICES_OVERLAP" };
    existing.push({ from: slice.fromMinute, through: slice.throughMinute });
    priorSlices.set(slice.date, existing);

    const weekday = Temporal.PlainDate.from(slice.date).dayOfWeek;
    for (let minute = slice.fromMinute; minute < slice.throughMinute; minute++) {
      if (inWindow(minute, policy.nightWindow)) {
        if (typeof slice.nightPremiumEligible !== "boolean")
          return { kind: "unavailable", reason: "NIGHT_ELIGIBILITY_UNKNOWN" };
        if (slice.nightPremiumEligible) count(slice.date, "NIGHT", rate.nightCents);
      }
      const dayRates: { premium: Premium; cents: number }[] = [];
      if (weekday === 7) dayRates.push({ premium: "SUNDAY", cents: rate.sundayOrHolidayCents });
      if (slice.publicHoliday)
        dayRates.push({
          premium: weekday === 7 ? "HOLIDAY_ON_SUNDAY" : "HOLIDAY",
          cents: weekday === 7 ? rate.holidayOnSundayCents : rate.sundayOrHolidayCents,
        });
      if (weekday === 6 && inWindow(minute, policy.saturdayWindow))
        dayRates.push({ premium: "SATURDAY", cents: rate.saturdayCents });
      const winner = dayRates.reduce<(typeof dayRates)[number] | null>(
        (best, candidate) => (best === null || candidate.cents > best.cents ? candidate : best),
        null,
      );
      if (winner) count(slice.date, winner.premium, winner.cents);
    }
  }
  const positions = [...buckets.values()].map((bucket) => ({
    ...bucket,
    amountCents: roundRemunerationCents(bucket.printedRateCentsPerHour * bucket.minutes, 60),
  }));
  const amountCents = positions.reduce((sum, position) => sum + position.amountCents, 0);
  if (!Number.isSafeInteger(amountCents)) return { kind: "unavailable", reason: "AMOUNT_OVERFLOW" };
  return {
    kind: "draft-time-premiums",
    status: "estimated",
    completeGross: false,
    packageId: pkg.packageId,
    versionId: pkg.versionId,
    month,
    groupId: canonicalGroupId,
    amountCents,
    sourceIds,
    positions,
    excludedComponents: ["OVERTIME", "ALLOWANCES", "ANNUAL_PAYMENT", "OTHER_LOCAL_TERMS"],
  };
}
