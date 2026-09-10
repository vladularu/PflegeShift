import type { ComplianceIssue, MonthlyComplianceResult } from "@/domain/types";
import type { AnnualReport } from "./annual-report";

export interface CheckCounts {
  readonly criticalCount: number;
  readonly warningCount: number;
  readonly infoCount: number;
}
export interface ClassifiedCheckCounts {
  readonly legal: CheckCounts;
  readonly planning: CheckCounts;
}
const emptyCounts = (): CheckCounts => ({ criticalCount: 0, warningCount: 0, infoCount: 0 });
export function countChecks(issues: readonly ComplianceIssue[]): CheckCounts {
  return {
    criticalCount: issues.filter((issue) => issue.severity === "critical").length,
    warningCount: issues.filter((issue) => issue.severity === "warning").length,
    infoCount: issues.filter((issue) => issue.severity === "info").length,
  };
}
export function classifyChecks(issues: readonly ComplianceIssue[]): ClassifiedCheckCounts {
  return {
    legal: countChecks(issues.filter((issue) => issue.kind !== "PLANNING")),
    planning: countChecks(issues.filter((issue) => issue.kind === "PLANNING")),
  };
}
export function addCheckCounts(a: CheckCounts, b: CheckCounts): CheckCounts {
  return {
    criticalCount: a.criticalCount + b.criticalCount,
    warningCount: a.warningCount + b.warningCount,
    infoCount: a.infoCount + b.infoCount,
  };
}
export function selectVisibleCompliance(
  result: MonthlyComplianceResult,
  showPlanning: boolean,
): MonthlyComplianceResult {
  const issues = result.issues.filter((issue) => showPlanning || issue.kind !== "PLANNING");
  return {
    ...result,
    issues,
    ...countChecks(issues),
    affectedDates: [...new Set(issues.map((issue) => issue.date))].sort(),
  };
}
export function selectAnnualCheckDisplay(
  report: AnnualReport,
  showPlanning: boolean,
): AnnualReport {
  const months = report.months.map((month) => {
    // Older/test reports without category metadata must never hide unknown legal findings.
    const counts = month.checkCounts
      ? showPlanning
        ? addCheckCounts(month.checkCounts.legal, month.checkCounts.planning)
        : month.checkCounts.legal
      : {
          criticalCount: month.criticalCount,
          warningCount: month.warningCount,
          infoCount: month.infoCount ?? 0,
        };
    return { ...month, ...counts };
  });
  const totals = months.reduce<CheckCounts>(
    (sum, month) => addCheckCounts(sum, month),
    emptyCounts(),
  );
  return { ...report, months, ...totals };
}

export const PLANNING_HIDDEN_NOTICE =
  "Planungshinweise ausgeblendet · gesetzliche Hinweise bleiben sichtbar.";
