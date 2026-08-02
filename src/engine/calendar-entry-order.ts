import type { CalendarEntry } from "@/domain/types";

function entryPriority(entry: CalendarEntry): number {
  if (entry.kind === "APPOINTMENT") return 2;
  if (["TRAINING", "VACATION", "SICK", "FREE"].includes(entry.type)) return 1;
  return 0;
}

export function compareCalendarEntries(
  left: CalendarEntry,
  right: CalendarEntry,
): number {
  return left.date.localeCompare(right.date) ||
    entryPriority(left) - entryPriority(right) ||
    (left.startTime ?? "").localeCompare(right.startTime ?? "") ||
    left.createdAt.localeCompare(right.createdAt) ||
    left.title.localeCompare(right.title) ||
    left.id.localeCompare(right.id);
}

export function sortCalendarEntries(
  entries: readonly CalendarEntry[],
): readonly CalendarEntry[] {
  return Object.freeze([...entries].sort(compareCalendarEntries));
}
