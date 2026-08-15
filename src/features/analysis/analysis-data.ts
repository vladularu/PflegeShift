import { Temporal } from "@js-temporal/polyfill";

import type { CalendarEntry, ShiftEntry } from "@/domain/types";

export interface AnalysisEntryWindow {
  readonly monthEntries: readonly CalendarEntry[];
  readonly monthShifts: readonly ShiftEntry[];
  readonly complianceShifts: readonly ShiftEntry[];
  readonly allowanceShifts: readonly ShiftEntry[];
}

export function selectAnalysisEntryWindow(
  entries: readonly CalendarEntry[],
  month: string,
): AnalysisEntryWindow {
  const first = Temporal.PlainDate.from(`${month}-01`);
  const complianceStart = first.subtract({ days: 8 }).toString();
  const allowanceStart = first.subtract({ months: 2 }).toString();
  const monthEnd = first.add({ months: 1 }).subtract({ days: 1 }).toString();
  const complianceEnd = Temporal.PlainDate.from(monthEnd).add({ days: 28 }).toString();
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
