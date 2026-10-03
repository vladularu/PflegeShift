import {
  roundCaritasAnnualPaymentAmount,
  type CaritasAnnualPaymentRoundedAmount,
} from "./caritas-annual-payment-amount-rounding";
import {
  assessCaritasAnnualPaymentEntitlement,
  type CaritasAnnualPaymentEntitlementInput,
  type CaritasAnnualPaymentEntitlementResult,
} from "./caritas-annual-payment-entitlement";
import type { CaritasAnnualPaymentRegularBasisInput } from "./caritas-annual-payment-regular-basis";
import {
  lookupCaritasAnnualPaymentRule,
  type CaritasAnnualPaymentRuleLookup,
} from "./caritas-annual-payment-rule";

export interface CaritasAnnualPaymentEarlyExitMonth {
  readonly month: string;
  readonly personalTablePayCents: number;
  /** Only allowances fixed as monthly amounts under Anlage 31 section 16(6). */
  readonly personalFixedMonthlyAllowancesCents: number;
  readonly basisRegionId: string;
  readonly basisPayTableId: string;
  readonly fullCalendarMonthEntgeltConfirmed: boolean;
  readonly section16Paragraph6ComponentsConfirmed: boolean;
}

export interface CaritasAnnualPaymentEarlyExitAmountInput extends CaritasAnnualPaymentEntitlementInput {
  readonly groupIdAtSeptember1: string;
  readonly septemberGroupConfirmed: boolean;
  readonly referenceCase: CaritasAnnualPaymentRegularBasisInput["referenceCase"];
  readonly earlyExitReferencePeriodConfirmed: boolean;
  readonly parentalLeavePartTimeBasis: "NOT_APPLICABLE" | "APPLICABLE" | "UNKNOWN";
  readonly lastFullMonth: CaritasAnnualPaymentEarlyExitMonth;
}

type AnnualRule = Extract<CaritasAnnualPaymentRuleLookup, { kind: "source-annual-payment-rule" }>;
type Entitlement = Extract<
  CaritasAnnualPaymentEntitlementResult,
  { kind: "personal-annual-payment-entitlement" }
>;
type ConfirmedMonth = Omit<
  CaritasAnnualPaymentEarlyExitMonth,
  "fullCalendarMonthEntgeltConfirmed" | "section16Paragraph6ComponentsConfirmed"
> & {
  readonly fullCalendarMonthEntgeltConfirmed: true;
  readonly section16Paragraph6ComponentsConfirmed: true;
};
interface EarlyExitBasis {
  readonly kind: "personal-annual-payment-early-exit-basis";
  readonly draft: true;
  readonly completeGross: false;
  readonly entitlementYear: number;
  readonly groupIdAtSeptember1: string;
  readonly groupReferenceDate: string;
  readonly septemberGroupConfirmed: true;
  readonly referenceCase: "EARLY_EXIT";
  readonly earlyExitReferencePeriodConfirmed: true;
  readonly lastFullMonth: ConfirmedMonth;
  readonly meanMonthlyBasis: { readonly numeratorCents: number; readonly denominator: 1 };
  readonly annualRule: AnnualRule;
}

export type CaritasAnnualPaymentEarlyExitAmountResult =
  | (Omit<
      Extract<CaritasAnnualPaymentRoundedAmount, { kind: "rounded-annual-payment-amount" }>,
      "kind"
    > & {
      readonly kind: "personal-annual-payment-early-exit-amount";
      readonly draft: true;
      readonly completeGross: false;
      readonly entitlementYear: number;
      readonly basis: EarlyExitBasis;
      readonly entitlement: Entitlement;
      readonly parentalLeavePartTimeBasis: "NOT_APPLICABLE";
    })
  | Extract<
      | CaritasAnnualPaymentRuleLookup
      | CaritasAnnualPaymentEntitlementResult
      | CaritasAnnualPaymentRoundedAmount,
      { kind: "unavailable" }
    >
  | {
      readonly kind: "unavailable";
      readonly reason:
        | "UNSUPPORTED_REFERENCE_CASE"
        | "REFERENCE_CASE_UNCONFIRMED"
        | "REFERENCE_GROUP_UNCONFIRMED"
        | "UNSUPPORTED_SPECIAL_BASIS"
        | "UNSUPPORTED_EARLY_EXIT"
        | "EARLY_EXIT_RATE_REFERENCE_UNRESOLVED"
        | "NO_FULL_EMPLOYMENT_MONTH"
        | "INVALID_REFERENCE_MONTH"
        | "REFERENCE_MONTH_OUTSIDE_PACKAGE"
        | "REFERENCE_MONTH_INCOMPLETE"
        | "MONTH_COMPONENTS_UNCONFIRMED"
        | "BASIS_IDENTITY_MISMATCH"
        | "INVALID_MONTH_COMPONENTS"
        | "REFERENCE_MONTH_FACTS_MISMATCH";
    };

/** Confirmed fully paid last employment month; September 1 group and section 16(6) components only. */
export function calculateCaritasAnnualPaymentEarlyExitAmount(
  input: CaritasAnnualPaymentEarlyExitAmountInput,
): CaritasAnnualPaymentEarlyExitAmountResult {
  if (input.referenceCase !== "EARLY_EXIT")
    return { kind: "unavailable", reason: "UNSUPPORTED_REFERENCE_CASE" };
  if (input.earlyExitReferencePeriodConfirmed !== true)
    return { kind: "unavailable", reason: "REFERENCE_CASE_UNCONFIRMED" };
  if (input.septemberGroupConfirmed !== true)
    return { kind: "unavailable", reason: "REFERENCE_GROUP_UNCONFIRMED" };
  if (input.parentalLeavePartTimeBasis !== "NOT_APPLICABLE")
    return { kind: "unavailable", reason: "UNSUPPORTED_SPECIAL_BASIS" };

  const entitlement = assessCaritasAnnualPaymentEntitlement(input);
  if (entitlement.kind === "unavailable") return entitlement;
  if (
    input.variantId !== "ANLAGE_31" ||
    !entitlement.eligibility.eligible ||
    entitlement.eligibility.reason !== "ANLAGE_31_EARLY_EXIT" ||
    entitlement.employmentEndDate === null
  )
    return { kind: "unavailable", reason: "UNSUPPORTED_EARLY_EXIT" };
  const groupReferenceDate = `${input.entitlementYear}-09-01`;
  if (
    entitlement.employmentStartDate > groupReferenceDate ||
    entitlement.employmentEndDate < groupReferenceDate
  )
    return { kind: "unavailable", reason: "EARLY_EXIT_RATE_REFERENCE_UNRESOLVED" };

  const annualRule = lookupCaritasAnnualPaymentRule(
    input.pkg,
    input.entitlementYear,
    input.variantId,
    input.regionId,
    input.groupIdAtSeptember1,
  );
  if (annualRule.kind === "unavailable") return annualRule;
  const end = new Date(entitlement.employmentEndDate);
  const endMonth = end.getUTCMonth();
  const endMonthDays = new Date(Date.UTC(input.entitlementYear, endMonth + 1, 0)).getUTCDate();
  const referenceIndex = end.getUTCDate() === endMonthDays ? endMonth : endMonth - 1;
  const first = new Date(Date.UTC(input.entitlementYear, referenceIndex, 1))
    .toISOString()
    .slice(0, 10);
  const last = new Date(Date.UTC(input.entitlementYear, referenceIndex + 1, 0))
    .toISOString()
    .slice(0, 10);
  if (first < entitlement.employmentStartDate)
    return { kind: "unavailable", reason: "NO_FULL_EMPLOYMENT_MONTH" };
  const paid = input.lastFullMonth;
  if (!paid || paid.month !== first.slice(0, 7))
    return { kind: "unavailable", reason: "INVALID_REFERENCE_MONTH" };
  if (first < input.pkg.validFrom || (input.pkg.validTo !== null && last > input.pkg.validTo))
    return { kind: "unavailable", reason: "REFERENCE_MONTH_OUTSIDE_PACKAGE" };
  if (paid.fullCalendarMonthEntgeltConfirmed !== true)
    return { kind: "unavailable", reason: "REFERENCE_MONTH_INCOMPLETE" };
  if (paid.section16Paragraph6ComponentsConfirmed !== true)
    return { kind: "unavailable", reason: "MONTH_COMPONENTS_UNCONFIRMED" };
  if (
    paid.basisRegionId !== annualRule.basisRegionId ||
    paid.basisPayTableId !== annualRule.basisPayTableId
  )
    return { kind: "unavailable", reason: "BASIS_IDENTITY_MISMATCH" };
  if (
    !Number.isSafeInteger(paid.personalTablePayCents) ||
    paid.personalTablePayCents <= 0 ||
    !Number.isSafeInteger(paid.personalFixedMonthlyAllowancesCents) ||
    paid.personalFixedMonthlyAllowancesCents < 0
  )
    return { kind: "unavailable", reason: "INVALID_MONTH_COMPONENTS" };
  if (
    paid.personalTablePayCents >
    Number.MAX_SAFE_INTEGER - paid.personalFixedMonthlyAllowancesCents
  )
    return { kind: "unavailable", reason: "AMOUNT_OVERFLOW" };
  const facts = entitlement.months.find((item) => item.month === paid.month);
  const calendarDays = new Date(
    Date.UTC(input.entitlementYear, referenceIndex + 1, 0),
  ).getUTCDate();
  if (facts?.entgeltOrContinuationDays !== calendarDays || facts.reductionException.kind !== "NONE")
    return { kind: "unavailable", reason: "REFERENCE_MONTH_FACTS_MISMATCH" };

  const basis: EarlyExitBasis = {
    kind: "personal-annual-payment-early-exit-basis",
    draft: true,
    completeGross: false,
    entitlementYear: input.entitlementYear,
    groupIdAtSeptember1: input.groupIdAtSeptember1,
    groupReferenceDate,
    septemberGroupConfirmed: true,
    referenceCase: "EARLY_EXIT",
    earlyExitReferencePeriodConfirmed: true,
    lastFullMonth: {
      month: paid.month,
      personalTablePayCents: paid.personalTablePayCents,
      personalFixedMonthlyAllowancesCents: paid.personalFixedMonthlyAllowancesCents,
      basisRegionId: paid.basisRegionId,
      basisPayTableId: paid.basisPayTableId,
      fullCalendarMonthEntgeltConfirmed: true,
      section16Paragraph6ComponentsConfirmed: true,
    },
    meanMonthlyBasis: {
      numeratorCents: paid.personalTablePayCents + paid.personalFixedMonthlyAllowancesCents,
      denominator: 1,
    },
    annualRule,
  };
  const amount = roundCaritasAnnualPaymentAmount(
    input.pkg,
    input.entitlementYear,
    basis,
    entitlement.reductionFactor,
  );
  if (amount.kind === "unavailable") return amount;
  return {
    ...amount,
    kind: "personal-annual-payment-early-exit-amount",
    draft: true,
    completeGross: false,
    entitlementYear: input.entitlementYear,
    basis,
    entitlement,
    parentalLeavePartTimeBasis: "NOT_APPLICABLE",
  };
}
