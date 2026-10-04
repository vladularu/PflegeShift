import { Temporal } from "@js-temporal/polyfill";
import type { RuleTariffPackage } from "@/rules/contracts.generated";
import { resolveTariffSelection } from "@/rules/tariff-selection";
import { validateRulePackage } from "@/rules/validation";
import { roundRemunerationCents } from "./remuneration-money";

export interface AvrddDraftCareAllowanceInput {
  readonly pkg: RuleTariffPackage;
  readonly workMonth: string;
  readonly variantId: string;
  readonly regionId: string;
  readonly groupId: string;
  readonly avrddApplicabilityConfirmed: boolean;
  readonly contractTimeMode: "STANDARD_39" | "INDIVIDUAL_FULL_TIME_CORRIDOR" | "UNKNOWN";
  readonly contractedWeeklyMinutes: number;
  /** § 14(2)(c) requires actual employment in care/support; a shift name is not evidence. */
  readonly careAndSupportWorkConfirmed: boolean | null;
  /** Hiring date relevant to § 14(2)(c), not automatically inferred from a profile creation date. */
  readonly relevantEmploymentStartDate: string | null;
  /** Confirmed recognized employment time at month start, required for hires from 01.10.2012. */
  readonly recognizedEmploymentMonthsAtMonthStart: number | null;
  readonly fullMonthEntitlementConfirmed: boolean;
}

export type AvrddDraftCareAllowanceResult =
  | {
      readonly kind: "draft-confirmed-care-allowance";
      readonly status: "estimated";
      readonly completeGross: false;
      readonly workMonth: string;
      readonly packageId: string;
      readonly versionId: string;
      readonly groupId: "eg3" | "eg4";
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
        | "UNKNOWN_SELECTION"
        | "GROUP_NOT_ELIGIBLE"
        | "CARE_WORK_UNCONFIRMED"
        | "CARE_WORK_NOT_CONFIRMED"
        | "EMPLOYMENT_START_UNKNOWN"
        | "INVALID_EMPLOYMENT_START"
        | "RECOGNIZED_SERVICE_UNKNOWN"
        | "INVALID_RECOGNIZED_SERVICE"
        | "SERVICE_THRESHOLD_NOT_MET"
        | "PARTIAL_MONTH_UNSUPPORTED"
        | "MISSING_RATE"
        | "AMOUNT_OVERFLOW";
    };

/** Candidate-only § 14(2)(c) EG 3/4 monthly amount; not a complete § 14 allowance assessment. */
export function calculateAvrddDraftCareAllowance(
  input: AvrddDraftCareAllowanceInput,
): AvrddDraftCareAllowanceResult {
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
  const selection = resolveTariffSelection(pkg, input.variantId, input.regionId);
  if (
    selection?.familyId !== "avr-dd" ||
    selection.engineId !== "avr-dd-v1" ||
    Object.values(selection.capabilities).some((capability) => capability !== "UNSUPPORTED") ||
    !selection.groups.some((group) => group.id === input.groupId)
  )
    return { kind: "unavailable", reason: "UNKNOWN_SELECTION" };
  if (input.groupId !== "eg3" && input.groupId !== "eg4")
    return { kind: "unavailable", reason: "GROUP_NOT_ELIGIBLE" };
  if (input.careAndSupportWorkConfirmed === null)
    return { kind: "unavailable", reason: "CARE_WORK_UNCONFIRMED" };
  if (!input.careAndSupportWorkConfirmed)
    return { kind: "unavailable", reason: "CARE_WORK_NOT_CONFIRMED" };
  if (input.relevantEmploymentStartDate === null)
    return { kind: "unavailable", reason: "EMPLOYMENT_START_UNKNOWN" };
  try {
    if (
      !/^\d{4}-\d{2}-\d{2}$/u.test(input.relevantEmploymentStartDate) ||
      Temporal.PlainDate.from(input.relevantEmploymentStartDate).toString() !==
        input.relevantEmploymentStartDate ||
      input.relevantEmploymentStartDate > firstDate
    )
      return { kind: "unavailable", reason: "INVALID_EMPLOYMENT_START" };
  } catch {
    return { kind: "unavailable", reason: "INVALID_EMPLOYMENT_START" };
  }
  if (input.relevantEmploymentStartDate >= "2012-10-01") {
    if (input.recognizedEmploymentMonthsAtMonthStart === null)
      return { kind: "unavailable", reason: "RECOGNIZED_SERVICE_UNKNOWN" };
    if (
      !Number.isSafeInteger(input.recognizedEmploymentMonthsAtMonthStart) ||
      input.recognizedEmploymentMonthsAtMonthStart < 0
    )
      return { kind: "unavailable", reason: "INVALID_RECOGNIZED_SERVICE" };
    if (input.recognizedEmploymentMonthsAtMonthStart < 96)
      return { kind: "unavailable", reason: "SERVICE_THRESHOLD_NOT_MET" };
  }
  if (!input.fullMonthEntitlementConfirmed)
    return { kind: "unavailable", reason: "PARTIAL_MONTH_UNSUPPORTED" };
  const rates = pkg.rules.avrddCareAllowanceRates?.filter(
    (rate) => rate.validFrom <= firstDate && (rate.validTo === null || lastDate <= rate.validTo),
  );
  if (rates?.length !== 1) return { kind: "unavailable", reason: "MISSING_RATE" };
  const fullTimeMonthlyCents = rates[0].monthlyCents;
  const numerator = fullTimeMonthlyCents * input.contractedWeeklyMinutes;
  if (!Number.isSafeInteger(numerator)) return { kind: "unavailable", reason: "AMOUNT_OVERFLOW" };
  return {
    kind: "draft-confirmed-care-allowance",
    status: "estimated",
    completeGross: false,
    workMonth: input.workMonth,
    packageId: pkg.packageId,
    versionId: pkg.versionId,
    groupId: input.groupId,
    fullTimeMonthlyCents,
    amountCents: roundRemunerationCents(numerator, fullTimeWeeklyMinutes),
    sourceIds: rates[0].sourceIds,
  };
}
