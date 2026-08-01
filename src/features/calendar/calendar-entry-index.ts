import type { CalendarEntry, ShiftEntry } from "@/domain/types";

export interface CalendarEntryIndex {
  readonly visibleEntries: readonly CalendarEntry[];
  readonly entriesByDate: ReadonlyMap<string, readonly CalendarEntry[]>;
  readonly shiftsByMonth: ReadonlyMap<string, readonly ShiftEntry[]>;
}

export function buildCalendarEntryIndex(
  entries: readonly CalendarEntry[],
  options: {
    readonly showAppointments: boolean;
    readonly showShifts: boolean;
  },
): CalendarEntryIndex {
  const visibleEntries: CalendarEntry[] = [];
  const entriesByDate = new Map<string, CalendarEntry[]>();
  const shiftsByMonth = new Map<string, ShiftEntry[]>();

  for (const entry of entries) {
    if (entry.deletedAt !== null) continue;

    if (entry.kind === "SHIFT") {
      const month = entry.date.slice(0, 7);
      const monthShifts = shiftsByMonth.get(month) ?? [];
      monthShifts.push(entry);
      shiftsByMonth.set(month, monthShifts);
      if (!options.showShifts) continue;
    } else if (!options.showAppointments) {
      continue;
    }

    visibleEntries.push(entry);
    const dayEntries = entriesByDate.get(entry.date) ?? [];
    dayEntries.push(entry);
    entriesByDate.set(entry.date, dayEntries);
  }

  return Object.freeze({
    visibleEntries: Object.freeze(visibleEntries),
    entriesByDate,
    shiftsByMonth,
  });
}
