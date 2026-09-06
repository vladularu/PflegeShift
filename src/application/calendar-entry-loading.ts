import type { CalendarEntryRange } from "@/application/pflegeshift-snapshot";
import type { CalendarEntry } from "@/domain/types";
import { createMonthGrid } from "@/engine/calendar";
import { sortCalendarEntries } from "@/engine/calendar-entry-order";

export function calendarRangeCoversMonth(range: CalendarEntryRange | null, month: string): boolean {
  if (range === null) return false;
  const grid = createMonthGrid(month);
  return range.startDate <= grid[0].date && range.endDate >= grid[grid.length - 1].date;
}

// Preserve saves and deletions completed while the range query was in flight.
export function reconcileCalendarRange(
  loaded: readonly CalendarEntry[],
  before: readonly CalendarEntry[],
  current: readonly CalendarEntry[],
  range: CalendarEntryRange,
  deleted: ReadonlySet<string> = new Set(),
): readonly CalendarEntry[] {
  const key = (entry: CalendarEntry) => `${entry.kind}:${entry.id}`;
  const baseline = new Map(before.map((entry) => [key(entry), entry]));
  const live = new Map(current.map((entry) => [key(entry), entry]));
  const result = new Map(loaded.map((entry) => [key(entry), entry]));
  for (const id of deleted) if (!live.has(id)) result.delete(id);
  for (const id of baseline.keys()) if (!live.has(id)) result.delete(id);
  for (const [id, entry] of live) {
    if (baseline.get(id) === entry) continue;
    result.delete(id);
    if (
      entry.deletedAt === null &&
      entry.date <= range.endDate &&
      (entry.date >= range.startDate || (entry.kind === "APPOINTMENT" && entry.recurrence != null))
    )
      result.set(id, entry);
  }
  return sortCalendarEntries([...result.values()]);
}
