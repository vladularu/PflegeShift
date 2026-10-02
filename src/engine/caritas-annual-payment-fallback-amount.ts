import {
  roundCaritasAnnualPaymentAmount,
  type CaritasAnnualPaymentRoundedAmount,
} from "./caritas-annual-payment-amount-rounding";
import {
  assessCaritasAnnualPaymentEntitlement,
  type CaritasAnnualPaymentEntitlementInput,
  type CaritasAnnualPaymentEntitlementResult,
} from "./caritas-annual-payment-entitlement";
import {
  calculateCaritasAnnualPaymentFallbackBasis,
  type CaritasAnnualPaymentFallbackBasisInput,
  type CaritasAnnualPaymentFallbackBasisResult,
} from "./caritas-annual-payment-fallback-basis";

export interface CaritasAnnualPaymentFallbackAmountInput
  extends CaritasAnnualPaymentFallbackBasisInput, CaritasAnnualPaymentEntitlementInput {
  /** Externally confirmed applicability of section 16(2), sentence 4, to the reference period. */
  readonly parentalLeavePartTimeBasis: "NOT_APPLICABLE" | "APPLICABLE" | "UNKNOWN";
}

type Basis = Extract<
  CaritasAnnualPaymentFallbackBasisResult,
  { kind: "personal-annual-payment-fallback-basis" }
>;
type Entitlement = Extract<
  CaritasAnnualPaymentEntitlementResult,
  { kind: "personal-annual-payment-entitlement" }
>;
type RoundedAmount = Extract<
  CaritasAnnualPaymentRoundedAmount,
  { kind: "rounded-annual-payment-amount" }
>;

export type CaritasAnnualPaymentFallbackAmountResult =
  | (Omit<RoundedAmount, "kind"> & {
      readonly kind: "personal-annual-payment-fallback-amount";
      readonly draft: true;
      readonly completeGross: false;
      readonly entitlementYear: number;
      readonly basis: Basis;
      readonly entitlement: Entitlement;
      readonly parentalLeavePartTimeBasis: "NOT_APPLICABLE";
    })
  | Extract<
      | CaritasAnnualPaymentFallbackBasisResult
      | CaritasAnnualPaymentEntitlementResult
      | CaritasAnnualPaymentRoundedAmount,
      { kind: "unavailable" }
    >
  | {
      readonly kind: "unavailable";
      readonly reason:
        | "UNSUPPORTED_SPECIAL_BASIS"
        | "UNSUPPORTED_EMPLOYMENT_PERIOD"
        | "REFERENCE_MONTH_FACTS_MISMATCH"
        | "REPLACEMENT_OUTSIDE_EMPLOYMENT"
        | "REPLACEMENT_MONTH_FACTS_MISMATCH";
    };

/** A confirmed historical replacement component; historical payroll is not reconstructed. */
export function calculateCaritasAnnualPaymentFallbackAmount(
  input: CaritasAnnualPaymentFallbackAmountInput,
): CaritasAnnualPaymentFallbackAmountResult {
  if (input.parentalLeavePartTimeBasis !== "NOT_APPLICABLE")
    return { kind: "unavailable", reason: "UNSUPPORTED_SPECIAL_BASIS" };
  const basis = calculateCaritasAnnualPaymentFallbackBasis(input);
  if (basis.kind === "unavailable") return basis;
  const entitlement = assessCaritasAnnualPaymentEntitlement(input);
  if (entitlement.kind === "unavailable") return entitlement;
  if (
    !entitlement.eligibility.eligible ||
    entitlement.eligibility.reason !== "EMPLOYED_ON_DECEMBER_1"
  )
    return { kind: "unavailable", reason: "UNSUPPORTED_EMPLOYMENT_PERIOD" };

  const employmentStart = Date.parse(entitlement.employmentStartDate);
  const employmentEnd =
    entitlement.employmentEndDate === null
      ? Number.POSITIVE_INFINITY
      : Date.parse(entitlement.employmentEndDate);
  const replacement = basis.replacementMonth;
  const replacementYear = Number(replacement.month.slice(0, 4));
  const replacementNumber = Number(replacement.month.slice(5, 7));
  const replacementFirst = Date.UTC(replacementYear, replacementNumber - 1, 1);
  const replacementLast = Date.UTC(replacementYear, replacementNumber, 0);
  if (replacementFirst < employmentStart || replacementLast > employmentEnd)
    return { kind: "unavailable", reason: "REPLACEMENT_OUTSIDE_EMPLOYMENT" };
  if (replacementYear === input.entitlementYear) {
    const facts = entitlement.months.find((month) => month.month === replacement.month);
    if (facts?.entgeltOrContinuationDays !== new Date(replacementLast).getUTCDate())
      return { kind: "unavailable", reason: "REPLACEMENT_MONTH_FACTS_MISMATCH" };
  }
  for (const [index, month] of entitlement.months.entries()) {
    if (
      month.month > replacement.month &&
      month.month < `${input.entitlementYear}-07` &&
      month.entgeltOrContinuationDays ===
        new Date(Date.UTC(input.entitlementYear, index + 1, 0)).getUTCDate()
    )
      return { kind: "unavailable", reason: "REPLACEMENT_MONTH_FACTS_MISMATCH" };
  }
  for (const [index, month] of basis.referenceMonths.entries()) {
    const facts = entitlement.months.find((item) => item.month === month.month);
    const first = Date.UTC(input.entitlementYear, index + 6, 1);
    const last = Date.UTC(input.entitlementYear, index + 7, 0);
    const employmentDays = Math.max(
      0,
      (Math.min(last, employmentEnd) - Math.max(first, employmentStart)) / 86400000 + 1,
    );
    if (
      facts?.entgeltOrContinuationDays !== month.entgeltCalendarDays ||
      month.entgeltCalendarDays + month.sickPaySupplementCalendarDays > employmentDays ||
      (month.entgeltCalendarDays === 0 &&
        ((month.sickPaySupplementCalendarDays > 0 &&
          facts.reductionException.kind !== "SICK_PAY_SUPPLEMENT") ||
          (month.sickPaySupplementCalendarDays === 0 &&
            facts.reductionException.kind === "SICK_PAY_SUPPLEMENT")))
    )
      return { kind: "unavailable", reason: "REFERENCE_MONTH_FACTS_MISMATCH" };
  }
  const amount = roundCaritasAnnualPaymentAmount(
    input.pkg,
    input.entitlementYear,
    basis,
    entitlement.reductionFactor,
  );
  if (amount.kind === "unavailable") return amount;
  return {
    ...amount,
    kind: "personal-annual-payment-fallback-amount",
    draft: true,
    completeGross: false,
    entitlementYear: input.entitlementYear,
    basis,
    entitlement,
    parentalLeavePartTimeBasis: "NOT_APPLICABLE",
  };
}
