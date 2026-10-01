import type { RuleCaritasAnnualPaymentRule, RuleTariffPackage } from "@/rules/contracts.generated";
import { resolveTariffSelection } from "@/rules/tariff-selection";
import { validateRulePackage } from "@/rules/validation";
import type {
  CaritasAnnualPaymentPaidMonth,
  CaritasAnnualPaymentRegularBasisInput,
} from "./caritas-annual-payment-regular-basis";

export interface CaritasAnnualPaymentLateEntryBasisInput {
  readonly pkg: RuleTariffPackage;
  readonly entitlementYear: number;
  readonly variantId: string;
  readonly regionId: string;
  readonly referenceCase: CaritasAnnualPaymentRegularBasisInput["referenceCase"];
  readonly lateEntryReferencePeriodConfirmed: boolean;
  readonly employmentStartDate: string;
  readonly employmentStartConfirmed: boolean;
  readonly sameEmploymentConfirmed: boolean;
  readonly firstFullMonth: CaritasAnnualPaymentPaidMonth;
}

type ConfirmedMonth = Omit<
  CaritasAnnualPaymentPaidMonth,
  "fullCalendarMonthEntgeltConfirmed" | "section16BasisConfirmed"
> & {
  readonly fullCalendarMonthEntgeltConfirmed: true;
  readonly section16BasisConfirmed: true;
};

/** Group-free provenance for the basis only; it does not choose a late-entry percentage. */
export interface CaritasAnnualPaymentLateEntrySourceBasis {
  readonly packageId: string;
  readonly versionId: string;
  readonly entitlementYear: number;
  readonly variantId: string;
  readonly regionId: string;
  readonly basisRegionId: string;
  readonly basisPayTableId: string;
  readonly basisPolicy: RuleCaritasAnnualPaymentRule["basisPolicy"];
  readonly basisTablePolicy: RuleCaritasAnnualPaymentRule["basisTablePolicy"];
  readonly basisRuleIds: readonly string[];
  readonly sourceIds: readonly string[];
}

export type CaritasAnnualPaymentLateEntryBasisResult =
  | {
      readonly kind: "personal-annual-payment-late-entry-basis";
      readonly draft: true;
      readonly completeGross: false;
      readonly entitlementYear: number;
      readonly referenceCase: "LATE_ENTRY";
      readonly lateEntryReferencePeriodConfirmed: true;
      readonly employmentStartDate: string;
      readonly employmentStartConfirmed: true;
      readonly sameEmploymentConfirmed: true;
      readonly firstFullMonth: ConfirmedMonth;
      readonly meanMonthlyBasis: { readonly numeratorCents: number; readonly denominator: 1 };
      readonly sourceBasis: CaritasAnnualPaymentLateEntrySourceBasis;
    }
  | {
      readonly kind: "unavailable";
      readonly reason:
        | "UNSUPPORTED_REFERENCE_CASE"
        | "REFERENCE_CASE_UNCONFIRMED"
        | "EMPLOYMENT_START_UNCONFIRMED"
        | "EMPLOYMENT_IDENTITY_UNCONFIRMED"
        | "INVALID_PACKAGE"
        | "OUTSIDE_ENTITLEMENT_YEAR"
        | "UNKNOWN_SELECTION"
        | "MISSING_ANNUAL_PAYMENT_RULE"
        | "INVALID_EMPLOYMENT_START"
        | "NOT_LATE_ENTRY"
        | "FIRST_FULL_MONTH_OUTSIDE_YEAR"
        | "INVALID_REFERENCE_MONTH"
        | "REFERENCE_MONTH_OUTSIDE_PACKAGE"
        | "REFERENCE_MONTH_INCOMPLETE"
        | "MONTH_BASIS_UNCONFIRMED"
        | "BASIS_IDENTITY_MISMATCH"
        | "INVALID_MONTH_BASIS";
    };

/** Uses a confirmed personal paid basis; claim, rate group, reduction and payout remain unresolved. */
export function calculateCaritasAnnualPaymentLateEntryBasis(
  input: CaritasAnnualPaymentLateEntryBasisInput,
): CaritasAnnualPaymentLateEntryBasisResult {
  if (input.referenceCase !== "LATE_ENTRY")
    return { kind: "unavailable", reason: "UNSUPPORTED_REFERENCE_CASE" };
  if (input.lateEntryReferencePeriodConfirmed !== true)
    return { kind: "unavailable", reason: "REFERENCE_CASE_UNCONFIRMED" };
  if (input.employmentStartConfirmed !== true)
    return { kind: "unavailable", reason: "EMPLOYMENT_START_UNCONFIRMED" };
  if (input.sameEmploymentConfirmed !== true)
    return { kind: "unavailable", reason: "EMPLOYMENT_IDENTITY_UNCONFIRMED" };
  const { pkg, entitlementYear, variantId, regionId } = input;
  if (pkg.engineContractVersion !== 14 || !validateRulePackage(pkg).ok)
    return { kind: "unavailable", reason: "INVALID_PACKAGE" };
  const annualReferenceDate = `${entitlementYear}-09-01`;
  if (
    !Number.isSafeInteger(entitlementYear) ||
    ![2025, 2026].includes(entitlementYear) ||
    annualReferenceDate < pkg.validFrom ||
    (pkg.validTo !== null && annualReferenceDate > pkg.validTo)
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
  const basisPayTableId = pkg.rules.selection?.variants
    .find((item) => item.id === variantId)
    ?.regions.find((region) => region.id === rule.basisRegionId)?.payTableId;
  if (
    basisPayTableId === undefined ||
    rules.some(
      (item) =>
        item.basisRegionId !== rule.basisRegionId ||
        item.basisPolicy !== rule.basisPolicy ||
        item.basisTablePolicy !== rule.basisTablePolicy,
    )
  )
    return { kind: "unavailable", reason: "INVALID_PACKAGE" };

  const start = input.employmentStartDate;
  const match = typeof start === "string" ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(start) : null;
  if (!match) return { kind: "unavailable", reason: "INVALID_EMPLOYMENT_START" };
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const calendarDays = new Date(Date.UTC(year, month, 0)).getUTCDate();
  if (year !== entitlementYear || month < 1 || month > 12 || day < 1 || day > calendarDays)
    return { kind: "unavailable", reason: "INVALID_EMPLOYMENT_START" };
  if (month <= 9) return { kind: "unavailable", reason: "NOT_LATE_ENTRY" };
  const firstMonth = day === 1 ? month : month + 1;
  if (firstMonth > 12) return { kind: "unavailable", reason: "FIRST_FULL_MONTH_OUTSIDE_YEAR" };
  const expectedMonth = `${year}-${String(firstMonth).padStart(2, "0")}`;
  const paid = input.firstFullMonth;
  if (!paid || paid.month !== expectedMonth)
    return { kind: "unavailable", reason: "INVALID_REFERENCE_MONTH" };
  const lastDay = new Date(Date.UTC(year, firstMonth, 0)).getUTCDate();
  if (
    `${expectedMonth}-01` < pkg.validFrom ||
    (pkg.validTo !== null && `${expectedMonth}-${lastDay}` > pkg.validTo)
  )
    return { kind: "unavailable", reason: "REFERENCE_MONTH_OUTSIDE_PACKAGE" };
  if (paid.fullCalendarMonthEntgeltConfirmed !== true)
    return { kind: "unavailable", reason: "REFERENCE_MONTH_INCOMPLETE" };
  if (paid.section16BasisConfirmed !== true)
    return { kind: "unavailable", reason: "MONTH_BASIS_UNCONFIRMED" };
  if (paid.basisRegionId !== rule.basisRegionId || paid.basisPayTableId !== basisPayTableId)
    return { kind: "unavailable", reason: "BASIS_IDENTITY_MISMATCH" };
  const amount = paid.personalPaidBasisCents;
  if (!Number.isSafeInteger(amount) || amount <= 0)
    return { kind: "unavailable", reason: "INVALID_MONTH_BASIS" };
  return {
    kind: "personal-annual-payment-late-entry-basis",
    draft: true,
    completeGross: false,
    entitlementYear,
    referenceCase: "LATE_ENTRY",
    lateEntryReferencePeriodConfirmed: true,
    employmentStartDate: start,
    employmentStartConfirmed: true,
    sameEmploymentConfirmed: true,
    firstFullMonth: {
      month: paid.month,
      personalPaidBasisCents: amount,
      basisRegionId: paid.basisRegionId,
      basisPayTableId: paid.basisPayTableId,
      fullCalendarMonthEntgeltConfirmed: true,
      section16BasisConfirmed: true,
    },
    meanMonthlyBasis: { numeratorCents: amount, denominator: 1 },
    sourceBasis: {
      packageId: pkg.packageId,
      versionId: pkg.versionId,
      entitlementYear,
      variantId,
      regionId,
      basisRegionId: rule.basisRegionId,
      basisPayTableId,
      basisPolicy: rule.basisPolicy,
      basisTablePolicy: rule.basisTablePolicy,
      basisRuleIds: rules.map((item) => item.id),
      sourceIds: [...new Set(rules.flatMap((item) => item.sourceIds))],
    },
  };
}
