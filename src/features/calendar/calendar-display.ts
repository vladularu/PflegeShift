import type { CalendarEntry, ShiftEntry } from "@/domain/types";
import { calculateTimedShiftMinutes, formatMinutes } from "@/engine/working-time";

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

export function shouldUseCompactCalendarLabels(fontScale: number): boolean {
  return Number.isFinite(fontScale) && fontScale >= 1.3;
}

export function calendarShiftDetail(
  entry: ShiftEntry,
  options: {
    readonly showShiftTimes: boolean;
    readonly showShiftDuration: boolean;
    readonly timeZone: string;
  },
): string | null {
  if (entry.startTime === null || entry.endTime === null) return null;
  const parts: string[] = [];
  if (options.showShiftTimes) parts.push(entry.startTime);
  if (options.showShiftDuration) {
    parts.push(`${formatMinutes(calculateTimedShiftMinutes(entry, options.timeZone))} h`);
  }
  return parts.length > 0 ? parts.join(" · ") : null;
}
