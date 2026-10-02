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
  calculateCaritasAnnualPaymentPartialBasis,
  type CaritasAnnualPaymentPartialBasisInput,
  type CaritasAnnualPaymentPartialBasisResult,
} from "./caritas-annual-payment-partial-basis";

export interface CaritasAnnualPaymentPartialAmountInput
  extends CaritasAnnualPaymentPartialBasisInput, CaritasAnnualPaymentEntitlementInput {
  /** Externally confirmed applicability of section 16(2), sentence 4, to the reference period. */
  readonly parentalLeavePartTimeBasis: "NOT_APPLICABLE" | "APPLICABLE" | "UNKNOWN";
}

type Basis = Extract<
  CaritasAnnualPaymentPartialBasisResult,
  { kind: "personal-annual-payment-partial-basis" }
>;
type Entitlement = Extract<
  CaritasAnnualPaymentEntitlementResult,
  { kind: "personal-annual-payment-entitlement" }
>;
type RoundedAmount = Extract<
  CaritasAnnualPaymentRoundedAmount,
  { kind: "rounded-annual-payment-amount" }
>;

export type CaritasAnnualPaymentPartialAmountResult =
  | (Omit<RoundedAmount, "kind"> & {
      readonly kind: "personal-annual-payment-partial-amount";
      readonly draft: true;
      readonly completeGross: false;
      readonly entitlementYear: number;
      readonly basis: Basis;
      readonly entitlement: Entitlement;
      readonly parentalLeavePartTimeBasis: "NOT_APPLICABLE";
    })
  | Extract<
      | CaritasAnnualPaymentPartialBasisResult
      | CaritasAnnualPaymentEntitlementResult
      | CaritasAnnualPaymentRoundedAmount,
      { kind: "unavailable" }
    >
  | {
      readonly kind: "unavailable";
      readonly reason:
        | "UNSUPPORTED_SPECIAL_BASIS"
        | "UNSUPPORTED_EMPLOYMENT_PERIOD"
        | "REFERENCE_MONTH_FACTS_MISMATCH";
    };

/** A confirmed partial-reference annual component, without UI or a complete-gross claim. */
export function calculateCaritasAnnualPaymentPartialAmount(
  input: CaritasAnnualPaymentPartialAmountInput,
): CaritasAnnualPaymentPartialAmountResult {
  if (input.parentalLeavePartTimeBasis !== "NOT_APPLICABLE")
    return { kind: "unavailable", reason: "UNSUPPORTED_SPECIAL_BASIS" };
  const basis = calculateCaritasAnnualPaymentPartialBasis(input);
  if (basis.kind === "unavailable") return basis;
  const entitlement = assessCaritasAnnualPaymentEntitlement(input);
  if (entitlement.kind === "unavailable") return entitlement;
  if (
    entitlement.employmentStartDate > `${input.entitlementYear}-09-01` ||
    !entitlement.eligibility.eligible ||
    entitlement.eligibility.reason !== "EMPLOYED_ON_DECEMBER_1"
  )
    return { kind: "unavailable", reason: "UNSUPPORTED_EMPLOYMENT_PERIOD" };

  const employmentStart = Date.parse(entitlement.employmentStartDate);
  const employmentEnd =
    entitlement.employmentEndDate === null
      ? Number.POSITIVE_INFINITY
      : Date.parse(entitlement.employmentEndDate);
  for (const [index, month] of basis.paidMonths.entries()) {
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
    kind: "personal-annual-payment-partial-amount",
    draft: true,
    completeGross: false,
    entitlementYear: input.entitlementYear,
    basis,
    entitlement,
    parentalLeavePartTimeBasis: "NOT_APPLICABLE",
  };
}
