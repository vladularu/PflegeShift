import {
  calculateCaritasAnnualPaymentPartialBasis,
  type CaritasAnnualPaymentPartialBasisInput,
  type CaritasAnnualPaymentPartialBasisResult,
  type CaritasAnnualPaymentPartialMonth,
} from "./caritas-annual-payment-partial-basis";
import {
  lookupCaritasAnnualPaymentRule,
  type CaritasAnnualPaymentRuleLookup,
} from "./caritas-annual-payment-rule";

export interface CaritasAnnualPaymentFallbackMonth {
  readonly month: string;
  readonly personalMonthlyBasisCents: number;
  readonly basisRegionId: string;
  readonly fullCalendarMonthEntgeltConfirmed: boolean;
  readonly historicalSection16BasisConfirmed: boolean;
  readonly sameEmploymentConfirmed: boolean;
  readonly lastApplicableFullMonthConfirmed: boolean;
}

export interface CaritasAnnualPaymentFallbackBasisInput extends CaritasAnnualPaymentPartialBasisInput {
  readonly replacementMonth: CaritasAnnualPaymentFallbackMonth;
}

type AnnualRule = Extract<CaritasAnnualPaymentRuleLookup, { kind: "source-annual-payment-rule" }>;
type ReferenceReason = Extract<
  CaritasAnnualPaymentPartialBasisResult,
  { kind: "unavailable" }
>["reason"];
type ConfirmedReferenceMonth = Omit<
  CaritasAnnualPaymentPartialMonth,
  "calendarDayBreakdownConfirmed" | "section16BasisConfirmed"
> & {
  readonly calendarDayBreakdownConfirmed: true;
  readonly section16BasisConfirmed: true;
};
type ConfirmedReplacementMonth = Omit<
  CaritasAnnualPaymentFallbackMonth,
  | "fullCalendarMonthEntgeltConfirmed"
  | "historicalSection16BasisConfirmed"
  | "sameEmploymentConfirmed"
  | "lastApplicableFullMonthConfirmed"
> & {
  readonly fullCalendarMonthEntgeltConfirmed: true;
  readonly historicalSection16BasisConfirmed: true;
  readonly sameEmploymentConfirmed: true;
  readonly lastApplicableFullMonthConfirmed: true;
};

export type CaritasAnnualPaymentFallbackBasisResult =
  | {
      readonly kind: "personal-annual-payment-fallback-basis";
      readonly draft: true;
      readonly completeGross: false;
      readonly entitlementYear: number;
      readonly groupIdAtSeptember1: string;
      readonly groupReferenceDate: string;
      readonly septemberGroupConfirmed: true;
      readonly referenceCase: "PARTIAL_MONTHS" | "SICK_PAY_SUPPLEMENT";
      readonly partialReferencePeriodConfirmed: true;
      readonly referenceMonths: readonly ConfirmedReferenceMonth[];
      readonly referenceEntgeltCalendarDays: number;
      readonly referenceExcludedSickPaySupplementCalendarDays: number;
      readonly referencePaidBasisTotalCents: number;
      readonly replacementMonth: ConfirmedReplacementMonth;
      readonly meanMonthlyBasis: { readonly numeratorCents: number; readonly denominator: 1 };
      readonly annualRule: AnnualRule;
    }
  | {
      readonly kind: "unavailable";
      readonly reason:
        | ReferenceReason
        | "FALLBACK_NOT_REQUIRED"
        | "INVALID_REPLACEMENT_MONTH"
        | "REPLACEMENT_FULL_MONTH_UNCONFIRMED"
        | "HISTORICAL_BASIS_UNCONFIRMED"
        | "EMPLOYMENT_IDENTITY_UNCONFIRMED"
        | "LAST_FULL_MONTH_UNCONFIRMED";
    };

/** Adopts an externally confirmed historical full-month basis; it does not reconstruct payroll. */
export function calculateCaritasAnnualPaymentFallbackBasis(
  input: CaritasAnnualPaymentFallbackBasisInput,
): CaritasAnnualPaymentFallbackBasisResult {
  if (input.referenceCase !== "PARTIAL_MONTHS" && input.referenceCase !== "SICK_PAY_SUPPLEMENT")
    return { kind: "unavailable", reason: "UNSUPPORTED_REFERENCE_CASE" };
  const reference = calculateCaritasAnnualPaymentPartialBasis(input);
  if (reference.kind !== "unavailable")
    return { kind: "unavailable", reason: "FALLBACK_NOT_REQUIRED" };
  if (reference.reason !== "FALLBACK_REFERENCE_MONTH_REQUIRED") return reference;
  const annualRule = lookupCaritasAnnualPaymentRule(
    input.pkg,
    input.entitlementYear,
    input.variantId,
    input.regionId,
    input.groupIdAtSeptember1,
  );
  if (annualRule.kind === "unavailable") return annualRule;
  const replacement = input.replacementMonth;
  if (
    !replacement ||
    typeof replacement.month !== "string" ||
    !/^\d{4}-(0[1-9]|1[0-2])$/.test(replacement.month) ||
    Number(replacement.month.slice(0, 4)) < 1900 ||
    replacement.month >= `${input.entitlementYear}-07`
  )
    return { kind: "unavailable", reason: "INVALID_REPLACEMENT_MONTH" };
  if (replacement.fullCalendarMonthEntgeltConfirmed !== true)
    return { kind: "unavailable", reason: "REPLACEMENT_FULL_MONTH_UNCONFIRMED" };
  if (replacement.historicalSection16BasisConfirmed !== true)
    return { kind: "unavailable", reason: "HISTORICAL_BASIS_UNCONFIRMED" };
  if (replacement.sameEmploymentConfirmed !== true)
    return { kind: "unavailable", reason: "EMPLOYMENT_IDENTITY_UNCONFIRMED" };
  if (replacement.lastApplicableFullMonthConfirmed !== true)
    return { kind: "unavailable", reason: "LAST_FULL_MONTH_UNCONFIRMED" };
  if (replacement.basisRegionId !== annualRule.basisRegionId)
    return { kind: "unavailable", reason: "BASIS_IDENTITY_MISMATCH" };
  const amount = replacement.personalMonthlyBasisCents;
  if (!Number.isSafeInteger(amount) || amount <= 0)
    return { kind: "unavailable", reason: "INVALID_MONTH_BASIS" };

  const referenceMonths = input.paidMonths
    .map((month) => ({
      month: month.month,
      personalPaidBasisCents: month.personalPaidBasisCents,
      basisRegionId: month.basisRegionId,
      basisPayTableId: month.basisPayTableId,
      entgeltCalendarDays: month.entgeltCalendarDays,
      sickPaySupplementCalendarDays: month.sickPaySupplementCalendarDays,
      noEntgeltCalendarDays: month.noEntgeltCalendarDays,
      calendarDayBreakdownConfirmed: true as const,
      section16BasisConfirmed: true as const,
    }))
    .sort((left, right) => (left.month < right.month ? -1 : left.month > right.month ? 1 : 0));
  return {
    kind: "personal-annual-payment-fallback-basis",
    draft: true,
    completeGross: false,
    entitlementYear: input.entitlementYear,
    groupIdAtSeptember1: input.groupIdAtSeptember1,
    groupReferenceDate: `${input.entitlementYear}-09-01`,
    septemberGroupConfirmed: true,
    referenceCase: input.referenceCase,
    partialReferencePeriodConfirmed: true,
    referenceMonths,
    referenceEntgeltCalendarDays: referenceMonths.reduce(
      (sum, month) => sum + month.entgeltCalendarDays,
      0,
    ),
    referenceExcludedSickPaySupplementCalendarDays: referenceMonths.reduce(
      (sum, month) => sum + month.sickPaySupplementCalendarDays,
      0,
    ),
    referencePaidBasisTotalCents: referenceMonths.reduce(
      (sum, month) => sum + month.personalPaidBasisCents,
      0,
    ),
    replacementMonth: {
      month: replacement.month,
      personalMonthlyBasisCents: amount,
      basisRegionId: replacement.basisRegionId,
      fullCalendarMonthEntgeltConfirmed: true,
      historicalSection16BasisConfirmed: true,
      sameEmploymentConfirmed: true,
      lastApplicableFullMonthConfirmed: true,
    },
    meanMonthlyBasis: { numeratorCents: amount, denominator: 1 },
    annualRule,
  };
}
