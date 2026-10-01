import type { RuleTariffPackage } from "@/rules/contracts.generated";
import {
  lookupCaritasAnnualPaymentRule,
  type CaritasAnnualPaymentRuleLookup,
} from "./caritas-annual-payment-rule";

export interface CaritasAnnualPaymentPaidMonth {
  readonly month: string;
  readonly personalPaidBasisCents: number;
  readonly basisRegionId: string;
  readonly basisPayTableId: string;
  readonly fullCalendarMonthEntgeltConfirmed: boolean;
  readonly section16BasisConfirmed: boolean;
}

export interface CaritasAnnualPaymentRegularBasisInput {
  readonly pkg: RuleTariffPackage;
  readonly entitlementYear: number;
  readonly variantId: string;
  readonly regionId: string;
  readonly groupIdAtSeptember1: string;
  readonly septemberGroupConfirmed: boolean;
  readonly referenceCase:
    | "ORDINARY_FULL_MONTHS"
    | "PARTIAL_MONTHS"
    | "SICK_PAY_SUPPLEMENT"
    | "LATE_ENTRY"
    | "PARENTAL_LEAVE"
    | "EARLY_EXIT"
    | "UNKNOWN";
  readonly ordinaryReferencePeriodConfirmed: boolean;
  readonly paidMonths: readonly CaritasAnnualPaymentPaidMonth[];
}

type AnnualRule = Extract<CaritasAnnualPaymentRuleLookup, { kind: "source-annual-payment-rule" }>;
type LookupReason = Extract<CaritasAnnualPaymentRuleLookup, { kind: "unavailable" }>["reason"];
type ConfirmedMonth = Omit<
  CaritasAnnualPaymentPaidMonth,
  "fullCalendarMonthEntgeltConfirmed" | "section16BasisConfirmed"
> & {
  readonly fullCalendarMonthEntgeltConfirmed: true;
  readonly section16BasisConfirmed: true;
};

export type CaritasAnnualPaymentRegularBasisResult =
  | {
      readonly kind: "personal-annual-payment-regular-basis";
      readonly draft: true;
      readonly completeGross: false;
      readonly entitlementYear: number;
      readonly groupIdAtSeptember1: string;
      readonly groupReferenceDate: string;
      readonly septemberGroupConfirmed: true;
      readonly referenceCase: "ORDINARY_FULL_MONTHS";
      readonly ordinaryReferencePeriodConfirmed: true;
      readonly paidMonths: readonly ConfirmedMonth[];
      /** Exact personal reference mean in cents; no intermediate cent rounding. */
      readonly meanMonthlyBasis: {
        readonly numeratorCents: number;
        readonly denominator: 3;
      };
      readonly annualRule: AnnualRule;
    }
  | {
      readonly kind: "unavailable";
      readonly reason:
        | LookupReason
        | "UNSUPPORTED_REFERENCE_CASE"
        | "REFERENCE_CASE_UNCONFIRMED"
        | "REFERENCE_GROUP_UNCONFIRMED"
        | "INVALID_REFERENCE_MONTHS"
        | "REFERENCE_MONTH_INCOMPLETE"
        | "MONTH_BASIS_UNCONFIRMED"
        | "BASIS_IDENTITY_MISMATCH"
        | "INVALID_MONTH_BASIS"
        | "AMOUNT_OVERFLOW";
    };

/** Uses externally confirmed paid bases; it does not determine entitlement or an annual amount. */
export function calculateCaritasAnnualPaymentRegularBasis(
  input: CaritasAnnualPaymentRegularBasisInput,
): CaritasAnnualPaymentRegularBasisResult {
  if (input.referenceCase !== "ORDINARY_FULL_MONTHS")
    return { kind: "unavailable", reason: "UNSUPPORTED_REFERENCE_CASE" };
  if (input.ordinaryReferencePeriodConfirmed !== true)
    return { kind: "unavailable", reason: "REFERENCE_CASE_UNCONFIRMED" };
  if (input.septemberGroupConfirmed !== true)
    return { kind: "unavailable", reason: "REFERENCE_GROUP_UNCONFIRMED" };

  const annualRule = lookupCaritasAnnualPaymentRule(
    input.pkg,
    input.entitlementYear,
    input.variantId,
    input.regionId,
    input.groupIdAtSeptember1,
  );
  if (annualRule.kind === "unavailable") return annualRule;
  if (!Array.isArray(input.paidMonths) || input.paidMonths.length !== 3)
    return { kind: "unavailable", reason: "INVALID_REFERENCE_MONTHS" };
  const expectedMonths = annualRule.referenceMonths.map(
    (month) => `${input.entitlementYear}-${String(month).padStart(2, "0")}`,
  );
  const ordered = expectedMonths.map((month) =>
    input.paidMonths.find((item) => item?.month === month),
  );
  if (ordered.some((item) => item === undefined))
    return { kind: "unavailable", reason: "INVALID_REFERENCE_MONTHS" };

  let numeratorCents = 0;
  const paidMonths: ConfirmedMonth[] = [];
  for (const item of ordered) {
    if (!item) return { kind: "unavailable", reason: "INVALID_REFERENCE_MONTHS" };
    if (item.fullCalendarMonthEntgeltConfirmed !== true)
      return { kind: "unavailable", reason: "REFERENCE_MONTH_INCOMPLETE" };
    if (item.section16BasisConfirmed !== true)
      return { kind: "unavailable", reason: "MONTH_BASIS_UNCONFIRMED" };
    if (
      item.basisRegionId !== annualRule.basisRegionId ||
      item.basisPayTableId !== annualRule.basisPayTableId
    )
      return { kind: "unavailable", reason: "BASIS_IDENTITY_MISMATCH" };
    const amount = item.personalPaidBasisCents;
    if (!Number.isSafeInteger(amount) || amount <= 0)
      return { kind: "unavailable", reason: "INVALID_MONTH_BASIS" };
    if (numeratorCents > Number.MAX_SAFE_INTEGER - amount)
      return { kind: "unavailable", reason: "AMOUNT_OVERFLOW" };
    numeratorCents += amount;
    paidMonths.push({
      month: item.month,
      personalPaidBasisCents: amount,
      basisRegionId: item.basisRegionId,
      basisPayTableId: item.basisPayTableId,
      fullCalendarMonthEntgeltConfirmed: true,
      section16BasisConfirmed: true,
    });
  }

  return {
    kind: "personal-annual-payment-regular-basis",
    draft: true,
    completeGross: false,
    entitlementYear: input.entitlementYear,
    groupIdAtSeptember1: input.groupIdAtSeptember1,
    groupReferenceDate: `${input.entitlementYear}-09-01`,
    septemberGroupConfirmed: true,
    referenceCase: "ORDINARY_FULL_MONTHS",
    ordinaryReferencePeriodConfirmed: true,
    paidMonths,
    meanMonthlyBasis: { numeratorCents, denominator: 3 },
    annualRule,
  };
}
