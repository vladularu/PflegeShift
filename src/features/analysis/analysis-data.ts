import { Temporal } from "@js-temporal/polyfill";

import type { CalendarEntry, ShiftEntry } from "@/domain/types";
import {
  getLegalCalculationEnd,
  getLegalCalculationWindow,
  getTariffAssessmentLookbackMonths,
} from "@/rules/calculation-windows";
import { bundledRuleResolver, type RuleResolver } from "@/rules/rule-resolver";

export interface AnalysisEntryWindow {
  readonly monthEntries: readonly CalendarEntry[];
  readonly monthShifts: readonly ShiftEntry[];
  readonly complianceShifts: readonly ShiftEntry[];
  readonly allowanceShifts: readonly ShiftEntry[];
}

export type MonthlyAnalysisEntries = Pick<AnalysisEntryWindow, "monthEntries" | "monthShifts">;

export function selectMonthlyAnalysisEntries(
  entries: readonly CalendarEntry[],
  month: string,
): MonthlyAnalysisEntries {
  const monthPrefix = `${month}-`;
  const monthEntries: CalendarEntry[] = [];
  const monthShifts: ShiftEntry[] = [];
  for (const entry of entries) {
    if (entry.deletedAt !== null || !entry.date.startsWith(monthPrefix)) continue;
    monthEntries.push(entry);
    if (entry.kind === "SHIFT") monthShifts.push(entry);
  }
  return Object.freeze({
    monthEntries: Object.freeze(monthEntries),
    monthShifts: Object.freeze(monthShifts),
  });
}

export function selectComplianceShifts(
  entries: readonly CalendarEntry[],
  month: string,
  ruleResolver: RuleResolver = bundledRuleResolver,
): readonly ShiftEntry[] {
  const first = Temporal.PlainDate.from(`${month}-01`);
  const legalWindow = getLegalCalculationWindow(first.toString(), ruleResolver);
  const baseComplianceStart = first.subtract({ days: legalWindow.lookbackDays });
  const yearStart = Temporal.PlainDate.from({ year: first.year, month: 1, day: 1 });
  const complianceStart = (
    legalWindow.calendarYearCoverage &&
    Temporal.PlainDate.compare(yearStart, baseComplianceStart) < 0
      ? yearStart
      : baseComplianceStart
  ).toString();
  const monthEnd = first.add({ months: 1 }).subtract({ days: 1 }).toString();
  const baseComplianceEnd = getLegalCalculationEnd(Temporal.PlainDate.from(monthEnd), legalWindow);
  const yearEnd = Temporal.PlainDate.from({ year: first.year, month: 12, day: 31 });
  const complianceEnd = (
    legalWindow.calendarYearCoverage && Temporal.PlainDate.compare(yearEnd, baseComplianceEnd) > 0
      ? yearEnd
      : baseComplianceEnd
  ).toString();
  return Object.freeze(
    entries.filter(
      (entry): entry is ShiftEntry =>
        entry.kind === "SHIFT" &&
        entry.deletedAt === null &&
        entry.date >= complianceStart &&
        entry.date <= complianceEnd,
    ),
  );
}

export function selectAllowanceShifts(
  entries: readonly CalendarEntry[],
  month: string,
  ruleResolver: RuleResolver = bundledRuleResolver,
): readonly ShiftEntry[] {
  const first = Temporal.PlainDate.from(`${month}-01`);
  const allowanceStart = first
    .subtract({ months: getTariffAssessmentLookbackMonths(first.toString(), ruleResolver) })
    .toString();
  const monthEnd = first.add({ months: 1 }).subtract({ days: 1 }).toString();
  return Object.freeze(
    entries.filter(
      (entry): entry is ShiftEntry =>
        entry.kind === "SHIFT" &&
        entry.deletedAt === null &&
        entry.date >= allowanceStart &&
        entry.date <= monthEnd,
    ),
  );
}

export function selectAnalysisEntryWindow(
  entries: readonly CalendarEntry[],
  month: string,
  ruleResolver: RuleResolver = bundledRuleResolver,
): AnalysisEntryWindow {
  const { monthEntries, monthShifts } = selectMonthlyAnalysisEntries(entries, month);
  const complianceShifts = selectComplianceShifts(entries, month, ruleResolver);
  const allowanceShifts = selectAllowanceShifts(entries, month, ruleResolver);

  return {
    monthEntries,
    monthShifts,
    complianceShifts,
    allowanceShifts,
  };
}
