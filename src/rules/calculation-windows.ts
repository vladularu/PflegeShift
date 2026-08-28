import { Temporal } from "@js-temporal/polyfill";

import { BUNDLED_TARIFF_RULES } from "@/rules/bundled-rules";
import {
  bundledRuleResolver,
  requireResolvedPackage,
  type RuleResolver,
} from "@/rules/rule-resolver";

export interface LegalCalculationWindow {
  readonly lookbackDays: number;
  readonly lookaheadDays: number;
  readonly shortAssessmentLookbackDays: number;
  readonly shortAssessmentLookaheadDays: number;
  readonly lookaheadCalendarMonths: number;
  readonly calendarYearCoverage: boolean;
}

export function getLegalCalculationEnd(
  monthEnd: Temporal.PlainDate,
  window: LegalCalculationWindow,
): Temporal.PlainDate {
  const dayBasedEnd = monthEnd.add({ days: window.lookaheadDays });
  const monthBasedEnd = monthEnd.add({ months: window.lookaheadCalendarMonths });
  return Temporal.PlainDate.compare(dayBasedEnd, monthBasedEnd) >= 0 ? dayBasedEnd : monthBasedEnd;
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
  const sundayHolidayRest =
    legalPackage.engineContractVersion >= 5 ? rules.sundayHolidayRest : undefined;
  const replacementRestReachDays = sundayHolidayRest
    ? Math.max(
        sundayHolidayRest.sundayCompensationPeriodDays,
        sundayHolidayRest.weekdayHolidayCompensationPeriodDays,
      ) -
      1 +
      Math.ceil(sundayHolidayRest.connectedRestMinutes / 1440)
    : 0;
  const shortAssessmentLookbackDays =
    Math.max(
      rules.planning.consecutiveWorkDaysWarning,
      rules.planning.consecutiveNightShiftsWarning,
      rules.planning.consecutiveWeekendGapDays,
    ) + 1;
  const shortAssessmentLookaheadDays = Math.max(
    rules.nightWork.averageWindowDays ?? 0,
    ...rules.restPeriod.deviations.map((deviation) => deviation.compensationWithinDays),
  );
  return Object.freeze({
    lookbackDays: Math.max(shortAssessmentLookbackDays, replacementRestReachDays),
    lookaheadDays: Math.max(shortAssessmentLookaheadDays, replacementRestReachDays),
    shortAssessmentLookbackDays,
    shortAssessmentLookaheadDays,
    lookaheadCalendarMonths:
      legalPackage.engineContractVersion >= 4
        ? (rules.workingTime.standardAverage?.calendarMonths ?? 0)
        : 0,
    calendarYearCoverage:
      (legalPackage.engineContractVersion >= 3 &&
        rules.nightWork.workerQualification !== undefined) ||
      sundayHolidayRest !== undefined,
  });
}
