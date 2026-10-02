import {
  assessCaritasAnnualPaymentEntitlement,
  type CaritasAnnualPaymentEntitlementInput,
  type CaritasAnnualPaymentEntitlementResult,
} from "./caritas-annual-payment-entitlement";
import {
  calculateCaritasAnnualPaymentLateEntryBasis,
  type CaritasAnnualPaymentLateEntryBasisInput,
  type CaritasAnnualPaymentLateEntryBasisResult,
} from "./caritas-annual-payment-late-entry-basis";

export interface CaritasAnnualPaymentLateEntryAssessmentInput
  extends CaritasAnnualPaymentLateEntryBasisInput, CaritasAnnualPaymentEntitlementInput {
  /** The special birth-year parental-leave part-time basis needs a separate assessment. */
  readonly parentalLeavePartTimeBasis: "NOT_APPLICABLE" | "APPLICABLE" | "UNKNOWN";
}

type ConfirmedBasis = Extract<
  CaritasAnnualPaymentLateEntryBasisResult,
  { kind: "personal-annual-payment-late-entry-basis" }
>;
type ConfirmedEntitlement = Extract<
  CaritasAnnualPaymentEntitlementResult,
  { kind: "personal-annual-payment-entitlement" }
>;

export type CaritasAnnualPaymentLateEntryAssessmentResult =
  | {
      readonly kind: "personal-annual-payment-late-entry-assessment";
      readonly draft: true;
      readonly completeGross: false;
      readonly entitlementYear: number;
      readonly basis: ConfirmedBasis;
      readonly entitlement: ConfirmedEntitlement;
      readonly parentalLeavePartTimeBasis: "NOT_APPLICABLE";
      /** No verified replacement date for the rate group is established by this assessment. */
      readonly annualAmount: {
        readonly kind: "unavailable";
        readonly reason: "LATE_ENTRY_RATE_REFERENCE_UNRESOLVED";
      };
    }
  | Extract<
      CaritasAnnualPaymentLateEntryBasisResult | CaritasAnnualPaymentEntitlementResult,
      { kind: "unavailable" }
    >
  | {
      readonly kind: "unavailable";
      readonly reason:
        | "UNSUPPORTED_SPECIAL_BASIS"
        | "UNSUPPORTED_EMPLOYMENT_PERIOD"
        | "REFERENCE_MONTH_FACTS_MISMATCH";
    };

/** Joins the confirmed basis and annual facts; it does not select a rate or calculate a payout. */
export function assessCaritasAnnualPaymentLateEntry(
  input: CaritasAnnualPaymentLateEntryAssessmentInput,
): CaritasAnnualPaymentLateEntryAssessmentResult {
  if (input.parentalLeavePartTimeBasis !== "NOT_APPLICABLE")
    return { kind: "unavailable", reason: "UNSUPPORTED_SPECIAL_BASIS" };
  const basis = calculateCaritasAnnualPaymentLateEntryBasis(input);
  if (basis.kind === "unavailable") return basis;
  const entitlement = assessCaritasAnnualPaymentEntitlement(input);
  if (entitlement.kind === "unavailable") return entitlement;
  if (
    !entitlement.eligibility.eligible ||
    entitlement.eligibility.reason !== "EMPLOYED_ON_DECEMBER_1"
  )
    return { kind: "unavailable", reason: "UNSUPPORTED_EMPLOYMENT_PERIOD" };

  const referenceMonth = basis.firstFullMonth.month;
  const year = Number(referenceMonth.slice(0, 4));
  const month = Number(referenceMonth.slice(5, 7));
  const calendarDays = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const facts = entitlement.months.find((item) => item.month === referenceMonth);
  if (
    !facts ||
    facts.entgeltOrContinuationDays !== calendarDays ||
    facts.reductionException.kind !== "NONE"
  )
    return { kind: "unavailable", reason: "REFERENCE_MONTH_FACTS_MISMATCH" };

  return {
    kind: "personal-annual-payment-late-entry-assessment",
    draft: true,
    completeGross: false,
    entitlementYear: input.entitlementYear,
    basis,
    entitlement,
    parentalLeavePartTimeBasis: "NOT_APPLICABLE",
    annualAmount: { kind: "unavailable", reason: "LATE_ENTRY_RATE_REFERENCE_UNRESOLVED" },
  };
}
