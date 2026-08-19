import type { CalendarEntry, ShiftEntry } from "@/domain/types";
import { calculateTimedShiftMinutes, formatMinutes } from "@/engine/working-time";

export interface CalendarEntryPreview {
  readonly entries: readonly CalendarEntry[];
  readonly overflowCount: number;
}

interface CalendarEntryPreviewOptions {
  readonly detailedShifts: boolean;
  readonly rowCapacity: number;
}

function calendarEntryRows(entry: CalendarEntry, detailedShifts: boolean): number {
  return detailedShifts &&
    entry.kind === "SHIFT" &&
    !entry.allDay &&
    entry.startTime !== null &&
    entry.endTime !== null
    ? 2
    : 1;
}

export type CalendarDayPressAction = "OPEN_QUICK_ENTRY" | "STAMP" | "AWAIT_TOOL";

export function yearMonths(year: number): readonly string[] {
  return Object.freeze(
    Array.from({ length: 12 }, (_, index) => `${year}-${String(index + 1).padStart(2, "0")}`),
  );
}

export function calendarEntryPreview(
  entries: readonly CalendarEntry[],
  options: CalendarEntryPreviewOptions,
): CalendarEntryPreview {
  const rowCapacity = Math.max(0, Math.floor(options.rowCapacity));
  const visibleEntries: CalendarEntry[] = [];
  let usedRows = 0;

  for (const entry of entries) {
    const entryRows = calendarEntryRows(entry, options.detailedShifts);
    if (usedRows + entryRows > rowCapacity) break;
    visibleEntries.push(entry);
    usedRows += entryRows;
  }

  let overflowCount = entries.length - visibleEntries.length;
  while (overflowCount > 0 && visibleEntries.length > 1 && usedRows + 1 > rowCapacity) {
    const removed = visibleEntries.pop();
    if (removed) usedRows -= calendarEntryRows(removed, options.detailedShifts);
    overflowCount += 1;
  }

  return Object.freeze({
    entries: Object.freeze(visibleEntries),
    overflowCount,
  });
}

export function calendarDayPressAction(
  plannerMode: boolean,
  hasStampTool: boolean,
): CalendarDayPressAction {
  if (!plannerMode) return "OPEN_QUICK_ENTRY";
  return hasStampTool ? "STAMP" : "AWAIT_TOOL";
}

export function calendarShiftDetail(
  entry: ShiftEntry,
  options: {
    readonly showShiftTimes: boolean;
    readonly showShiftDuration: boolean;
    readonly timeZone: string;
  },
): string | null {
  if (entry.allDay || entry.startTime === null || entry.endTime === null) return null;
  const parts: string[] = [];
  if (options.showShiftTimes) parts.push(entry.startTime);
  if (options.showShiftDuration) {
    parts.push(`${formatMinutes(calculateTimedShiftMinutes(entry, options.timeZone))} h`);
  }
  return parts.length > 0 ? parts.join(" · ") : null;
}
