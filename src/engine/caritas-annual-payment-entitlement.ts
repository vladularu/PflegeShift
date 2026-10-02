import type { RuleCaritasAnnualPaymentRule, RuleTariffPackage } from "@/rules/contracts.generated";
import { resolveTariffSelection } from "@/rules/tariff-selection";
import { validateRulePackage } from "@/rules/validation";

export type CaritasAnnualPaymentReductionException =
  | { readonly kind: "NONE" }
  | {
      /** Only Grundwehrdienst/Zivildienst under section 16(4), not voluntary military service. */
      readonly kind: "MILITARY_OR_CIVILIAN_SERVICE";
      readonly noTablePayDueToServiceConfirmed: boolean;
      readonly serviceEndDate: string;
      readonly immediateWorkResumptionConfirmed: boolean;
    }
  | {
      readonly kind: "MATERNITY_EMPLOYMENT_BAN";
      readonly statutoryMaternityBanConfirmed: boolean;
      readonly noTablePayDueToBanConfirmed: boolean;
    }
  | {
      readonly kind: "PARENTAL_LEAVE_BIRTH_YEAR";
      readonly noTablePayDueToBeegLeaveConfirmed: boolean;
      readonly birthDate: string;
      readonly payClaimBeforeLeaveConfirmed: boolean;
    }
  | { readonly kind: "SICK_PAY_SUPPLEMENT"; readonly paidSupplementConfirmed: boolean }
  | {
      readonly kind: "SICK_PAY_SUPPLEMENT_AMOUNT_BLOCKED";
      readonly onlySicknessBenefitAmountBlockedConfirmed: boolean;
    };

export interface CaritasAnnualPaymentEntitlementMonth {
  readonly month: string;
  readonly entgeltOrContinuationDays: number;
  readonly monthFactsConfirmed: boolean;
  readonly reductionException: CaritasAnnualPaymentReductionException;
}

export interface CaritasAnnualPaymentEntitlementInput {
  readonly pkg: RuleTariffPackage;
  readonly entitlementYear: number;
  readonly variantId: string;
  readonly regionId: string;
  readonly employmentStartDate: string;
  /** Inclusive last service day; null means an externally confirmed open end. */
  readonly employmentEndDate: string | null;
  readonly singleEmploymentHistoryConfirmed: boolean;
  readonly months: readonly CaritasAnnualPaymentEntitlementMonth[];
}

interface SourcePolicy {
  readonly packageId: string;
  readonly versionId: string;
  readonly entitlementYear: number;
  readonly variantId: string;
  readonly regionId: string;
  readonly eligibilityPolicy: RuleCaritasAnnualPaymentRule["eligibilityPolicy"];
  readonly reductionPolicy: RuleCaritasAnnualPaymentRule["reductionPolicy"];
  readonly ruleIds: readonly string[];
  readonly sourceIds: readonly string[];
}

type MonthDecision = Omit<CaritasAnnualPaymentEntitlementMonth, "monthFactsConfirmed"> & {
  readonly monthFactsConfirmed: true;
  readonly decision: "RETAINED_ENTGELT" | "RETAINED_EXCEPTION" | "REDUCED";
};

export type CaritasAnnualPaymentEntitlementResult =
  | {
      readonly kind: "personal-annual-payment-entitlement";
      readonly draft: true;
      readonly completeGross: false;
      readonly entitlementYear: number;
      readonly employmentStartDate: string;
      readonly employmentEndDate: string | null;
      readonly singleEmploymentHistoryConfirmed: true;
      readonly eligibility: {
        readonly eligible: boolean;
        readonly reason:
          | "EMPLOYED_ON_DECEMBER_1"
          | "ANLAGE_31_EARLY_EXIT"
          | "NOT_EMPLOYED_IN_YEAR"
          | "DECEMBER_1_REQUIREMENT_NOT_MET";
      };
      readonly retainedMonthCount: number;
      readonly reducedMonthCount: number;
      /** Independent month factor; this does not establish eligibility or a payout. */
      readonly reductionFactor: { readonly numerator: number; readonly denominator: 12 };
      readonly months: readonly MonthDecision[];
      readonly sourcePolicy: SourcePolicy;
    }
  | {
      readonly kind: "unavailable";
      readonly reason:
        | "EMPLOYMENT_HISTORY_UNCONFIRMED"
        | "INVALID_PACKAGE"
        | "OUTSIDE_ENTITLEMENT_YEAR"
        | "UNKNOWN_SELECTION"
        | "MISSING_ANNUAL_PAYMENT_RULE"
        | "INVALID_EMPLOYMENT_PERIOD"
        | "INVALID_MONTHS"
        | "MONTH_FACTS_UNCONFIRMED"
        | "INVALID_ENTGELT_DAYS"
        | "ENTGELT_OUTSIDE_EMPLOYMENT"
        | "UNKNOWN_REDUCTION_EXCEPTION"
        | "EXCEPTION_WITH_ENTGELT_DAYS"
        | "EXCEPTION_OUTSIDE_EMPLOYMENT"
        | "EXCEPTION_UNCONFIRMED"
        | "EXCEPTION_NOT_APPLICABLE";
    };

function dateValue(value: unknown): number | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(5, 7));
  const day = Number(value.slice(8, 10));
  if (year < 1900 || month < 1 || month > 12 || day < 1) return null;
  const result = Date.UTC(year, month - 1, day);
  const date = new Date(result);
  return date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
    ? result
    : null;
}

/** Assesses one confirmed employment history and sourced monthly facts; it never calculates money. */
export function assessCaritasAnnualPaymentEntitlement(
  input: CaritasAnnualPaymentEntitlementInput,
): CaritasAnnualPaymentEntitlementResult {
  if (input.singleEmploymentHistoryConfirmed !== true)
    return { kind: "unavailable", reason: "EMPLOYMENT_HISTORY_UNCONFIRMED" };
  const { pkg, entitlementYear, variantId, regionId } = input;
  if (pkg.engineContractVersion !== 14 || !validateRulePackage(pkg).ok)
    return { kind: "unavailable", reason: "INVALID_PACKAGE" };
  const referenceDate = `${entitlementYear}-09-01`;
  if (
    !Number.isSafeInteger(entitlementYear) ||
    ![2025, 2026].includes(entitlementYear) ||
    referenceDate < pkg.validFrom ||
    (pkg.validTo !== null && referenceDate > pkg.validTo)
  )
    return { kind: "unavailable", reason: "OUTSIDE_ENTITLEMENT_YEAR" };
  const selection = resolveTariffSelection(pkg, variantId, regionId);
  if (
    selection?.familyId !== "avr-caritas-p" ||
    selection.engineId !== "avr-caritas-p-v1" ||
    selection.region.payTableId === undefined ||
    Object.values(selection.capabilities).some((value) => value !== "UNSUPPORTED")
  )
    return { kind: "unavailable", reason: "UNKNOWN_SELECTION" };
  const rules = pkg.rules.caritasAnnualPaymentRules?.filter(
    (rule) =>
      rule.entitlementYear === entitlementYear &&
      rule.variantId === variantId &&
      rule.regionId === regionId,
  );
  if (!rules?.length) return { kind: "unavailable", reason: "MISSING_ANNUAL_PAYMENT_RULE" };
  const rule = rules[0];
  if (
    rules.some(
      (item) =>
        item.eligibilityPolicy !== rule.eligibilityPolicy ||
        item.reductionPolicy !== rule.reductionPolicy,
    )
  )
    return { kind: "unavailable", reason: "INVALID_PACKAGE" };
  const start = dateValue(input.employmentStartDate);
  const end =
    input.employmentEndDate === null
      ? Number.POSITIVE_INFINITY
      : dateValue(input.employmentEndDate);
  if (start === null || end === null || end < start)
    return { kind: "unavailable", reason: "INVALID_EMPLOYMENT_PERIOD" };
  if (!Array.isArray(input.months) || input.months.length !== 12)
    return { kind: "unavailable", reason: "INVALID_MONTHS" };
  const ordered = Array.from({ length: 12 }, (_, index) =>
    input.months.find(
      (item) => item?.month === `${entitlementYear}-${String(index + 1).padStart(2, "0")}`,
    ),
  );
  if (ordered.some((month) => month === undefined))
    return { kind: "unavailable", reason: "INVALID_MONTHS" };

  const december1 = Date.UTC(entitlementYear, 11, 1);
  const months: MonthDecision[] = [];
  for (const [index, item] of ordered.entries()) {
    if (!item) return { kind: "unavailable", reason: "INVALID_MONTHS" };
    if (item.monthFactsConfirmed !== true)
      return { kind: "unavailable", reason: "MONTH_FACTS_UNCONFIRMED" };
    const first = Date.UTC(entitlementYear, index, 1);
    const last = Date.UTC(entitlementYear, index + 1, 0);
    const monthDays = new Date(last).getUTCDate();
    const paidDays = item.entgeltOrContinuationDays;
    if (!Number.isSafeInteger(paidDays) || paidDays < 0 || paidDays > monthDays)
      return { kind: "unavailable", reason: "INVALID_ENTGELT_DAYS" };
    const employmentDays = Math.max(
      0,
      (Math.min(last, end) - Math.max(first, start)) / 86400000 + 1,
    );
    if (paidDays > employmentDays)
      return { kind: "unavailable", reason: "ENTGELT_OUTSIDE_EMPLOYMENT" };
    const exception = item.reductionException;
    if (
      !exception ||
      ![
        "NONE",
        "MILITARY_OR_CIVILIAN_SERVICE",
        "MATERNITY_EMPLOYMENT_BAN",
        "PARENTAL_LEAVE_BIRTH_YEAR",
        "SICK_PAY_SUPPLEMENT",
        "SICK_PAY_SUPPLEMENT_AMOUNT_BLOCKED",
      ].includes(exception.kind)
    )
      return { kind: "unavailable", reason: "UNKNOWN_REDUCTION_EXCEPTION" };
    if (paidDays > 0 && exception.kind !== "NONE")
      return { kind: "unavailable", reason: "EXCEPTION_WITH_ENTGELT_DAYS" };
    if (exception.kind !== "NONE" && employmentDays === 0)
      return { kind: "unavailable", reason: "EXCEPTION_OUTSIDE_EMPLOYMENT" };
    let confirmedException: CaritasAnnualPaymentReductionException;
    switch (exception.kind) {
      case "NONE":
        confirmedException = { kind: "NONE" };
        break;
      case "MILITARY_OR_CIVILIAN_SERVICE": {
        if (
          exception.noTablePayDueToServiceConfirmed !== true ||
          exception.immediateWorkResumptionConfirmed !== true
        )
          return { kind: "unavailable", reason: "EXCEPTION_UNCONFIRMED" };
        const serviceEnd = dateValue(exception.serviceEndDate);
        if (
          serviceEnd === null ||
          serviceEnd >= december1 ||
          serviceEnd < Math.max(first, start) ||
          serviceEnd > end
        )
          return { kind: "unavailable", reason: "EXCEPTION_NOT_APPLICABLE" };
        confirmedException = {
          kind: exception.kind,
          noTablePayDueToServiceConfirmed: true,
          serviceEndDate: exception.serviceEndDate,
          immediateWorkResumptionConfirmed: true,
        };
        break;
      }
      case "MATERNITY_EMPLOYMENT_BAN":
        if (
          exception.statutoryMaternityBanConfirmed !== true ||
          exception.noTablePayDueToBanConfirmed !== true
        )
          return { kind: "unavailable", reason: "EXCEPTION_UNCONFIRMED" };
        confirmedException = {
          kind: exception.kind,
          statutoryMaternityBanConfirmed: true,
          noTablePayDueToBanConfirmed: true,
        };
        break;
      case "PARENTAL_LEAVE_BIRTH_YEAR": {
        if (
          exception.noTablePayDueToBeegLeaveConfirmed !== true ||
          exception.payClaimBeforeLeaveConfirmed !== true
        )
          return { kind: "unavailable", reason: "EXCEPTION_UNCONFIRMED" };
        const birth = dateValue(exception.birthDate);
        if (
          birth === null ||
          exception.birthDate.slice(0, 4) !== String(entitlementYear) ||
          birth > Math.min(first, end)
        )
          return { kind: "unavailable", reason: "EXCEPTION_NOT_APPLICABLE" };
        confirmedException = {
          kind: exception.kind,
          noTablePayDueToBeegLeaveConfirmed: true,
          birthDate: exception.birthDate,
          payClaimBeforeLeaveConfirmed: true,
        };
        break;
      }
      case "SICK_PAY_SUPPLEMENT":
        if (exception.paidSupplementConfirmed !== true)
          return { kind: "unavailable", reason: "EXCEPTION_UNCONFIRMED" };
        confirmedException = { kind: exception.kind, paidSupplementConfirmed: true };
        break;
      case "SICK_PAY_SUPPLEMENT_AMOUNT_BLOCKED":
        if (exception.onlySicknessBenefitAmountBlockedConfirmed !== true)
          return { kind: "unavailable", reason: "EXCEPTION_UNCONFIRMED" };
        confirmedException = {
          kind: exception.kind,
          onlySicknessBenefitAmountBlockedConfirmed: true,
        };
        break;
    }
    months.push({
      month: item.month,
      entgeltOrContinuationDays: paidDays,
      monthFactsConfirmed: true,
      reductionException: confirmedException,
      decision:
        paidDays > 0
          ? "RETAINED_ENTGELT"
          : exception.kind === "NONE"
            ? "REDUCED"
            : "RETAINED_EXCEPTION",
    });
  }
  const yearFirst = Date.UTC(entitlementYear, 0, 1);
  const yearLast = Date.UTC(entitlementYear, 11, 31);
  const eligible = start <= december1 && end >= december1;
  const employedInYear = start <= yearLast && end >= yearFirst;
  const earlyExit =
    employedInYear && end < december1 && rule.eligibilityPolicy === "ANLAGE_31_SECTION_16_1_AND_6";
  const retainedMonthCount = months.filter((month) => month.decision !== "REDUCED").length;
  return {
    kind: "personal-annual-payment-entitlement",
    draft: true,
    completeGross: false,
    entitlementYear,
    employmentStartDate: input.employmentStartDate,
    employmentEndDate: input.employmentEndDate,
    singleEmploymentHistoryConfirmed: true,
    eligibility: {
      eligible: eligible || earlyExit,
      reason: eligible
        ? "EMPLOYED_ON_DECEMBER_1"
        : earlyExit
          ? "ANLAGE_31_EARLY_EXIT"
          : !employedInYear
            ? "NOT_EMPLOYED_IN_YEAR"
            : "DECEMBER_1_REQUIREMENT_NOT_MET",
    },
    retainedMonthCount,
    reducedMonthCount: 12 - retainedMonthCount,
    reductionFactor: { numerator: retainedMonthCount, denominator: 12 },
    months,
    sourcePolicy: {
      packageId: pkg.packageId,
      versionId: pkg.versionId,
      entitlementYear,
      variantId,
      regionId,
      eligibilityPolicy: rule.eligibilityPolicy,
      reductionPolicy: rule.reductionPolicy,
      ruleIds: rules.map((item) => item.id),
      sourceIds: [...new Set(rules.flatMap((item) => item.sourceIds))],
    },
  };
}
