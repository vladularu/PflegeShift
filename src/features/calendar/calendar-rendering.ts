import type { CalendarEntry } from "@/domain/types";
import { createVisibleMonthGrid } from "@/engine/calendar";

const visibleDatesCache = new Map<string, readonly string[]>();

function visibleDatesForMonth(month: string): readonly string[] {
  const cached = visibleDatesCache.get(month);
  if (cached) return cached;
  const dates = Object.freeze(createVisibleMonthGrid(month).map((cell) => cell.date));
  visibleDatesCache.set(month, dates);
  return dates;
}

export function calendarEntryListsEqual(
  left: readonly CalendarEntry[],
  right: readonly CalendarEntry[],
): boolean {
  if (left === right) return true;
  if (left.length !== right.length) return false;
  return left.every((entry, index) => {
    const other = right[index];
    return (
      entry === other ||
      (entry.id === other.id &&
        entry.kind === other.kind &&
        entry.revision === other.revision &&
        entry.title === other.title &&
        entry.color === other.color &&
        (entry.kind === "APPOINTMENT" ||
          other.kind === "APPOINTMENT" ||
          entry.symbol === other.symbol))
    );
  });
}

export function calendarSelectionTouchesMonth(
  month: string,
  previousDate: string | null,
  nextDate: string | null,
): boolean {
  if (previousDate === nextDate) return false;
  const dates = visibleDatesForMonth(month);
  const firstDate = dates[0];
  const lastDate = dates.at(-1);
  if (!firstDate || !lastDate) return false;
  const touchesVisibleGrid = (date: string | null) =>
    date !== null && date >= firstDate && date <= lastDate;
  return touchesVisibleGrid(previousDate) || touchesVisibleGrid(nextDate);
}

export function calendarMonthEntriesEqual(
  month: string,
  left: ReadonlyMap<string, readonly CalendarEntry[]>,
  right: ReadonlyMap<string, readonly CalendarEntry[]>,
): boolean {
  if (left === right) return true;
  return visibleDatesForMonth(month).every((date) =>
    calendarEntryListsEqual(left.get(date) ?? [], right.get(date) ?? []),
  );
}
