import {
  PAY_GROUPS,
  payLevelsForGroup,
  type PayGroup,
  type PayLevel,
  type TariffProfile,
} from "@/domain/types";
import { BUNDLED_TARIFF_RULES } from "@/rules/bundled-rules";
import type { RulePayTable, RuleTariffPackage } from "@/rules/contracts.generated";
import { bundledRuleResolver, type RuleResolver } from "@/rules/rule-resolver";

type TariffValues = Readonly<Partial<Record<PayLevel, number | null>>>;
type TariffTable = Readonly<Record<PayGroup, TariffValues>>;

export interface TariffVersion {
  readonly id: string;
  readonly label: string;
  readonly validFrom: string;
  readonly validTo: string | null;
  readonly monthly: TariffTable;
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
): number | null {
  const entry = selectedPayTable(rulePackage).entries.find(
    (candidate) =>
      candidate.groupId === payGroup.toLowerCase() && candidate.stepId === stepId.toLowerCase(),
  );
  return entry ? entry.monthlyCents / 100 : null;
}

function hourlyEntryAmount(
  rulePackage: RuleTariffPackage,
  payGroup: PayGroup,
  stepId: string,
): number | null {
  const entry = selectedPayTable(rulePackage).entries.find(
    (candidate) =>
      candidate.groupId === payGroup.toLowerCase() && candidate.stepId === stepId.toLowerCase(),
  );
  return entry?.hourlyCents === undefined ? null : entry.hourlyCents / 100;
}

function materializeMonthlyTable(rulePackage: RuleTariffPackage): TariffTable {
  return Object.freeze(
    Object.fromEntries(
      PAY_GROUPS.map((payGroup) => [
        payGroup,
        Object.freeze(
          Object.fromEntries(
            payLevelsForGroup(payGroup).map((payLevel) => [
              payLevel,
              tableAmount(rulePackage, payGroup, `s${payLevel}`),
            ]),
          ),
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
    monthly: materializeMonthlyTable(rulePackage),
  });
  VERSION_CACHE.set(rulePackage, version);
  return version;
}

function resolveFullTimeWeeklyMinutes(
  rulePackage: RuleTariffPackage,
  profile: TariffProfile,
): number {
  const configuredRules = rulePackage.rules.weeklyWorkingTimeRules;
  if (configuredRules === undefined) return profile.fullTimeWeeklyMinutes;
  const matches = configuredRules.filter(
    (rule) =>
      rule.sectors.includes(profile.sector) && rule.tariffRegions.includes(profile.tariffRegion),
  );
  if (matches.length !== 1) {
    throw new Error(
      `Tariff package ${rulePackage.packageId}/${rulePackage.versionId} has no unique weekly working time for ${profile.sector}/${profile.tariffRegion}.`,
    );
  }
  return matches[0].fullTimeWeeklyMinutes;
}

export function getTariffFullTimeWeeklyMinutes(
  profile: TariffProfile,
  date: string,
  ruleResolver: RuleResolver = bundledRuleResolver,
): number | null {
  const rulePackage = getTariffRulePackage(date, ruleResolver);
  return rulePackage ? resolveFullTimeWeeklyMinutes(rulePackage, profile) : null;
}

function hourlyTableAmount(
  rulePackage: RuleTariffPackage,
  profile: TariffProfile,
  stepId: string,
): number | null {
  // Preserve the frozen P7–P16 legacy estimates. Newly supported P5/P6 use
  // the contractual weekly hours, as v3 packages already do for every group.
  if (
    rulePackage.engineContractVersion < 3 &&
    profile.payGroup !== "P5" &&
    profile.payGroup !== "P6"
  ) {
    return hourlyEntryAmount(rulePackage, profile.payGroup, stepId);
  }
  const monthlyAmount = tableAmount(rulePackage, profile.payGroup, stepId);
  if (monthlyAmount === null) return null;
  const monthlyFactor =
    (rulePackage.rules.hourlyCalculation?.monthlyFactorThousandths ?? 4_348) / 1_000;
  const weeklyHours = resolveFullTimeWeeklyMinutes(rulePackage, profile) / 60;
  return Math.round((monthlyAmount / (monthlyFactor * weeklyHours)) * 100) / 100;
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
  return rulePackage ? tableAmount(rulePackage, profile.payGroup, `s${profile.payLevel}`) : null;
}

export function getIndividualHourlyRate(
  profile: TariffProfile,
  date: string,
  ruleResolver: RuleResolver = bundledRuleResolver,
): number | null {
  const rulePackage = getTariffRulePackage(date, ruleResolver);
  return rulePackage ? hourlyTableAmount(rulePackage, profile, `s${profile.payLevel}`) : null;
}

export function getHourlyTableAmountForStep(
  profile: TariffProfile,
  date: string,
  stepId: string,
  ruleResolver: RuleResolver = bundledRuleResolver,
): number | null {
  const rulePackage = getTariffRulePackage(date, ruleResolver);
  return rulePackage ? hourlyTableAmount(rulePackage, profile, stepId) : null;
}

export function getOvertimeBaseHourlyRate(
  rulePackage: RuleTariffPackage,
  profile: TariffProfile,
  individualRate: number,
): number {
  const maximumStepId = rulePackage.rules.overtimeBaseRule?.maximumStepId;
  if (maximumStepId === undefined) return individualRate;
  const maximumRate = hourlyTableAmount(rulePackage, profile, maximumStepId);
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
  return hourlyTableAmount(rulePackage, profile, [...referenceSteps][0]);
}
