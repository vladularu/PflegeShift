import { describe, expect, it } from "vitest";
import type { ComplianceIssue, MonthlyComplianceResult } from "@/domain/types";
import { buildAnnualCoreReport } from "./annual-core-report";
import {
  classifyChecks,
  selectAnnualCheckDisplay,
  selectVisibleCompliance,
} from "./check-visibility";

const issues: readonly ComplianceIssue[] = [
  {
    id: "legal",
    kind: "LEGAL",
    severity: "critical",
    rule: "REST",
    title: "Ruhezeit",
    description: "",
    date: "2026-09-01",
    relatedShiftIds: [],
  },
  {
    id: "info",
    kind: "LEGAL",
    severity: "info",
    rule: "EVIDENCE",
    title: "Angaben offen",
    description: "",
    date: "2026-09-02",
    relatedShiftIds: [],
  },
  {
    id: "planning",
    kind: "PLANNING",
    severity: "warning",
    rule: "NIGHTS",
    title: "Nachtserie",
    description: "",
    date: "2026-09-03",
    relatedShiftIds: [],
  },
];
const monthly: MonthlyComplianceResult = {
  month: "2026-09",
  issues,
  criticalCount: 1,
  warningCount: 1,
  infoCount: 1,
  affectedDates: issues.map((issue) => issue.date),
};

describe("display-only check selection", () => {
  it("retains legal critical and informational issues and derives counts/dates without mutation", () => {
    expect(selectVisibleCompliance(monthly, false)).toEqual({
      ...monthly,
      issues: issues.slice(0, 2),
      warningCount: 0,
      affectedDates: issues.slice(0, 2).map((issue) => issue.date),
    });
    expect(selectVisibleCompliance(monthly, true)).toEqual(monthly);
    expect(monthly.issues).toHaveLength(3);
  });
  it("projects annual and month counts from cached categories without changing pay/time/coverage", () => {
    const core = buildAnnualCoreReport(2026, [], { timeZone: "Europe/Berlin" });
    const report = {
      ...core,
      months: core.months.map((month, index) => ({
        ...month,
        checkCounts: classifyChecks(index === 8 ? issues : []),
      })),
      estimatedGrossAmount: 12345,
      complianceCoverageComplete: false,
    };
    const hidden = selectAnnualCheckDisplay(report, false);
    expect([hidden.criticalCount, hidden.warningCount, hidden.infoCount]).toEqual([1, 0, 1]);
    expect(hidden.months[8].infoCount).toBe(1);
    expect(hidden.estimatedGrossAmount).toBe(12345);
    expect(hidden.actualMinutes).toBe(report.actualMinutes);
    expect(hidden.complianceCoverageComplete).toBe(false);
    expect(selectAnnualCheckDisplay(report, true).warningCount).toBe(1);
    expect(selectAnnualCheckDisplay(hidden, true).warningCount).toBe(1);
  });
  it("never hides unclassified findings from older report objects", () => {
    const core = buildAnnualCoreReport(2026, [], { timeZone: "Europe/Berlin" });
    const report = { ...core, months: [{ ...core.months[0], warningCount: 2 }] };
    expect(selectAnnualCheckDisplay(report, false).warningCount).toBe(2);
  });
});
