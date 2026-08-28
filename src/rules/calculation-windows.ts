import { BUNDLED_TARIFF_RULES } from "@/rules/bundled-rules";
import {
  bundledRuleResolver,
  requireResolvedPackage,
  type RuleResolver,
} from "@/rules/rule-resolver";

export interface LegalCalculationWindow {
  readonly lookbackDays: number;
  readonly lookaheadDays: number;
  readonly calendarYearCoverage: boolean;
}

export function getTariffAssessmentLookbackMonths(
  effectiveDate: string,
  ruleResolver: RuleResolver = bundledRuleResolver,
): number {
  const resolution = ruleResolver.resolveTariff(effectiveDate);
  return resolution.ok
    ? resolution.value.rules.workPatternPolicy.assessmentLookbackMonths
    : BUNDLED_TARIFF_RULES.at(-1)!.rules.workPatternPolicy.assessmentLookbackMonths;
}

export function getLegalCalculationWindow(
  effectiveDate: string,
  ruleResolver: RuleResolver = bundledRuleResolver,
): LegalCalculationWindow {
  const legalPackage = requireResolvedPackage(ruleResolver.resolveLegal(effectiveDate));
  const rules = legalPackage.rules;
  return Object.freeze({
    lookbackDays:
      Math.max(
        rules.planning.consecutiveWorkDaysWarning,
        rules.planning.consecutiveNightShiftsWarning,
        rules.planning.consecutiveWeekendGapDays,
      ) + 1,
    lookaheadDays: Math.max(
      rules.nightWork.averageWindowDays ?? 0,
      ...rules.restPeriod.deviations.map((deviation) => deviation.compensationWithinDays),
    ),
    calendarYearCoverage:
      legalPackage.engineContractVersion === 3 && rules.nightWork.workerQualification !== undefined,
  });
}
