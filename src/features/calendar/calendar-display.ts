import type { CalendarEntry } from "@/domain/types";

export type CalendarViewMode = "MONTH" | "YEAR";

export interface CalendarEntryPreview {
  readonly entries: readonly CalendarEntry[];
  readonly overflowCount: number;
}

export type CalendarDayPressAction = "OPEN_QUICK_ENTRY" | "STAMP" | "AWAIT_TOOL";

export function yearMonths(year: number): readonly string[] {
  return Object.freeze(
    Array.from({ length: 12 }, (_, index) => `${year}-${String(index + 1).padStart(2, "0")}`),
  );
}

export function calendarEntryPreview(
  entries: readonly CalendarEntry[],
  limit = 2,
): CalendarEntryPreview {
  const visibleLimit = Math.max(0, limit);
  return Object.freeze({
    entries: Object.freeze(entries.slice(0, visibleLimit)),
    overflowCount: Math.max(0, entries.length - visibleLimit),
  });
}

export function calendarDayPressAction(
  plannerMode: boolean,
  hasStampTool: boolean,
): CalendarDayPressAction {
  if (!plannerMode) return "OPEN_QUICK_ENTRY";
  return hasStampTool ? "STAMP" : "AWAIT_TOOL";
}
