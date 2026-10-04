import { Temporal } from "@js-temporal/polyfill";
import type { RuleTariffPackage } from "../rules/contracts.generated";
import { resolveTariffSelection } from "../rules/tariff-selection";
import { validateRulePackage } from "../rules/validation";
import { roundRemunerationCents } from "./remuneration-money";

type Settlement = "CASH" | "TIME" | "UNKNOWN";

export interface TvoedAnnexADraftOvertimeInput {
  readonly pkg: RuleTariffPackage;
  readonly date: string;
  readonly variantId: "BT_K" | "BT_B";
  readonly groupId: string;
  readonly stepId: string;
  readonly fullTimeWeeklyMinutes: number;
  readonly fullTimeReferenceConfirmed: boolean;
  readonly applicabilityConfirmed: boolean;
  /** Actual separately identified minutes; never inferred from a month balance. */
  readonly minutes: number;
  /** Confirmation must cover the applicable § 7(7)/(8) case and compensation deadline. */
  readonly classification: "CONFIRMED_TVOED_OVERTIME" | "NOT_OVERTIME" | "UNKNOWN";
  /** Prevents adding the same work entitlement to monthly base pay twice. */
  readonly workPayNotAlreadyIncludedConfirmed: boolean;
  readonly workSettlement: Settlement;
  readonly premiumSettlement: Settlement;
}

export type TvoedAnnexADraftOvertimeResult =
  | { readonly kind: "unavailable"; readonly reason: string }
  | {
      readonly kind: "draft-confirmed-overtime";
      readonly status: "estimated";
      readonly completeGross: false;
      readonly date: string;
      /** § 24(1) due date is not necessarily the actual payroll month. */
      readonly payoutMonth: null;
      readonly packageId: string;
      readonly versionId: string;
      readonly groupId: string;
      readonly stepId: string;
      readonly cashSubtotalCents: number;
      readonly sourceIds: readonly string[];
      readonly positions: readonly [
        {
          readonly component: "WORK_HOURS";
          readonly settlement: "CASH" | "TIME";
          readonly minutes: number;
          readonly referenceHourlyCents: number;
          readonly percentageBasisPoints: 10000;
          readonly nominalAmountCents: number;
          readonly cashAmountCents: number;
        },
        {
          readonly component: "OVERTIME_PREMIUM";
          readonly settlement: "CASH" | "TIME";
          readonly minutes: number;
          readonly referenceHourlyCents: number;
          readonly percentageBasisPoints: number;
          readonly nominalAmountCents: number;
          readonly cashAmountCents: number;
        },
      ];
    };

function validDate(date: string): boolean {
  try {
    return /^\d{4}-\d{2}-\d{2}$/u.test(date) && Temporal.PlainDate.from(date).toString() === date;
  } catch {
    return false;
  }
}

/** Isolated § 8(1)a draft claim; payout timing and overtime classification are external facts. */
export function calculateTvoedAnnexADraftOvertime(
  input: TvoedAnnexADraftOvertimeInput,
): TvoedAnnexADraftOvertimeResult {
  const { pkg, date, variantId, groupId, stepId, minutes } = input;
  if (pkg.engineContractVersion !== 16 || pkg.status !== "DRAFT" || !validateRulePackage(pkg).ok)
    return { kind: "unavailable", reason: "INVALID_PACKAGE" };
  const policy = pkg.rules.tvoedAnnexAOvertimePolicy;
  if (!policy) return { kind: "unavailable", reason: "MISSING_POLICY" };
  if (
    !validDate(date) ||
    date < pkg.validFrom ||
    (pkg.validTo !== null && date > pkg.validTo) ||
    date < policy.validFrom ||
    date > policy.validTo
  )
    return { kind: "unavailable", reason: "OUTSIDE_VALIDITY" };
  if (!input.applicabilityConfirmed)
    return { kind: "unavailable", reason: "TARIFF_APPLICABILITY_UNCONFIRMED" };
  if (
    !input.fullTimeReferenceConfirmed ||
    input.fullTimeWeeklyMinutes !== policy.standardFullTimeWeeklyMinutes
  )
    return { kind: "unavailable", reason: "FULL_TIME_REFERENCE_UNSUPPORTED" };
  if (!Number.isSafeInteger(minutes) || minutes < 1 || minutes > 1440)
    return { kind: "unavailable", reason: "INVALID_MINUTES" };
  if (input.classification !== "CONFIRMED_TVOED_OVERTIME")
    return {
      kind: "unavailable",
      reason:
        input.classification === "NOT_OVERTIME" ? "NOT_OVERTIME" : "CLASSIFICATION_UNCONFIRMED",
    };
  if (!input.workPayNotAlreadyIncludedConfirmed)
    return { kind: "unavailable", reason: "WORK_PAY_DUPLICATION_UNCONFIRMED" };
  if (
    !["CASH", "TIME"].includes(input.workSettlement) ||
    !["CASH", "TIME"].includes(input.premiumSettlement)
  )
    return { kind: "unavailable", reason: "SETTLEMENT_UNCONFIRMED" };

  const selected = resolveTariffSelection(pkg, variantId, "VKA");
  const canonicalGroup = groupId.toLowerCase();
  if (
    selected?.familyId !== "tvoed-vka-annex-a" ||
    selected.engineId !== "tvoed-annex-a-v1" ||
    !selected.groups.some((group) => group.id === canonicalGroup && group.levels.includes(stepId))
  )
    return { kind: "unavailable", reason: "UNKNOWN_SELECTION" };
  const table = pkg.rules.payTables.find((row) => row.id === selected.region.payTableId);
  const pay = (step: string) =>
    table?.entries.filter((entry) => entry.groupId === canonicalGroup && entry.stepId === step);
  const stage = Number(stepId.slice(1));
  if (!/^s[1-6]$/u.test(stepId) || !Number.isInteger(stage))
    return { kind: "unavailable", reason: "MISSING_TABLE_VALUE" };
  const workStepId = `s${Math.min(stage, Number(policy.workPayMaximumStepId.slice(1)))}`;
  const workPay = pay(workStepId);
  const premiumPay = pay(policy.premiumReferenceStepId);
  if (workPay?.length !== 1 || premiumPay?.length !== 1)
    return { kind: "unavailable", reason: "MISSING_TABLE_VALUE" };
  const rate = policy.rateBands.find((band) => band.groupIds.includes(canonicalGroup));
  if (!rate) return { kind: "unavailable", reason: "MISSING_RATE" };
  const divisor = policy.standardFullTimeWeeklyMinutes * policy.monthlyFactorThousandths;
  const workHourlyNumerator = workPay[0].monthlyCents * 60000;
  const premiumHourlyNumerator = premiumPay[0].monthlyCents * 60000;
  if (!Number.isSafeInteger(workHourlyNumerator) || !Number.isSafeInteger(premiumHourlyNumerator))
    return { kind: "unavailable", reason: "AMOUNT_OVERFLOW" };
  const workHourlyCents = roundRemunerationCents(workHourlyNumerator, divisor);
  const premiumHourlyCents = roundRemunerationCents(premiumHourlyNumerator, divisor);
  const workNominalNumerator = workHourlyCents * minutes;
  const premiumNominalNumerator = premiumHourlyCents * rate.premiumBasisPoints * minutes;
  if (!Number.isSafeInteger(workNominalNumerator) || !Number.isSafeInteger(premiumNominalNumerator))
    return { kind: "unavailable", reason: "AMOUNT_OVERFLOW" };
  const workNominal = roundRemunerationCents(workNominalNumerator, 60);
  const premiumNominal = roundRemunerationCents(premiumNominalNumerator, 600000);
  const positions = [
    {
      component: "WORK_HOURS" as const,
      settlement: input.workSettlement as "CASH" | "TIME",
      minutes,
      referenceHourlyCents: workHourlyCents,
      percentageBasisPoints: 10000 as const,
      nominalAmountCents: workNominal,
      cashAmountCents: input.workSettlement === "CASH" ? workNominal : 0,
    },
    {
      component: "OVERTIME_PREMIUM" as const,
      settlement: input.premiumSettlement as "CASH" | "TIME",
      minutes,
      referenceHourlyCents: premiumHourlyCents,
      percentageBasisPoints: rate.premiumBasisPoints,
      nominalAmountCents: premiumNominal,
      cashAmountCents: input.premiumSettlement === "CASH" ? premiumNominal : 0,
    },
  ] as const;
  const cashSubtotalCents = positions[0].cashAmountCents + positions[1].cashAmountCents;
  if (!Number.isSafeInteger(cashSubtotalCents))
    return { kind: "unavailable", reason: "AMOUNT_OVERFLOW" };
  return {
    kind: "draft-confirmed-overtime",
    status: "estimated",
    completeGross: false,
    date,
    payoutMonth: null,
    packageId: pkg.packageId,
    versionId: pkg.versionId,
    groupId: canonicalGroup,
    stepId,
    cashSubtotalCents,
    sourceIds: [...policy.sourceIds],
    positions,
  };
}
