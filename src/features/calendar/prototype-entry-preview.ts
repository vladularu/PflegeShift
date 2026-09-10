import type { CalendarEntry } from "@/domain/types";
import { calendarEntryPreview } from "./calendar-display";

/** Reserve an overflow line only when needed, never hide a fitting shift. */
export function prototypeEntryPreview(
  entries: readonly CalendarEntry[],
  rows: number,
  detailed: boolean,
) {
  const capacity = Math.max(0, Math.floor(rows));
  const full = calendarEntryPreview(entries, { rowCapacity: capacity, detailedShifts: detailed });
  return full.overflowCount === 0
    ? full
    : calendarEntryPreview(entries, {
        rowCapacity: Math.max(0, capacity - 1),
        detailedShifts: detailed,
      });
}
