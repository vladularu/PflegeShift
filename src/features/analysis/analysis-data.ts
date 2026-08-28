import { Temporal } from "@js-temporal/polyfill";

import type { CalendarEntry, ShiftEntry } from "@/domain/types";
import {
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

export function selectAnalysisEntryWindow(
  entries: readonly CalendarEntry[],
  month: string,
  ruleResolver: RuleResolver = bundledRuleResolver,
): AnalysisEntryWindow {
  const first = Temporal.PlainDate.from(`${month}-01`);
  const legalWindow = getLegalCalculationWindow(first.toString(), ruleResolver);
  const complianceStart = first.subtract({ days: legalWindow.lookbackDays }).toString();
  const allowanceStart = first
    .subtract({
      months: getTariffAssessmentLookbackMonths(first.toString(), ruleResolver),
    })
    .toString();
  const monthEnd = first.add({ months: 1 }).subtract({ days: 1 }).toString();
  const complianceEnd = Temporal.PlainDate.from(monthEnd)
    .add({ days: legalWindow.lookaheadDays })
    .toString();
  const monthPrefix = `${month}-`;
  const monthEntries: CalendarEntry[] = [];
  const monthShifts: ShiftEntry[] = [];
  const complianceShifts: ShiftEntry[] = [];
  const allowanceShifts: ShiftEntry[] = [];

  for (const entry of entries) {
    if (entry.deletedAt !== null) continue;
    const inMonth = entry.date.startsWith(monthPrefix);
    if (inMonth) monthEntries.push(entry);
    if (entry.kind !== "SHIFT") continue;
    if (inMonth) monthShifts.push(entry);
    if (entry.date >= complianceStart && entry.date <= complianceEnd) {
      complianceShifts.push(entry);
    }
    if (entry.date >= allowanceStart && entry.date <= monthEnd) {
      allowanceShifts.push(entry);
    }
  }

  return {
    monthEntries,
    monthShifts,
    complianceShifts,
    allowanceShifts,
  };
}
