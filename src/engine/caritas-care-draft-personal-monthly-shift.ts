import { Temporal } from "@js-temporal/polyfill";
import type { RuleTariffPackage } from "@/rules/contracts.generated";
import {
  lookupCaritasShiftAllowanceRate,
  type CaritasShiftAllowanceRateLookup,
} from "./caritas-shift-allowance-rate";
import {
  lookupCaritasFullTimeWeeklyMinutes,
  type CaritasWorkingTimeLookup,
} from "./caritas-working-time";

export type CaritasMonthlyShiftAllowanceType = "ALTERNATING_MONTHLY" | "SHIFT_MONTHLY";
export type CaritasMonthlyShiftEntitlement = "CONFIRMED_FULL_MONTH" | "NOT_ENTITLED" | "UNKNOWN";

export interface CaritasPersonalMonthlyShiftInput {
  readonly pkg: RuleTariffPackage;
  readonly month: string;
  readonly variantId: string;
  readonly regionId: string;
  readonly weeklyMinutes: number;
  readonly allowanceType: CaritasMonthlyShiftAllowanceType;
  readonly entitlement: CaritasMonthlyShiftEntitlement;
  readonly fullMonthEmploymentConfirmed: boolean;
  readonly fullMonthWeeklyTimeConfirmed: boolean;
}

/** One externally confirmed monthly component; never a complete or activated salary. */
export type CaritasPersonalMonthlyShiftResult =
  | {
      readonly kind: "personal-monthly-shift-allowance";
      readonly completeGross: false;
      readonly fullMonthEntitlementConfirmed: true;
      readonly month: string;
      readonly allowanceType: CaritasMonthlyShiftAllowanceType;
      readonly fullTimeMonthlyCents: number;
      readonly personalMonthlyCents: number;
      readonly weeklyMinutes: number;
      readonly fullTimeWeeklyMinutes: number;
      readonly packageId: string;
      readonly versionId: string;
      readonly rateId: string;
      readonly workingTimeRuleId: string;
      readonly rateSourceIds: readonly string[];
      readonly workingTimeSourceIds: readonly string[];
      readonly prorationProvision: "AVR_ANLAGE_31_32_12A";
    }
  | {
      readonly kind: "unavailable";
      readonly reason:
        | Extract<CaritasShiftAllowanceRateLookup, { kind: "unavailable" }>["reason"]
        | Extract<CaritasWorkingTimeLookup, { kind: "unavailable" }>["reason"]
        | "INVALID_MONTH"
        | "PARTIAL_EMPLOYMENT"
        | "WEEKLY_TIME_UNCONFIRMED"
        | "ENTITLEMENT_UNCONFIRMED"
        | "NOT_ENTITLED"
        | "UNKNOWN_ALLOWANCE_TYPE"
        | "MID_MONTH_RATE_CHANGE"
        | "MID_MONTH_WORKING_TIME_CHANGE"
        | "INVALID_WEEKLY_TIME"
        | "AMOUNT_OVERFLOW";
    };

function monthBounds(month: string): { from: string; through: string } | null {
  try {
    if (!/^\d{4}-\d{2}$/u.test(month)) return null;
    const yearMonth = Temporal.PlainYearMonth.from(month);
    if (yearMonth.toString() !== month) return null;
    return {
      from: month + "-01",
      through: month + "-" + String(yearMonth.daysInMonth).padStart(2, "0"),
    };
  } catch {
    return null;
  }
}

/**
 * Prorates only a confirmed full-month § 6(5)/(6) monthly rate under § 12a.
 * Qualification and regularity must be confirmed outside this DRAFT function.
 */
export function calculateCaritasPersonalMonthlyShiftAllowance(
  input: CaritasPersonalMonthlyShiftInput,
): CaritasPersonalMonthlyShiftResult {
  if (input.entitlement === "NOT_ENTITLED") return { kind: "unavailable", reason: "NOT_ENTITLED" };
  if (input.entitlement !== "CONFIRMED_FULL_MONTH")
    return { kind: "unavailable", reason: "ENTITLEMENT_UNCONFIRMED" };
  if (input.fullMonthEmploymentConfirmed !== true)
    return { kind: "unavailable", reason: "PARTIAL_EMPLOYMENT" };
  if (input.fullMonthWeeklyTimeConfirmed !== true)
    return { kind: "unavailable", reason: "WEEKLY_TIME_UNCONFIRMED" };
  if (input.allowanceType !== "ALTERNATING_MONTHLY" && input.allowanceType !== "SHIFT_MONTHLY")
    return { kind: "unavailable", reason: "UNKNOWN_ALLOWANCE_TYPE" };

  const bounds = monthBounds(input.month);
  if (!bounds) return { kind: "unavailable", reason: "INVALID_MONTH" };

  const { pkg, variantId, regionId } = input;
  if (pkg.status !== "DRAFT") return { kind: "unavailable", reason: "INVALID_PACKAGE" };

  const rateStart = lookupCaritasShiftAllowanceRate(pkg, bounds.from, variantId, regionId);
  if (rateStart.kind === "unavailable") return rateStart;
  const rateEnd = lookupCaritasShiftAllowanceRate(pkg, bounds.through, variantId, regionId);
  if (rateEnd.kind === "unavailable") return rateEnd;
  if (rateStart.rateId !== rateEnd.rateId)
    return { kind: "unavailable", reason: "MID_MONTH_RATE_CHANGE" };

  const workingTimeStart = lookupCaritasFullTimeWeeklyMinutes(
    pkg,
    bounds.from,
    variantId,
    regionId,
  );
  if (workingTimeStart.kind === "unavailable") return workingTimeStart;
  const workingTimeEnd = lookupCaritasFullTimeWeeklyMinutes(
    pkg,
    bounds.through,
    variantId,
    regionId,
  );
  if (workingTimeEnd.kind === "unavailable") return workingTimeEnd;
  if (workingTimeStart.ruleId !== workingTimeEnd.ruleId)
    return { kind: "unavailable", reason: "MID_MONTH_WORKING_TIME_CHANGE" };

  const fullTimeWeeklyMinutes = workingTimeStart.fullTimeWeeklyMinutes;
  if (
    !Number.isSafeInteger(input.weeklyMinutes) ||
    input.weeklyMinutes <= 0 ||
    input.weeklyMinutes > fullTimeWeeklyMinutes
  )
    return { kind: "unavailable", reason: "INVALID_WEEKLY_TIME" };

  const fullTimeMonthlyCents =
    input.allowanceType === "ALTERNATING_MONTHLY"
      ? rateStart.alternatingMonthlyCents
      : rateStart.shiftMonthlyCents;
  const numerator = fullTimeMonthlyCents * input.weeklyMinutes;
  if (!Number.isSafeInteger(numerator)) return { kind: "unavailable", reason: "AMOUNT_OVERFLOW" };
  const wholeCents = Math.floor(numerator / fullTimeWeeklyMinutes);
  const remainder = numerator % fullTimeWeeklyMinutes;
  const personalMonthlyCents = wholeCents + (remainder * 2 >= fullTimeWeeklyMinutes ? 1 : 0);
  if (!Number.isSafeInteger(personalMonthlyCents))
    return { kind: "unavailable", reason: "AMOUNT_OVERFLOW" };

  return {
    kind: "personal-monthly-shift-allowance",
    completeGross: false,
    fullMonthEntitlementConfirmed: true,
    month: input.month,
    allowanceType: input.allowanceType,
    fullTimeMonthlyCents,
    personalMonthlyCents,
    weeklyMinutes: input.weeklyMinutes,
    fullTimeWeeklyMinutes,
    packageId: rateStart.packageId,
    versionId: rateStart.versionId,
    rateId: rateStart.rateId,
    workingTimeRuleId: workingTimeStart.ruleId,
    rateSourceIds: rateStart.sourceIds,
    workingTimeSourceIds: workingTimeStart.sourceIds,
    prorationProvision: "AVR_ANLAGE_31_32_12A",
  };
}
