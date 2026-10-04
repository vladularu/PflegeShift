import type { RuleTariffPackage } from "@/rules/contracts.generated";
import { validateRulePackage } from "@/rules/validation";
import { lookupCaritasCareTable } from "./caritas-care-table";
import { roundRemunerationCents } from "./remuneration-money";

type Settlement = "CASH" | "TIME" | "UNKNOWN";

export interface CaritasDraftOvertimeInput {
  readonly pkg: RuleTariffPackage;
  readonly date: string;
  readonly variantId: string;
  readonly regionId: string;
  readonly groupId: string;
  readonly stepId: string;
  /** Actual, separately identified overtime minutes; never derived from the month balance. */
  readonly minutes: number;
  /** Must be confirmed against the applicable Anlage 31/32 § 4(6-8) case. */
  readonly classification: "CONFIRMED_AVR_OVERTIME" | "NOT_OVERTIME" | "UNKNOWN";
  readonly workSettlement: Settlement;
  readonly premiumSettlement: Settlement;
}

export type CaritasDraftOvertimeResult =
  | {
      readonly kind: "draft-confirmed-overtime";
      readonly status: "estimated";
      readonly cashSubtotalCents: number;
      readonly packageId: string;
      readonly versionId: string;
      readonly date: string;
      readonly sourceIds: readonly string[];
      readonly positions: readonly {
        readonly component: "WORK_HOURS" | "OVERTIME_PREMIUM";
        readonly settlement: "CASH" | "TIME";
        readonly minutes: number;
        readonly referenceHourlyCents: number;
        readonly percentageBasisPoints: number;
        readonly nominalAmountCents: number;
        readonly cashAmountCents: number;
      }[];
    }
  | {
      readonly kind: "unavailable";
      readonly reason:
        | "INVALID_PACKAGE"
        | "OUTSIDE_VALIDITY"
        | "UNKNOWN_SELECTION"
        | "MISSING_TABLE_VALUE"
        | "MISSING_POLICY"
        | "MISSING_RATE"
        | "MISSING_WORKING_TIME"
        | "INVALID_MINUTES"
        | "CLASSIFICATION_UNCONFIRMED"
        | "NOT_OVERTIME"
        | "SETTLEMENT_UNCONFIRMED";
    };

export function calculateCaritasCareDraftOvertime(
  input: CaritasDraftOvertimeInput,
): CaritasDraftOvertimeResult {
  const { pkg, date, variantId, regionId, groupId, stepId } = input;
  if (pkg.engineContractVersion !== 14 || pkg.status !== "DRAFT" || !validateRulePackage(pkg).ok)
    return { kind: "unavailable", reason: "INVALID_PACKAGE" };
  const policy = pkg.rules.caritasOvertimePolicy;
  if (!policy) return { kind: "unavailable", reason: "MISSING_POLICY" };
  if (date < policy.validFrom || date > policy.validTo)
    return { kind: "unavailable", reason: "OUTSIDE_VALIDITY" };
  if (!Number.isSafeInteger(input.minutes) || input.minutes < 1 || input.minutes > 1440)
    return { kind: "unavailable", reason: "INVALID_MINUTES" };
  if (input.classification !== "CONFIRMED_AVR_OVERTIME")
    return {
      kind: "unavailable",
      reason:
        input.classification === "NOT_OVERTIME" ? "NOT_OVERTIME" : "CLASSIFICATION_UNCONFIRMED",
    };
  if (
    !["CASH", "TIME"].includes(input.workSettlement) ||
    !["CASH", "TIME"].includes(input.premiumSettlement)
  )
    return { kind: "unavailable", reason: "SETTLEMENT_UNCONFIRMED" };
  if (!/^[1-6]$/u.test(stepId)) return { kind: "unavailable", reason: "MISSING_TABLE_VALUE" };

  const personalStep = lookupCaritasCareTable(pkg, date, variantId, regionId, groupId, stepId);
  if (personalStep.kind === "unavailable") return personalStep;
  const workStepId = String(Math.min(Number(stepId), Number(policy.workPayMaximumStepId)));
  const work =
    workStepId === stepId
      ? personalStep
      : lookupCaritasCareTable(pkg, date, variantId, regionId, groupId, workStepId);
  if (work.kind === "unavailable") return work;
  const premium = lookupCaritasCareTable(
    pkg,
    date,
    variantId,
    regionId,
    groupId,
    policy.premiumReferenceStepId,
  );
  if (premium.kind === "unavailable") return premium;
  const rate = policy.rateBands.find((band) => band.groupIds.includes(work.groupId));
  if (!rate) return { kind: "unavailable", reason: "MISSING_RATE" };
  const times = pkg.rules.employmentWorkingTimeRules?.filter(
    (rule) =>
      rule.variantId === variantId &&
      rule.regionId === regionId &&
      rule.validFrom <= date &&
      rule.validTo !== null &&
      date <= rule.validTo,
  );
  if (times?.length !== 1) return { kind: "unavailable", reason: "MISSING_WORKING_TIME" };
  const divisor = times[0].fullTimeWeeklyMinutes * policy.monthlyFactorThousandths;
  const workHourlyCents = roundRemunerationCents(work.monthlyCents * 60000, divisor);
  const premiumHourlyCents = roundRemunerationCents(premium.monthlyCents * 60000, divisor);
  const workNominal = roundRemunerationCents(workHourlyCents * input.minutes, 60);
  const premiumNominal = roundRemunerationCents(
    premiumHourlyCents * rate.premiumBasisPoints * input.minutes,
    600000,
  );
  const positions = [
    {
      component: "WORK_HOURS" as const,
      settlement: input.workSettlement as "CASH" | "TIME",
      minutes: input.minutes,
      referenceHourlyCents: workHourlyCents,
      percentageBasisPoints: 10000,
      nominalAmountCents: workNominal,
      cashAmountCents: input.workSettlement === "CASH" ? workNominal : 0,
    },
    {
      component: "OVERTIME_PREMIUM" as const,
      settlement: input.premiumSettlement as "CASH" | "TIME",
      minutes: input.minutes,
      referenceHourlyCents: premiumHourlyCents,
      percentageBasisPoints: rate.premiumBasisPoints,
      nominalAmountCents: premiumNominal,
      cashAmountCents: input.premiumSettlement === "CASH" ? premiumNominal : 0,
    },
  ];
  return {
    kind: "draft-confirmed-overtime",
    status: "estimated",
    cashSubtotalCents: positions.reduce((sum, item) => sum + item.cashAmountCents, 0),
    packageId: pkg.packageId,
    versionId: pkg.versionId,
    date,
    sourceIds: [...new Set([...work.sourceIds, ...premium.sourceIds, ...policy.sourceIds])],
    positions,
  };
}
