import { Temporal } from "@js-temporal/polyfill";
import type { RuleTariffPackage } from "@/rules/contracts.generated";
import { resolveTariffSelection } from "@/rules/tariff-selection";
import { validateRulePackage } from "@/rules/validation";
import { roundRemunerationCents } from "./remuneration-money";

export interface AvrddDraftShiftAllowanceInput {
  readonly pkg: RuleTariffPackage;
  readonly workMonth: string;
  readonly variantId: string;
  readonly regionId: string;
  readonly avrddApplicabilityConfirmed: boolean;
  readonly contractTimeMode: "STANDARD_39" | "INDIVIDUAL_FULL_TIME_CORRIDOR" | "UNKNOWN";
  readonly contractedWeeklyMinutes: number;
  /** § 20 entitlement must be independently established from roster and employment facts. */
  readonly entitlement: "ALTERNATING_CONFIRMED" | "SHIFT_CONFIRMED" | "NONE_CONFIRMED" | "UNKNOWN";
  readonly fullMonthEntitlementConfirmed: boolean;
  /** § 20(4): regular readiness of at least three hours per day excludes the allowance. */
  readonly readinessExclusion: "ABSENT_CONFIRMED" | "PRESENT" | "UNKNOWN";
}

export type AvrddDraftShiftAllowanceResult =
  | {
      readonly kind: "draft-confirmed-shift-allowance";
      readonly status: "estimated";
      readonly completeGross: false;
      readonly workMonth: string;
      readonly packageId: string;
      readonly versionId: string;
      readonly entitlement: "ALTERNATING_CONFIRMED" | "SHIFT_CONFIRMED";
      readonly fullTimeMonthlyCents: number;
      readonly amountCents: number;
      readonly sourceIds: readonly string[];
    }
  | {
      readonly kind: "unavailable";
      readonly reason:
        | "INVALID_PACKAGE"
        | "INVALID_MONTH"
        | "OUTSIDE_VALIDITY"
        | "AVRDD_APPLICABILITY_UNCONFIRMED"
        | "CONTRACT_TIME_UNKNOWN"
        | "CORRIDOR_SEPARATE_CALCULATION_REQUIRED"
        | "INVALID_WEEKLY_TIME"
        | "ENTITLEMENT_UNCONFIRMED"
        | "NO_ENTITLEMENT_CONFIRMED"
        | "PARTIAL_MONTH_UNSUPPORTED"
        | "READINESS_EXCLUSION_UNKNOWN"
        | "READINESS_EXCLUSION_PRESENT"
        | "UNKNOWN_SELECTION"
        | "MISSING_RATE"
        | "AMOUNT_OVERFLOW";
    };

/** Candidate-only § 20 monthly allowance; calendar shift labels do not establish eligibility. */
export function calculateAvrddDraftShiftAllowance(
  input: AvrddDraftShiftAllowanceInput,
): AvrddDraftShiftAllowanceResult {
  const { pkg } = input;
  if (pkg.engineContractVersion !== 15 || pkg.status !== "DRAFT" || !validateRulePackage(pkg).ok)
    return { kind: "unavailable", reason: "INVALID_PACKAGE" };
  let month: Temporal.PlainYearMonth;
  try {
    month = Temporal.PlainYearMonth.from(input.workMonth);
    if (!/^\d{4}-\d{2}$/u.test(input.workMonth) || month.toString() !== input.workMonth)
      return { kind: "unavailable", reason: "INVALID_MONTH" };
  } catch {
    return { kind: "unavailable", reason: "INVALID_MONTH" };
  }
  const firstDate = `${input.workMonth}-01`;
  const lastDate = `${input.workMonth}-${String(month.daysInMonth).padStart(2, "0")}`;
  if (firstDate < pkg.validFrom || (pkg.validTo !== null && lastDate > pkg.validTo))
    return { kind: "unavailable", reason: "OUTSIDE_VALIDITY" };
  if (!input.avrddApplicabilityConfirmed)
    return { kind: "unavailable", reason: "AVRDD_APPLICABILITY_UNCONFIRMED" };
  if (input.contractTimeMode === "UNKNOWN")
    return { kind: "unavailable", reason: "CONTRACT_TIME_UNKNOWN" };
  if (input.contractTimeMode !== "STANDARD_39")
    return { kind: "unavailable", reason: "CORRIDOR_SEPARATE_CALCULATION_REQUIRED" };
  const fullTimeWeeklyMinutes = pkg.rules.avrddStagePolicy?.standardFullTimeWeeklyMinutes;
  if (
    fullTimeWeeklyMinutes !== 2340 ||
    !Number.isSafeInteger(input.contractedWeeklyMinutes) ||
    input.contractedWeeklyMinutes < 60 ||
    input.contractedWeeklyMinutes > fullTimeWeeklyMinutes
  )
    return { kind: "unavailable", reason: "INVALID_WEEKLY_TIME" };
  if (input.entitlement === "UNKNOWN")
    return { kind: "unavailable", reason: "ENTITLEMENT_UNCONFIRMED" };
  if (input.entitlement === "NONE_CONFIRMED")
    return { kind: "unavailable", reason: "NO_ENTITLEMENT_CONFIRMED" };
  if (!input.fullMonthEntitlementConfirmed)
    return { kind: "unavailable", reason: "PARTIAL_MONTH_UNSUPPORTED" };
  if (input.readinessExclusion === "UNKNOWN")
    return { kind: "unavailable", reason: "READINESS_EXCLUSION_UNKNOWN" };
  if (input.readinessExclusion !== "ABSENT_CONFIRMED")
    return { kind: "unavailable", reason: "READINESS_EXCLUSION_PRESENT" };
  const selection = resolveTariffSelection(pkg, input.variantId, input.regionId);
  if (
    selection?.familyId !== "avr-dd" ||
    selection.engineId !== "avr-dd-v1" ||
    Object.values(selection.capabilities).some((capability) => capability !== "UNSUPPORTED")
  )
    return { kind: "unavailable", reason: "UNKNOWN_SELECTION" };
  const rates = pkg.rules.avrddShiftAllowanceRates?.filter(
    (rate) => rate.validFrom <= firstDate && (rate.validTo === null || lastDate <= rate.validTo),
  );
  if (rates?.length !== 1) return { kind: "unavailable", reason: "MISSING_RATE" };
  const rate = rates[0];
  const fullTimeMonthlyCents =
    input.entitlement === "ALTERNATING_CONFIRMED"
      ? rate.alternatingMonthlyCents
      : rate.shiftMonthlyCents;
  const numerator = fullTimeMonthlyCents * input.contractedWeeklyMinutes;
  if (!Number.isSafeInteger(numerator)) return { kind: "unavailable", reason: "AMOUNT_OVERFLOW" };
  const amountCents = roundRemunerationCents(numerator, fullTimeWeeklyMinutes);
  return {
    kind: "draft-confirmed-shift-allowance",
    status: "estimated",
    completeGross: false,
    workMonth: input.workMonth,
    packageId: pkg.packageId,
    versionId: pkg.versionId,
    entitlement: input.entitlement,
    fullTimeMonthlyCents,
    amountCents,
    sourceIds: rate.sourceIds,
  };
}
