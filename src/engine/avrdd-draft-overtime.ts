import { Temporal } from "@js-temporal/polyfill";
import type { RuleTariffPackage } from "@/rules/contracts.generated";
import { resolveTariffSelection } from "@/rules/tariff-selection";
import { validateRulePackage } from "@/rules/validation";
import { roundRemunerationCents } from "./remuneration-money";

export interface AvrddDraftOvertimeInput {
  readonly pkg: RuleTariffPackage;
  readonly workMonth: string;
  readonly variantId: string;
  readonly regionId: string;
  readonly groupId: string;
  readonly avrddApplicabilityConfirmed: boolean;
  readonly contractTimeMode: "STANDARD_39" | "INDIVIDUAL_FULL_TIME_CORRIDOR" | "UNKNOWN";
  readonly contractedWeeklyMinutes: number;
  /** Part-time plus hours require an agreement under § 9c(2). */
  readonly partTimePlusHoursAgreementConfirmed: boolean | null;
  /** Complete § 9c(1) monthly account, not the sum of selected shift overtime flags. */
  readonly monthlyAccountComplete: boolean;
  readonly monthlyPlusMinutes: number;
  /** Separately identified minutes above the threshold, ordered or approved under § 9c(4). */
  readonly confirmedOvertimeMinutes: number;
  readonly classification: "ORDERED_OR_APPROVED_CONFIRMED" | "NOT_OVERTIME" | "UNKNOWN";
  /** Actual personal § 14(1) monthly entitlement, including any child supplement. */
  readonly monthlyEntgelt14Cents: number;
  /** All monthly fixed allowances, zero only if explicitly confirmed absent. */
  readonly monthlyFixedAllowancesCents: number;
  readonly completeUniformPersonalBasisConfirmed: boolean;
  readonly basisExcludesOvertimeConfirmed: boolean;
  /** § 20a(4) allows a different individual or service-agreement lump sum. */
  readonly premiumArrangement: "NONE_CONFIRMED" | "LUMP_SUM" | "UNKNOWN";
  /** This draft only computes an explicit cash claim, not time-credit/factorization cases. */
  readonly workSettlement: "CASH_CONFIRMED" | "TIME_OR_OTHER" | "UNKNOWN";
  readonly premiumSettlement: "CASH_CONFIRMED" | "TIME_OR_OTHER" | "UNKNOWN";
}

export type AvrddDraftOvertimeResult =
  | {
      readonly kind: "draft-confirmed-cash-overtime";
      readonly status: "estimated";
      readonly completeGross: false;
      readonly workMonth: string;
      /** § 21a timing is not resolved by a work-month-only input. */
      readonly payoutMonth: null;
      readonly packageId: string;
      readonly versionId: string;
      readonly groupId: string;
      readonly monthlyPlusMinutes: number;
      readonly confirmedOvertimeMinutes: number;
      readonly thresholdNumerator: number;
      readonly thresholdDenominator: number;
      readonly personalHourlyBasisCents: number;
      readonly cashClaimCents: number;
      readonly sourceIds: readonly string[];
      readonly positions: readonly [
        {
          readonly component: "WORK_HOURS";
          readonly minutes: number;
          readonly rateCentsPerHour: number;
          readonly amountCents: number;
        },
        {
          readonly component: "OVERTIME_PREMIUM";
          readonly minutes: number;
          readonly rateCentsPerHour: number;
          readonly amountCents: number;
        },
      ];
    }
  | {
      readonly kind: "unavailable";
      readonly reason:
        | "INVALID_PACKAGE"
        | "INVALID_MONTH"
        | "OUTSIDE_VALIDITY"
        | "AVRDD_APPLICABILITY_UNCONFIRMED"
        | "CONTRACT_TIME_UNKNOWN"
        | "CORRIDOR_SEPARATE_CALCULATION_REQUIRED"
        | "INVALID_WEEKLY_TIME"
        | "PART_TIME_AGREEMENT_UNCONFIRMED"
        | "MONTH_ACCOUNT_INCOMPLETE"
        | "INVALID_PLUS_MINUTES"
        | "INVALID_OVERTIME_MINUTES"
        | "CLASSIFICATION_UNCONFIRMED"
        | "NOT_OVERTIME"
        | "BELOW_MONTHLY_THRESHOLD"
        | "PERSONAL_BASIS_UNCONFIRMED"
        | "INVALID_PERSONAL_BASIS"
        | "LOCAL_AGREEMENT_UNKNOWN"
        | "LOCAL_AGREEMENT_UNSUPPORTED"
        | "SETTLEMENT_UNCONFIRMED"
        | "SETTLEMENT_UNSUPPORTED"
        | "UNKNOWN_SELECTION"
        | "MISSING_POLICY"
        | "MISSING_PREMIUM_RATE"
        | "AMOUNT_OVERFLOW";
    };

/** Candidate-only § 9c/§ 20a cash claim; never infer overtime from a day or month balance alone. */
export function calculateAvrddDraftOvertime(
  input: AvrddDraftOvertimeInput,
): AvrddDraftOvertimeResult {
  const { pkg } = input;
  if (pkg.engineContractVersion !== 15 || pkg.status !== "DRAFT" || !validateRulePackage(pkg).ok)
    return { kind: "unavailable", reason: "INVALID_PACKAGE" };
  let yearMonth: Temporal.PlainYearMonth;
  try {
    yearMonth = Temporal.PlainYearMonth.from(input.workMonth);
    if (!/^\d{4}-\d{2}$/u.test(input.workMonth) || yearMonth.toString() !== input.workMonth)
      return { kind: "unavailable", reason: "INVALID_MONTH" };
  } catch {
    return { kind: "unavailable", reason: "INVALID_MONTH" };
  }
  const firstDate = `${input.workMonth}-01`;
  const lastDate = `${input.workMonth}-${String(yearMonth.daysInMonth).padStart(2, "0")}`;
  if (firstDate < pkg.validFrom || (pkg.validTo !== null && lastDate > pkg.validTo))
    return { kind: "unavailable", reason: "OUTSIDE_VALIDITY" };
  if (!input.avrddApplicabilityConfirmed)
    return { kind: "unavailable", reason: "AVRDD_APPLICABILITY_UNCONFIRMED" };
  if (input.contractTimeMode === "UNKNOWN")
    return { kind: "unavailable", reason: "CONTRACT_TIME_UNKNOWN" };
  if (input.contractTimeMode !== "STANDARD_39")
    return { kind: "unavailable", reason: "CORRIDOR_SEPARATE_CALCULATION_REQUIRED" };
  const standardMinutes = pkg.rules.avrddStagePolicy?.standardFullTimeWeeklyMinutes;
  if (
    standardMinutes !== 2340 ||
    !Number.isSafeInteger(input.contractedWeeklyMinutes) ||
    input.contractedWeeklyMinutes < 60 ||
    input.contractedWeeklyMinutes > standardMinutes
  )
    return { kind: "unavailable", reason: "INVALID_WEEKLY_TIME" };
  if (
    input.contractedWeeklyMinutes < standardMinutes &&
    input.partTimePlusHoursAgreementConfirmed !== true
  )
    return { kind: "unavailable", reason: "PART_TIME_AGREEMENT_UNCONFIRMED" };
  if (!input.monthlyAccountComplete)
    return { kind: "unavailable", reason: "MONTH_ACCOUNT_INCOMPLETE" };
  if (
    !Number.isSafeInteger(input.monthlyPlusMinutes) ||
    input.monthlyPlusMinutes < 0 ||
    input.monthlyPlusMinutes > 44_640
  )
    return { kind: "unavailable", reason: "INVALID_PLUS_MINUTES" };
  if (
    !Number.isSafeInteger(input.confirmedOvertimeMinutes) ||
    input.confirmedOvertimeMinutes < 1 ||
    input.confirmedOvertimeMinutes > input.monthlyPlusMinutes
  )
    return { kind: "unavailable", reason: "INVALID_OVERTIME_MINUTES" };
  if (input.classification === "NOT_OVERTIME")
    return { kind: "unavailable", reason: "NOT_OVERTIME" };
  if (input.classification !== "ORDERED_OR_APPROVED_CONFIRMED")
    return { kind: "unavailable", reason: "CLASSIFICATION_UNCONFIRMED" };
  const policy = pkg.rules.avrddOvertimePolicy;
  if (!policy) return { kind: "unavailable", reason: "MISSING_POLICY" };
  // Compare exact rational minutes; an unconfirmed fraction never becomes a whole paid minute.
  const thresholdNumerator = policy.fullTimePlusThresholdMinutes * input.contractedWeeklyMinutes;
  const thresholdDenominator = standardMinutes;
  if (
    input.confirmedOvertimeMinutes * thresholdDenominator >
    input.monthlyPlusMinutes * thresholdDenominator - thresholdNumerator
  )
    return { kind: "unavailable", reason: "BELOW_MONTHLY_THRESHOLD" };
  if (!input.completeUniformPersonalBasisConfirmed || !input.basisExcludesOvertimeConfirmed)
    return { kind: "unavailable", reason: "PERSONAL_BASIS_UNCONFIRMED" };
  if (
    !Number.isSafeInteger(input.monthlyEntgelt14Cents) ||
    input.monthlyEntgelt14Cents <= 0 ||
    !Number.isSafeInteger(input.monthlyFixedAllowancesCents) ||
    input.monthlyFixedAllowancesCents < 0
  )
    return { kind: "unavailable", reason: "INVALID_PERSONAL_BASIS" };
  const personalMonthlyBasisCents = input.monthlyEntgelt14Cents + input.monthlyFixedAllowancesCents;
  if (!Number.isSafeInteger(personalMonthlyBasisCents))
    return { kind: "unavailable", reason: "AMOUNT_OVERFLOW" };
  if (input.premiumArrangement === "UNKNOWN")
    return { kind: "unavailable", reason: "LOCAL_AGREEMENT_UNKNOWN" };
  if (input.premiumArrangement !== "NONE_CONFIRMED")
    return { kind: "unavailable", reason: "LOCAL_AGREEMENT_UNSUPPORTED" };
  if (input.workSettlement === "UNKNOWN" || input.premiumSettlement === "UNKNOWN")
    return { kind: "unavailable", reason: "SETTLEMENT_UNCONFIRMED" };
  if (input.workSettlement !== "CASH_CONFIRMED" || input.premiumSettlement !== "CASH_CONFIRMED")
    return { kind: "unavailable", reason: "SETTLEMENT_UNSUPPORTED" };
  const selected = resolveTariffSelection(pkg, input.variantId, input.regionId);
  const canonicalGroupId = input.groupId.toLowerCase();
  if (
    selected?.familyId !== "avr-dd" ||
    selected.engineId !== "avr-dd-v1" ||
    !selected.groups.some((group) => group.id === canonicalGroupId)
  )
    return { kind: "unavailable", reason: "UNKNOWN_SELECTION" };
  const rates = pkg.rules.avrddHourlyRates?.filter((rate) => rate.groupId === canonicalGroupId);
  if (rates?.length !== 1) return { kind: "unavailable", reason: "MISSING_PREMIUM_RATE" };
  const printedSupplementCents = rates[0].overtimeSupplementCents;
  const divisor = input.contractedWeeklyMinutes * policy.monthlyFactorThousandths;
  const hourlyNumerator = personalMonthlyBasisCents * 60_000;
  if (!Number.isSafeInteger(hourlyNumerator) || !Number.isSafeInteger(divisor))
    return { kind: "unavailable", reason: "AMOUNT_OVERFLOW" };
  const personalHourlyBasisCents = roundRemunerationCents(hourlyNumerator, divisor);
  const workNumerator = personalHourlyBasisCents * input.confirmedOvertimeMinutes;
  const premiumNumerator = printedSupplementCents * input.confirmedOvertimeMinutes;
  if (!Number.isSafeInteger(workNumerator) || !Number.isSafeInteger(premiumNumerator))
    return { kind: "unavailable", reason: "AMOUNT_OVERFLOW" };
  const workAmountCents = roundRemunerationCents(workNumerator, 60);
  const premiumAmountCents = roundRemunerationCents(premiumNumerator, 60);
  const cashClaimCents = workAmountCents + premiumAmountCents;
  if (!Number.isSafeInteger(cashClaimCents))
    return { kind: "unavailable", reason: "AMOUNT_OVERFLOW" };
  return {
    kind: "draft-confirmed-cash-overtime",
    status: "estimated",
    completeGross: false,
    workMonth: input.workMonth,
    payoutMonth: null,
    packageId: pkg.packageId,
    versionId: pkg.versionId,
    groupId: canonicalGroupId,
    monthlyPlusMinutes: input.monthlyPlusMinutes,
    confirmedOvertimeMinutes: input.confirmedOvertimeMinutes,
    thresholdNumerator,
    thresholdDenominator,
    personalHourlyBasisCents,
    cashClaimCents,
    sourceIds: [...new Set([...rates[0].sourceIds, ...policy.sourceIds])],
    positions: [
      {
        component: "WORK_HOURS",
        minutes: input.confirmedOvertimeMinutes,
        rateCentsPerHour: personalHourlyBasisCents,
        amountCents: workAmountCents,
      },
      {
        component: "OVERTIME_PREMIUM",
        minutes: input.confirmedOvertimeMinutes,
        rateCentsPerHour: printedSupplementCents,
        amountCents: premiumAmountCents,
      },
    ],
  };
}
