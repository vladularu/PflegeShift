import type { CalendarEntry, MonthlySummary, ShiftEntry, UserProfile } from "@/domain/types";
import { calculateMonthlySummary } from "@/engine/monthly-summary";
import {
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
  readonly shiftTypeAnalysis: MonthlyShiftTypeAnalysis;
  readonly summary: RuleComputationResult<MonthlySummary>;
}

export function calculateMonthlyAnalysis(
  month: string,
  entries: readonly CalendarEntry[],
  profile: UserProfile,
  ruleResolver: RuleResolver,
): MonthlyAnalysisCalculation {
  const monthlyEntries = selectMonthlyAnalysisEntries(entries, month);
  const complianceShifts = captureRuleComputation(() => {
    requireResolvedPackage(ruleResolver.resolveHoliday(`${month}-01`));
    return selectComplianceShifts(entries, month, ruleResolver);
  });
  const summary = captureRuleComputation(() =>
    calculateMonthlySummary(month, monthlyEntries.monthShifts, profile, ruleResolver),
  );
  return Object.freeze({
    complianceShifts,
    monthShifts: monthlyEntries.monthShifts,
    shiftTypeAnalysis: summary.ok
      ? buildMonthlyShiftTypeAnalysis(month, monthlyEntries.monthEntries, profile, ruleResolver)
      : buildMonthlyTimedShiftTypeAnalysis(month, monthlyEntries.monthEntries, profile),
    summary,
  });
}
