import { Temporal } from "@js-temporal/polyfill";
import type { DatedAllowanceEntitlement } from "@/domain/remuneration-supplement";
import { ALLOWANCE_STATUSES, type AllowanceStatus } from "@/domain/types";
import type { RuleTariffPackage } from "@/rules/contracts.generated";
import { resolveTariffSelection } from "@/rules/tariff-selection";
import { validateRulePackage } from "@/rules/validation";
import { roundRemunerationCents } from "./remuneration-money";

export interface CaritasDraftWorkedDay {
  readonly date: string;
  readonly workedMinutes: number;
  readonly estimatedPause: boolean;
}

export interface CaritasDraftShiftInput {
  readonly pkg: RuleTariffPackage;
  readonly from: string;
  readonly through: string;
  readonly variantId: string;
  readonly regionId: string;
  readonly weeklyMinutes: number;
  readonly entitlements: readonly DatedAllowanceEntitlement[];
  readonly workDaysComplete: boolean;
  /** Net working minutes already allocated to the correct local calendar date. */
  readonly workedDays: readonly CaritasDraftWorkedDay[];
}

export type CaritasDraftShiftResult =
  | {
      readonly kind: "personal-shift-allowance";
      readonly amountCents: number;
      readonly status: "calculated" | "estimated";
      readonly packageId: string;
      readonly versionId: string;
      readonly positions: readonly {
        readonly allowanceStatus: Exclude<AllowanceStatus, "NONE">;
        readonly rateId: string;
        readonly rateCents: number;
        readonly personalMonthlyCents: number | null;
        readonly calendarDays: number;
        readonly workedMinutes: number;
        readonly amountCents: number;
        readonly sourceIds: readonly string[];
      }[];
    }
  | {
      readonly kind: "unavailable";
      readonly reason:
        | "INVALID_PACKAGE"
        | "INVALID_PERIOD"
        | "OUTSIDE_VALIDITY"
        | "UNKNOWN_SELECTION"
        | "INVALID_WEEKLY_TIME"
        | "MISSING_WORKING_TIME"
        | "MISSING_SHIFT_RATE"
        | "INVALID_WORKED_MINUTES"
        | "WORK_DATA_INCOMPLETE"
        | "DECISION_MISSING"
        | "DECISION_AMBIGUOUS";
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

/** Candidate-only calculation; a confirmed status is not inferred from shift entries. */
export function calculateCaritasCareDraftShiftAllowance({
  pkg,
  from,
  through,
  variantId,
  regionId,
  weeklyMinutes,
  entitlements,
  workDaysComplete,
  workedDays,
}: CaritasDraftShiftInput): CaritasDraftShiftResult {
  if (pkg.engineContractVersion !== 14 || !validateRulePackage(pkg).ok)
    return { kind: "unavailable", reason: "INVALID_PACKAGE" };
  if (
    !realDate(from) ||
    !realDate(through) ||
    from > through ||
    from.slice(0, 7) !== through.slice(0, 7)
  )
    return { kind: "unavailable", reason: "INVALID_PERIOD" };
  if (from < pkg.validFrom || (pkg.validTo !== null && through > pkg.validTo))
    return { kind: "unavailable", reason: "OUTSIDE_VALIDITY" };
  const selection = resolveTariffSelection(pkg, variantId, regionId);
  if (
    selection?.familyId !== "avr-caritas-p" ||
    selection.engineId !== "avr-caritas-p-v1" ||
    Object.values(selection.capabilities).some((capability) => capability !== "UNSUPPORTED")
  )
    return { kind: "unavailable", reason: "UNKNOWN_SELECTION" };
  if (!Number.isSafeInteger(weeklyMinutes) || weeklyMinutes < 60)
    return { kind: "unavailable", reason: "INVALID_WEEKLY_TIME" };
  if (workDaysComplete !== true) return { kind: "unavailable", reason: "WORK_DATA_INCOMPLETE" };

  const work = new Map<string, CaritasDraftWorkedDay>();
  for (const day of workedDays) {
    if (
      !realDate(day.date) ||
      day.date < from ||
      day.date > through ||
      work.has(day.date) ||
      !Number.isSafeInteger(day.workedMinutes) ||
      day.workedMinutes < 0 ||
      day.workedMinutes > 1440 ||
      typeof day.estimatedPause !== "boolean"
    )
      return { kind: "unavailable", reason: "INVALID_WORKED_MINUTES" };
    work.set(day.date, day);
  }
  if (
    entitlements.some(
      (item) =>
        !realDate(item.from) ||
        !realDate(item.through) ||
        item.from > item.through ||
        !ALLOWANCE_STATUSES.includes(item.status),
    )
  )
    return { kind: "unavailable", reason: "DECISION_AMBIGUOUS" };

  type Bucket = {
    status: Exclude<AllowanceStatus, "NONE">;
    rateId: string;
    rateCents: number;
    fullTimeWeeklyMinutes: number;
    sourceIds: readonly string[];
    calendarDays: number;
    workedMinutes: number;
    estimatedPause: boolean;
  };
  const buckets = new Map<string, Bucket>();
  const monthDays = Temporal.PlainDate.from(from).daysInMonth;
  for (
    let date = Temporal.PlainDate.from(from);
    Temporal.PlainDate.compare(date, Temporal.PlainDate.from(through)) <= 0;
    date = date.add({ days: 1 })
  ) {
    const day = date.toString();
    const times = pkg.rules.employmentWorkingTimeRules?.filter(
      (rule) =>
        rule.variantId === variantId &&
        rule.regionId === regionId &&
        rule.validFrom <= day &&
        (rule.validTo === null || day <= rule.validTo),
    );
    if (times?.length !== 1) return { kind: "unavailable", reason: "MISSING_WORKING_TIME" };
    const fullTimeWeeklyMinutes = times[0].fullTimeWeeklyMinutes;
    if (weeklyMinutes > fullTimeWeeklyMinutes)
      return { kind: "unavailable", reason: "INVALID_WEEKLY_TIME" };
    const rates = pkg.rules.caritasShiftAllowanceRates?.filter(
      (rate) =>
        rate.variantId === variantId &&
        rate.regionId === regionId &&
        rate.validFrom <= day &&
        day <= rate.validTo,
    );
    if (rates?.length !== 1) return { kind: "unavailable", reason: "MISSING_SHIFT_RATE" };
    const decisions = entitlements.filter((item) => item.from <= day && day <= item.through);
    if (decisions.length > 1) return { kind: "unavailable", reason: "DECISION_AMBIGUOUS" };
    if (decisions.length !== 1 || decisions[0].origin !== "confirmed")
      return { kind: "unavailable", reason: "DECISION_MISSING" };
    const status = decisions[0].status;
    if (status === "NONE") continue;
    const monthly = status.endsWith("_MONTHLY");
    const alternating = status.startsWith("ALTERNATING");
    const rate = rates[0];
    const rateCents = alternating
      ? monthly
        ? rate.alternatingMonthlyCents
        : rate.alternatingHourlyCents
      : monthly
        ? rate.shiftMonthlyCents
        : rate.shiftHourlyCents;
    const key = JSON.stringify([status, rate.id, fullTimeWeeklyMinutes]);
    const bucket = buckets.get(key) ?? {
      status,
      rateId: rate.id,
      rateCents,
      fullTimeWeeklyMinutes,
      sourceIds: [...new Set([...rate.sourceIds, ...times[0].sourceIds])],
      calendarDays: 0,
      workedMinutes: 0,
      estimatedPause: false,
    };
    bucket.calendarDays += 1;
    if (!monthly) {
      bucket.workedMinutes += work.get(day)?.workedMinutes ?? 0;
      bucket.estimatedPause ||= work.get(day)?.estimatedPause ?? false;
    }
    buckets.set(key, bucket);
  }
  const positions = [...buckets.values()].map((bucket) => {
    const monthly = bucket.status.endsWith("_MONTHLY");
    const personalMonthlyCents = monthly
      ? roundRemunerationCents(bucket.rateCents * weeklyMinutes, bucket.fullTimeWeeklyMinutes)
      : null;
    const amountCents = monthly
      ? roundRemunerationCents(personalMonthlyCents! * bucket.calendarDays, monthDays)
      : roundRemunerationCents(bucket.rateCents * bucket.workedMinutes, 60);
    return {
      allowanceStatus: bucket.status,
      rateId: bucket.rateId,
      rateCents: bucket.rateCents,
      personalMonthlyCents,
      calendarDays: bucket.calendarDays,
      workedMinutes: bucket.workedMinutes,
      amountCents,
      sourceIds: bucket.sourceIds,
      estimatedPause: bucket.estimatedPause,
    };
  });
  return {
    kind: "personal-shift-allowance",
    amountCents: positions.reduce((sum, position) => sum + position.amountCents, 0),
    status: positions.some(
      (position) =>
        position.estimatedPause ||
        (position.personalMonthlyCents !== null && position.calendarDays < monthDays),
    )
      ? "estimated"
      : "calculated",
    packageId: pkg.packageId,
    versionId: pkg.versionId,
    positions: positions.map(({ estimatedPause: _estimatedPause, ...position }) => position),
  };
}
