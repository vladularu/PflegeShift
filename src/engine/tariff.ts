import {
  PAY_GROUPS,
  PAY_LEVELS,
  type PayGroup,
  type PayLevel,
  type TariffProfile,
} from "@/domain/types";
import { BUNDLED_TARIFF_RULES } from "@/rules/bundled-rules";
import type { RulePayTable, RuleTariffPackage } from "@/rules/contracts.generated";
import { bundledRuleResolver, type RuleResolver } from "@/rules/rule-resolver";

type TariffValues = Readonly<Record<PayLevel, number>>;
type TariffTable = Readonly<Record<PayGroup, TariffValues>>;

export interface TariffVersion {
  readonly id: string;
  readonly label: string;
  readonly validFrom: string;
  readonly validTo: string | null;
  readonly monthly: TariffTable;
  readonly hourly: TariffTable;
}

const VERSION_CACHE = new WeakMap<RuleTariffPackage, TariffVersion>();

function selectedPayTable(rulePackage: RuleTariffPackage): RulePayTable {
  const selected = rulePackage.rules.payTables.find(
    (table) => table.id === rulePackage.rules.selector.payTableId,
  );
  if (!selected) {
    throw new Error(
      `Tariff package ${rulePackage.packageId}/${rulePackage.versionId} has no selected pay table.`,
    );
  }
  return selected;
}

function tableAmount(
  rulePackage: RuleTariffPackage,
  payGroup: PayGroup,
  stepId: string,
  amount: "monthlyCents" | "hourlyCents",
): number | null {
  const entry = selectedPayTable(rulePackage).entries.find(
    (candidate) =>
      candidate.groupId === payGroup.toLowerCase() && candidate.stepId === stepId.toLowerCase(),
  );
  return entry ? entry[amount] / 100 : null;
}

function materializeTable(
  rulePackage: RuleTariffPackage,
  amount: "monthlyCents" | "hourlyCents",
): TariffTable {
  return Object.freeze(
    Object.fromEntries(
      PAY_GROUPS.map((payGroup) => [
        payGroup,
        Object.freeze(
          Object.fromEntries(
            PAY_LEVELS.map((payLevel) => [
              payLevel,
              tableAmount(rulePackage, payGroup, `s${payLevel}`, amount) ?? 0,
            ]),
          ) as Record<PayLevel, number>,
        ),
      ]),
    ) as Record<PayGroup, TariffValues>,
  );
}

function tariffVersion(rulePackage: RuleTariffPackage): TariffVersion {
  const cached = VERSION_CACHE.get(rulePackage);
  if (cached) return cached;
  const version = Object.freeze({
    id: rulePackage.versionId,
    label: rulePackage.label,
    validFrom: rulePackage.validFrom,
    validTo: rulePackage.validTo,
    monthly: materializeTable(rulePackage, "monthlyCents"),
    hourly: materializeTable(rulePackage, "hourlyCents"),
  });
  VERSION_CACHE.set(rulePackage, version);
  return version;
}

export const TARIFF_VERSIONS: readonly TariffVersion[] = Object.freeze(
  BUNDLED_TARIFF_RULES.map(tariffVersion),
);

export function getTariffRulePackage(
  date: string,
  ruleResolver: RuleResolver = bundledRuleResolver,
): RuleTariffPackage | null {
  const resolution = ruleResolver.resolveTariff(date);
  return resolution.ok ? resolution.value : null;
}

export function getTariffVersion(
  date: string,
  ruleResolver: RuleResolver = bundledRuleResolver,
): TariffVersion | null {
  const rulePackage = getTariffRulePackage(date, ruleResolver);
  return rulePackage ? tariffVersion(rulePackage) : null;
}

export function getMonthlyTableAmount(
  profile: TariffProfile,
  date: string,
  ruleResolver: RuleResolver = bundledRuleResolver,
): number | null {
  const rulePackage = getTariffRulePackage(date, ruleResolver);
  return rulePackage
    ? tableAmount(rulePackage, profile.payGroup, `s${profile.payLevel}`, "monthlyCents")
    : null;
}

export function getIndividualHourlyRate(
  profile: TariffProfile,
  date: string,
  ruleResolver: RuleResolver = bundledRuleResolver,
): number | null {
  const rulePackage = getTariffRulePackage(date, ruleResolver);
  return rulePackage
    ? tableAmount(rulePackage, profile.payGroup, `s${profile.payLevel}`, "hourlyCents")
    : null;
}

export function getHourlyTableAmountForStep(
  profile: TariffProfile,
  date: string,
  stepId: string,
  ruleResolver: RuleResolver = bundledRuleResolver,
): number | null {
  const rulePackage = getTariffRulePackage(date, ruleResolver);
  return rulePackage ? tableAmount(rulePackage, profile.payGroup, stepId, "hourlyCents") : null;
}

export function getOvertimeBaseHourlyRate(
  rulePackage: RuleTariffPackage,
  profile: TariffProfile,
  individualRate: number,
): number {
  const maximumStepId = rulePackage.rules.overtimeBaseRule?.maximumStepId;
  if (maximumStepId === undefined) return individualRate;
  const maximumRate = tableAmount(rulePackage, profile.payGroup, maximumStepId, "hourlyCents");
  if (maximumRate === null) {
    throw new Error(
      `Tariff package ${rulePackage.packageId}/${rulePackage.versionId} has no capped hourly rate for ${profile.payGroup}/${maximumStepId}.`,
    );
  }
  return Math.min(individualRate, maximumRate);
}

export function getPremiumHourlyRate(
  profile: TariffProfile,
  date: string,
  ruleResolver: RuleResolver = bundledRuleResolver,
): number | null {
  const rulePackage = getTariffRulePackage(date, ruleResolver);
  if (!rulePackage) return null;
  const referenceSteps = new Set(
    rulePackage.rules.premiumRules
      .filter((rule) => rule.rateBasis === "TABLE_STEP" && rule.referenceStepId !== null)
      .map((rule) => rule.referenceStepId!),
  );
  if (referenceSteps.size !== 1) {
    throw new Error(
      `Tariff package ${rulePackage.packageId}/${rulePackage.versionId} has no unique premium reference step.`,
    );
  }
  return tableAmount(rulePackage, profile.payGroup, [...referenceSteps][0], "hourlyCents");
}
