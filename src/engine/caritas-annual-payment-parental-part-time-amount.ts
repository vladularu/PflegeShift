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
  lookupCaritasAnnualPaymentRule,
  type CaritasAnnualPaymentRuleLookup,
} from "./caritas-annual-payment-rule";
import type { CaritasAnnualPaymentRegularBasisInput } from "./caritas-annual-payment-regular-basis";

/** Externally confirmed relative employment scope, not an hours/benefit entitlement calculation. */
interface ScopeFraction {
  readonly numerator: number;
  readonly denominator: number;
}
export interface CaritasParentalPartTimeAdjustedMonth {
  readonly month: string;
  /** Historical section 16 basis already assessed at the scope on the day before parental leave. */
  readonly personalBasisAtPreLeaveScopeCents: number;
  readonly preLeaveScope: ScopeFraction;
  readonly basisRegionId: string;
  readonly basisPayTableId: string;
  readonly fullCalendarMonthEntgeltConfirmed: boolean;
  readonly section16BasisConfirmed: boolean;
  readonly preLeaveScopeAppliedConfirmed: boolean;
}
export interface CaritasAnnualPaymentParentalPartTimeAmountInput extends CaritasAnnualPaymentEntitlementInput {
  readonly groupIdAtSeptember1: string;
  readonly septemberGroupConfirmed: boolean;
  readonly referenceCase: CaritasAnnualPaymentRegularBasisInput["referenceCase"];
  readonly parentalLeavePartTimeBasis: "NOT_APPLICABLE" | "APPLICABLE" | "UNKNOWN";
  readonly parentalReferencePeriodConfirmed: boolean;
  readonly parentalLeave: {
    readonly birthDate: string;
    readonly startDate: string;
    readonly endDate: string | null;
    readonly singlePeriodConfirmed: boolean;
  };
  readonly beforeLeaveScope: ScopeFraction & {
    readonly referenceDate: string;
    readonly historicalScopeConfirmed: boolean;
    readonly sameEmploymentConfirmed: boolean;
  };
  readonly referencePartTime: ScopeFraction & {
    readonly startDate: string;
    readonly endDate: string | null;
    readonly benefitPreservingConfirmed: boolean;
    readonly singleScopePeriodConfirmed: boolean;
  };
  readonly adjustedMonths: readonly CaritasParentalPartTimeAdjustedMonth[];
}
type AnnualRule = Extract<CaritasAnnualPaymentRuleLookup, { kind: "source-annual-payment-rule" }>;
type Entitlement = Extract<
  CaritasAnnualPaymentEntitlementResult,
  { kind: "personal-annual-payment-entitlement" }
>;
type Rounded = Extract<
  CaritasAnnualPaymentRoundedAmount,
  { kind: "rounded-annual-payment-amount" }
>;
type ConfirmedMonth = Omit<
  CaritasParentalPartTimeAdjustedMonth,
  "fullCalendarMonthEntgeltConfirmed" | "section16BasisConfirmed" | "preLeaveScopeAppliedConfirmed"
> & {
  readonly fullCalendarMonthEntgeltConfirmed: true;
  readonly section16BasisConfirmed: true;
  readonly preLeaveScopeAppliedConfirmed: true;
};
export type CaritasAnnualPaymentParentalPartTimeAmountResult =
  | (Omit<Rounded, "kind"> & {
      readonly kind: "personal-annual-payment-parental-part-time-amount";
      readonly draft: true;
      readonly completeGross: false;
      readonly entitlementYear: number;
      readonly parentalLeavePartTimeBasis: "APPLICABLE";
      readonly basis: {
        readonly groupIdAtSeptember1: string;
        readonly groupReferenceDate: string;
        readonly referenceCase: "PARENTAL_LEAVE";
        readonly parentalLeave: {
          readonly birthDate: string;
          readonly startDate: string;
          readonly endDate: string | null;
          readonly singlePeriodConfirmed: true;
        };
        readonly beforeLeaveScope: ScopeFraction & {
          readonly referenceDate: string;
          readonly historicalScopeConfirmed: true;
          readonly sameEmploymentConfirmed: true;
        };
        readonly referencePartTime: ScopeFraction & {
          readonly startDate: string;
          readonly endDate: string | null;
          readonly benefitPreservingConfirmed: true;
          readonly singleScopePeriodConfirmed: true;
        };
        readonly adjustedMonths: readonly ConfirmedMonth[];
        readonly meanMonthlyBasis: { readonly numeratorCents: number; readonly denominator: 3 };
        readonly annualRule: AnnualRule;
      };
      readonly entitlement: Entitlement;
      readonly specialBasisEvidence: {
        readonly sourceId: string;
        readonly sourceSection: "Anlage 31 § 16 Absatz 2 Satz 4" | "Anlage 32 § 16 Absatz 2 Satz 4";
        readonly sourceSha256: string;
      };
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
        | "SPECIAL_BASIS_UNCONFIRMED"
        | "REFERENCE_GROUP_UNCONFIRMED"
        | "PARENTAL_PERIOD_UNCONFIRMED"
        | "INVALID_PARENTAL_PERIOD"
        | "PARENTAL_BIRTH_YEAR_MISMATCH"
        | "UNSUPPORTED_EMPLOYMENT_PERIOD"
        | "UNSUPPORTED_PARENTAL_REFERENCE_PERIOD"
        | "PRE_LEAVE_SCOPE_UNCONFIRMED"
        | "PRE_LEAVE_SCOPE_DATE_MISMATCH"
        | "INVALID_EMPLOYMENT_SCOPE"
        | "PART_TIME_UNCONFIRMED"
        | "INVALID_PART_TIME_PERIOD"
        | "INVALID_REFERENCE_MONTHS"
        | "REFERENCE_MONTH_INCOMPLETE"
        | "MONTH_BASIS_UNCONFIRMED"
        | "PRE_LEAVE_MONTH_BASIS_UNCONFIRMED"
        | "BASIS_SCOPE_MISMATCH"
        | "BASIS_IDENTITY_MISMATCH"
        | "INVALID_MONTH_BASIS"
        | "REFERENCE_MONTH_FACTS_MISMATCH"
        | "PARENTAL_MONTH_FACTS_MISMATCH";
    };

function dateValue(value: unknown): number | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const year = Number(value.slice(0, 4)),
    month = Number(value.slice(5, 7)),
    day = Number(value.slice(8, 10));
  if (year < 1900 || month < 1 || month > 12 || day < 1) return null;
  const time = Date.UTC(year, month - 1, day),
    date = new Date(time);
  return date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
    ? time
    : null;
}
function validScope(value: ScopeFraction | undefined): value is ScopeFraction {
  return (
    !!value &&
    Number.isSafeInteger(value.numerator) &&
    value.numerator > 0 &&
    Number.isSafeInteger(value.denominator) &&
    value.denominator > 0 &&
    value.numerator <= value.denominator
  );
}

/** One sourced annual component for confirmed full reference months at the historical pre-leave scope. */
export function calculateCaritasAnnualPaymentParentalPartTimeAmount(
  input: CaritasAnnualPaymentParentalPartTimeAmountInput,
): CaritasAnnualPaymentParentalPartTimeAmountResult {
  if (input.referenceCase !== "PARENTAL_LEAVE")
    return { kind: "unavailable", reason: "UNSUPPORTED_REFERENCE_CASE" };
  if (
    input.parentalLeavePartTimeBasis !== "APPLICABLE" ||
    input.parentalReferencePeriodConfirmed !== true
  )
    return { kind: "unavailable", reason: "SPECIAL_BASIS_UNCONFIRMED" };
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
  const entitlement = assessCaritasAnnualPaymentEntitlement(input);
  if (entitlement.kind === "unavailable") return entitlement;
  if (
    !entitlement.eligibility.eligible ||
    entitlement.eligibility.reason !== "EMPLOYED_ON_DECEMBER_1" ||
    entitlement.employmentStartDate > `${input.entitlementYear}-07-01`
  )
    return { kind: "unavailable", reason: "UNSUPPORTED_EMPLOYMENT_PERIOD" };
  const leave = input.parentalLeave;
  if (leave?.singlePeriodConfirmed !== true)
    return { kind: "unavailable", reason: "PARENTAL_PERIOD_UNCONFIRMED" };
  const birth = dateValue(leave.birthDate),
    start = dateValue(leave.startDate);
  const end = leave.endDate === null ? Number.POSITIVE_INFINITY : dateValue(leave.endDate);
  if (birth === null || start === null || end === null || start < birth || end < start)
    return { kind: "unavailable", reason: "INVALID_PARENTAL_PERIOD" };
  if (leave.birthDate.slice(0, 4) !== String(input.entitlementYear))
    return { kind: "unavailable", reason: "PARENTAL_BIRTH_YEAR_MISMATCH" };
  const employmentStart = dateValue(entitlement.employmentStartDate)!;
  const employmentEnd =
    entitlement.employmentEndDate === null
      ? Number.POSITIVE_INFINITY
      : dateValue(entitlement.employmentEndDate)!;
  const referenceStart = Date.UTC(input.entitlementYear, 6, 1),
    referenceEnd = Date.UTC(input.entitlementYear, 8, 30);
  if (
    start > referenceStart ||
    end < referenceEnd ||
    start - 86400000 < employmentStart ||
    end > employmentEnd
  )
    return { kind: "unavailable", reason: "UNSUPPORTED_PARENTAL_REFERENCE_PERIOD" };
  const before = input.beforeLeaveScope;
  if (before?.historicalScopeConfirmed !== true || before.sameEmploymentConfirmed !== true)
    return { kind: "unavailable", reason: "PRE_LEAVE_SCOPE_UNCONFIRMED" };
  const beforeDate = new Date(start - 86400000).toISOString().slice(0, 10);
  if (before.referenceDate !== beforeDate)
    return { kind: "unavailable", reason: "PRE_LEAVE_SCOPE_DATE_MISMATCH" };
  if (!validScope(before)) return { kind: "unavailable", reason: "INVALID_EMPLOYMENT_SCOPE" };
  const partTime = input.referencePartTime;
  if (partTime?.benefitPreservingConfirmed !== true || partTime.singleScopePeriodConfirmed !== true)
    return { kind: "unavailable", reason: "PART_TIME_UNCONFIRMED" };
  if (!validScope(partTime) || partTime.numerator === partTime.denominator)
    return { kind: "unavailable", reason: "INVALID_EMPLOYMENT_SCOPE" };
  const partStart = dateValue(partTime.startDate);
  const partEnd =
    partTime.endDate === null ? Number.POSITIVE_INFINITY : dateValue(partTime.endDate);
  if (
    partStart === null ||
    partEnd === null ||
    partEnd < partStart ||
    partStart < start ||
    partEnd > end
  )
    return { kind: "unavailable", reason: "INVALID_PART_TIME_PERIOD" };
  if (partStart > referenceStart || partEnd < referenceEnd)
    return { kind: "unavailable", reason: "UNSUPPORTED_PARENTAL_REFERENCE_PERIOD" };
  if (!Array.isArray(input.adjustedMonths) || input.adjustedMonths.length !== 3)
    return { kind: "unavailable", reason: "INVALID_REFERENCE_MONTHS" };
  const ordered = annualRule.referenceMonths.map((month) =>
    input.adjustedMonths.find(
      (item) => item?.month === `${input.entitlementYear}-${String(month).padStart(2, "0")}`,
    ),
  );
  if (ordered.some((item) => !item))
    return { kind: "unavailable", reason: "INVALID_REFERENCE_MONTHS" };
  let numeratorCents = 0;
  const adjustedMonths: ConfirmedMonth[] = [];
  for (const [index, item] of ordered.entries()) {
    if (!item) return { kind: "unavailable", reason: "INVALID_REFERENCE_MONTHS" };
    if (item.fullCalendarMonthEntgeltConfirmed !== true)
      return { kind: "unavailable", reason: "REFERENCE_MONTH_INCOMPLETE" };
    if (item.section16BasisConfirmed !== true)
      return { kind: "unavailable", reason: "MONTH_BASIS_UNCONFIRMED" };
    if (item.preLeaveScopeAppliedConfirmed !== true)
      return { kind: "unavailable", reason: "PRE_LEAVE_MONTH_BASIS_UNCONFIRMED" };
    if (
      !validScope(item.preLeaveScope) ||
      BigInt(item.preLeaveScope.numerator) * BigInt(before.denominator) !==
        BigInt(before.numerator) * BigInt(item.preLeaveScope.denominator)
    )
      return { kind: "unavailable", reason: "BASIS_SCOPE_MISMATCH" };
    if (
      item.basisRegionId !== annualRule.basisRegionId ||
      item.basisPayTableId !== annualRule.basisPayTableId
    )
      return { kind: "unavailable", reason: "BASIS_IDENTITY_MISMATCH" };
    const amount = item.personalBasisAtPreLeaveScopeCents;
    if (!Number.isSafeInteger(amount) || amount <= 0)
      return { kind: "unavailable", reason: "INVALID_MONTH_BASIS" };
    if (numeratorCents > Number.MAX_SAFE_INTEGER - amount)
      return { kind: "unavailable", reason: "AMOUNT_OVERFLOW" };
    const facts = entitlement.months.find((month) => month.month === item.month);
    if (
      facts?.entgeltOrContinuationDays !== [31, 31, 30][index] ||
      facts.reductionException.kind !== "NONE"
    )
      return { kind: "unavailable", reason: "REFERENCE_MONTH_FACTS_MISMATCH" };
    numeratorCents += amount;
    adjustedMonths.push({
      month: item.month,
      personalBasisAtPreLeaveScopeCents: amount,
      preLeaveScope: {
        numerator: item.preLeaveScope.numerator,
        denominator: item.preLeaveScope.denominator,
      },
      basisRegionId: item.basisRegionId,
      basisPayTableId: item.basisPayTableId,
      fullCalendarMonthEntgeltConfirmed: true,
      section16BasisConfirmed: true,
      preLeaveScopeAppliedConfirmed: true,
    });
  }
  for (const facts of entitlement.months) {
    if (facts.reductionException.kind !== "PARENTAL_LEAVE_BIRTH_YEAR") continue;
    const first = dateValue(facts.month + "-01")!,
      last = Date.UTC(input.entitlementYear, Number(facts.month.slice(5, 7)), 0);
    if (facts.reductionException.birthDate !== leave.birthDate || first < start || last > end)
      return { kind: "unavailable", reason: "PARENTAL_MONTH_FACTS_MISMATCH" };
  }
  const basis = {
    groupIdAtSeptember1: input.groupIdAtSeptember1,
    groupReferenceDate: `${input.entitlementYear}-09-01`,
    referenceCase: "PARENTAL_LEAVE" as const,
    parentalLeave: {
      birthDate: leave.birthDate,
      startDate: leave.startDate,
      endDate: leave.endDate,
      singlePeriodConfirmed: true as const,
    },
    beforeLeaveScope: {
      referenceDate: before.referenceDate,
      numerator: before.numerator,
      denominator: before.denominator,
      historicalScopeConfirmed: true as const,
      sameEmploymentConfirmed: true as const,
    },
    referencePartTime: {
      startDate: partTime.startDate,
      endDate: partTime.endDate,
      numerator: partTime.numerator,
      denominator: partTime.denominator,
      benefitPreservingConfirmed: true as const,
      singleScopePeriodConfirmed: true as const,
    },
    adjustedMonths,
    meanMonthlyBasis: { numeratorCents, denominator: 3 as const },
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
    kind: "personal-annual-payment-parental-part-time-amount",
    draft: true,
    completeGross: false,
    entitlementYear: input.entitlementYear,
    parentalLeavePartTimeBasis: "APPLICABLE",
    basis,
    entitlement,
    specialBasisEvidence: {
      sourceId: amount.roundingEvidence.sourceId,
      sourceSection:
        input.variantId === "ANLAGE_31"
          ? "Anlage 31 § 16 Absatz 2 Satz 4"
          : "Anlage 32 § 16 Absatz 2 Satz 4",
      sourceSha256: amount.roundingEvidence.sourceSha256,
    },
  };
}
