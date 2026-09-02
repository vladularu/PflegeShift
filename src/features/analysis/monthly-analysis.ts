import type {
  CalendarEntry,
  MonthlyPayEstimate,
  MonthlySummary,
  MonthlyTariffDecision,
  ShiftEntry,
  TvoedWorkPatternSettings,
  UserProfile,
} from "@/domain/types";
import { calculateMonthlyPayEstimate } from "@/engine/pay";
import { calculateMonthlySummary } from "@/engine/monthly-summary";
import {
  selectAllowanceShifts,
  selectComplianceShifts,
  selectMonthlyAnalysisEntries,
} from "@/features/analysis/analysis-data";
import {
  buildMonthlyShiftTypeAnalysis,
  buildMonthlyTimedShiftTypeAnalysis,
  type MonthlyShiftTypeAnalysis,
} from "@/features/analysis/analysis-metrics";
import {
  captureRuleComputation,
  type RuleComputationResult,
} from "@/features/analysis/rule-computation";
import { requireResolvedPackage, type RuleResolver } from "@/rules/rule-resolver";

export interface MonthlyAnalysisCalculation {
  readonly complianceShifts: RuleComputationResult<readonly ShiftEntry[]>;
  readonly monthShifts: readonly ShiftEntry[];
  readonly pay: RuleComputationResult<MonthlyPayEstimate>;
  readonly shiftTypeAnalysis: MonthlyShiftTypeAnalysis;
  readonly summary: RuleComputationResult<MonthlySummary>;
}

export function calculateMonthlyAnalysis(
  month: string,
  entries: readonly CalendarEntry[],
  profile: UserProfile,
  tariffDecisions: readonly MonthlyTariffDecision[],
  workPatternSettings: TvoedWorkPatternSettings | undefined,
  ruleResolver: RuleResolver,
): MonthlyAnalysisCalculation {
  const monthlyEntries = selectMonthlyAnalysisEntries(entries, month);
  const complianceShifts = captureRuleComputation(() => {
    requireResolvedPackage(ruleResolver.resolveHoliday(`${month}-01`));
    return selectComplianceShifts(entries, month, ruleResolver);
  });
  const decision = tariffDecisions.find((item) => item.month === month) ?? null;
  const summary = captureRuleComputation(() =>
    calculateMonthlySummary(month, monthlyEntries.monthShifts, profile, ruleResolver),
  );
  return Object.freeze({
    complianceShifts,
    monthShifts: monthlyEntries.monthShifts,
    pay: captureRuleComputation(() => {
      const allowanceShifts =
        profile.tariff === null
          ? monthlyEntries.monthShifts
          : selectAllowanceShifts(entries, month, ruleResolver);
      return calculateMonthlyPayEstimate(
        month,
        monthlyEntries.monthShifts,
        profile,
        decision,
        allowanceShifts,
        workPatternSettings,
        ruleResolver,
      );
    }),
    shiftTypeAnalysis: summary.ok
      ? buildMonthlyShiftTypeAnalysis(month, monthlyEntries.monthEntries, profile, ruleResolver)
      : buildMonthlyTimedShiftTypeAnalysis(month, monthlyEntries.monthEntries, profile),
    summary,
  });
}
