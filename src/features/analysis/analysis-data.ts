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
  const monthEntries = entries.filter(
    (entry) => entry.deletedAt === null && entry.date.startsWith(monthPrefix),
  );
  const monthShifts = monthEntries.filter(
    (entry): entry is ShiftEntry => entry.kind === "SHIFT",
  );
  const complianceShifts = entries.filter(
    (entry): entry is ShiftEntry =>
      entry.kind === "SHIFT" &&
      entry.deletedAt === null &&
      entry.date >= complianceStart &&
      entry.date <= complianceEnd,
  );
  const allowanceShifts = entries.filter(
    (entry): entry is ShiftEntry =>
      entry.kind === "SHIFT" &&
      entry.deletedAt === null &&
      entry.date >= allowanceStart &&
      entry.date <= monthEnd,
  );

  return {
    monthEntries,
    monthShifts,
    complianceShifts,
    allowanceShifts,
  };
}
