import type { RuleTariffPackage } from "../rules/contracts.generated";
import type { CaritasAnnualPaymentRegularBasisInput } from "./caritas-annual-payment-regular-basis";
import {
  lookupCaritasAnnualPaymentRule,
  type CaritasAnnualPaymentRuleLookup,
} from "./caritas-annual-payment-rule";

export interface CaritasAnnualPaymentPartialMonth {
  readonly month: string;
  readonly personalPaidBasisCents: number;
  readonly basisRegionId: string;
  readonly basisPayTableId: string;
  readonly entgeltCalendarDays: number;
  readonly sickPaySupplementCalendarDays: number;
  readonly noEntgeltCalendarDays: number;
  readonly calendarDayBreakdownConfirmed: boolean;
  readonly section16BasisConfirmed: boolean;
}

export interface CaritasAnnualPaymentPartialBasisInput {
  readonly pkg: RuleTariffPackage;
  readonly entitlementYear: number;
  readonly variantId: string;
  readonly regionId: string;
  readonly groupIdAtSeptember1: string;
  readonly septemberGroupConfirmed: boolean;
  readonly referenceCase: CaritasAnnualPaymentRegularBasisInput["referenceCase"];
  readonly partialReferencePeriodConfirmed: boolean;
  readonly paidMonths: readonly CaritasAnnualPaymentPartialMonth[];
}

type AnnualRule = Extract<CaritasAnnualPaymentRuleLookup, { kind: "source-annual-payment-rule" }>;
type LookupReason = Extract<CaritasAnnualPaymentRuleLookup, { kind: "unavailable" }>["reason"];
type PartialReferenceCase = "PARTIAL_MONTHS" | "SICK_PAY_SUPPLEMENT";
type ConfirmedMonth = Omit<
  CaritasAnnualPaymentPartialMonth,
  "calendarDayBreakdownConfirmed" | "section16BasisConfirmed"
> & {
  readonly calendarDayBreakdownConfirmed: true;
  readonly section16BasisConfirmed: true;
};

export type CaritasAnnualPaymentPartialBasisResult =
  | {
      readonly kind: "personal-annual-payment-partial-basis";
      readonly draft: true;
      readonly completeGross: false;
      readonly entitlementYear: number;
      readonly groupIdAtSeptember1: string;
      readonly groupReferenceDate: string;
      readonly septemberGroupConfirmed: true;
      readonly referenceCase: PartialReferenceCase;
      readonly partialReferencePeriodConfirmed: true;
      readonly paidMonths: readonly ConfirmedMonth[];
      readonly paidBasisTotalCents: number;
      readonly entgeltCalendarDays: number;
      readonly excludedSickPaySupplementCalendarDays: number;
      readonly noEntgeltCalendarDays: number;
      readonly normalizationFactor: { readonly numerator: 3067; readonly denominator: 100 };
      readonly meanMonthlyBasis: {
        readonly numeratorCents: number;
        readonly denominator: number;
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
        | "CALENDAR_DAYS_UNCONFIRMED"
        | "INVALID_CALENDAR_DAYS"
        | "MONTH_BASIS_UNCONFIRMED"
        | "BASIS_IDENTITY_MISMATCH"
        | "INVALID_MONTH_BASIS"
        | "REFERENCE_CASE_MISMATCH"
        | "FALLBACK_REFERENCE_MONTH_REQUIRED"
        | "AMOUNT_OVERFLOW";
    };

function greatestCommonDivisor(left: number, right: number): number {
  while (right !== 0) [left, right] = [right, left % right];
  return left;
}

/** Uses confirmed paid reference-day bases; entitlement and an annual amount are not determined. */
export function calculateCaritasAnnualPaymentPartialBasis(
  input: CaritasAnnualPaymentPartialBasisInput,
): CaritasAnnualPaymentPartialBasisResult {
  if (input.referenceCase !== "PARTIAL_MONTHS" && input.referenceCase !== "SICK_PAY_SUPPLEMENT")
    return { kind: "unavailable", reason: "UNSUPPORTED_REFERENCE_CASE" };
  if (input.partialReferencePeriodConfirmed !== true)
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
  const ordered = annualRule.referenceMonths.map((month) =>
    input.paidMonths.find(
      (item) => item?.month === `${input.entitlementYear}-${String(month).padStart(2, "0")}`,
    ),
  );
  if (ordered.some((item) => item === undefined))
    return { kind: "unavailable", reason: "INVALID_REFERENCE_MONTHS" };

  let paidBasisTotalCents = 0;
  let entgeltCalendarDays = 0;
  let excludedSickPaySupplementCalendarDays = 0;
  let noEntgeltCalendarDays = 0;
  const paidMonths: ConfirmedMonth[] = [];
  for (const [index, item] of ordered.entries()) {
    if (!item) return { kind: "unavailable", reason: "INVALID_REFERENCE_MONTHS" };
    if (item.calendarDayBreakdownConfirmed !== true)
      return { kind: "unavailable", reason: "CALENDAR_DAYS_UNCONFIRMED" };
    if (item.section16BasisConfirmed !== true)
      return { kind: "unavailable", reason: "MONTH_BASIS_UNCONFIRMED" };
    if (
      item.basisRegionId !== annualRule.basisRegionId ||
      item.basisPayTableId !== annualRule.basisPayTableId
    )
      return { kind: "unavailable", reason: "BASIS_IDENTITY_MISMATCH" };
    const monthDays = index === 2 ? 30 : 31;
    const days = [
      item.entgeltCalendarDays,
      item.sickPaySupplementCalendarDays,
      item.noEntgeltCalendarDays,
    ];
    if (
      days.some((value) => !Number.isSafeInteger(value) || value < 0 || value > monthDays) ||
      days.reduce((sum, value) => sum + value, 0) !== monthDays
    )
      return { kind: "unavailable", reason: "INVALID_CALENDAR_DAYS" };
    const amount = item.personalPaidBasisCents;
    if (
      !Number.isSafeInteger(amount) ||
      (item.entgeltCalendarDays === 0 ? amount !== 0 : amount <= 0)
    )
      return { kind: "unavailable", reason: "INVALID_MONTH_BASIS" };
    if (paidBasisTotalCents > Number.MAX_SAFE_INTEGER - amount)
      return { kind: "unavailable", reason: "AMOUNT_OVERFLOW" };
    paidBasisTotalCents += amount;
    entgeltCalendarDays += item.entgeltCalendarDays;
    excludedSickPaySupplementCalendarDays += item.sickPaySupplementCalendarDays;
    noEntgeltCalendarDays += item.noEntgeltCalendarDays;
    paidMonths.push({
      month: item.month,
      personalPaidBasisCents: amount,
      basisRegionId: item.basisRegionId,
      basisPayTableId: item.basisPayTableId,
      entgeltCalendarDays: item.entgeltCalendarDays,
      sickPaySupplementCalendarDays: item.sickPaySupplementCalendarDays,
      noEntgeltCalendarDays: item.noEntgeltCalendarDays,
      calendarDayBreakdownConfirmed: true,
      section16BasisConfirmed: true,
    });
  }
  if (
    entgeltCalendarDays === 92 ||
    (input.referenceCase === "PARTIAL_MONTHS" && excludedSickPaySupplementCalendarDays !== 0) ||
    (input.referenceCase === "SICK_PAY_SUPPLEMENT" && excludedSickPaySupplementCalendarDays === 0)
  )
    return { kind: "unavailable", reason: "REFERENCE_CASE_MISMATCH" };
  if (entgeltCalendarDays < 30)
    return { kind: "unavailable", reason: "FALLBACK_REFERENCE_MONTH_REQUIRED" };

  let denominator = entgeltCalendarDays * 100;
  const amountDivisor = greatestCommonDivisor(paidBasisTotalCents, denominator);
  const reducedAmount = paidBasisTotalCents / amountDivisor;
  denominator /= amountDivisor;
  const factorDivisor = greatestCommonDivisor(3067, denominator);
  const reducedFactor = 3067 / factorDivisor;
  denominator /= factorDivisor;
  const numeratorCents = reducedAmount * reducedFactor;
  if (!Number.isSafeInteger(numeratorCents))
    return { kind: "unavailable", reason: "AMOUNT_OVERFLOW" };

  return {
    kind: "personal-annual-payment-partial-basis",
    draft: true,
    completeGross: false,
    entitlementYear: input.entitlementYear,
    groupIdAtSeptember1: input.groupIdAtSeptember1,
    groupReferenceDate: `${input.entitlementYear}-09-01`,
    septemberGroupConfirmed: true,
    referenceCase: input.referenceCase,
    partialReferencePeriodConfirmed: true,
    paidMonths,
    paidBasisTotalCents,
    entgeltCalendarDays,
    excludedSickPaySupplementCalendarDays,
    noEntgeltCalendarDays,
    normalizationFactor: { numerator: 3067, denominator: 100 },
    meanMonthlyBasis: { numeratorCents, denominator },
    annualRule,
  };
}
