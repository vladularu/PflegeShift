import { Temporal } from "@js-temporal/polyfill";

import type { Appointment, CalendarEntry, RecurrenceRule } from "@/domain/types";
import { sortCalendarEntries } from "@/engine/calendar-entry-order";

function occurrenceDate(
  start: Temporal.PlainDate,
  rule: RecurrenceRule,
  index: number,
): Temporal.PlainDate {
  const amount = rule.interval * index;
  switch (rule.frequency) {
    case "DAY":
      return start.add({ days: amount });
    case "WEEK":
      return start.add({ weeks: amount });
    case "MONTH":
      return start.add({ months: amount });
    case "YEAR":
      return start.add({ years: amount });
  }
}

export function expandAppointmentSeries(
  appointment: Appointment,
  startDate: string,
  endDate: string,
): readonly Appointment[] {
  const rangeStart = Temporal.PlainDate.from(startDate);
  const rangeEnd = Temporal.PlainDate.from(endDate);
  const seriesStart = Temporal.PlainDate.from(appointment.date);
  if (Temporal.PlainDate.compare(rangeEnd, seriesStart) < 0) return Object.freeze([]);

  const recurrence = appointment.recurrence ?? null;
  if (recurrence === null) {
    return appointment.date >= startDate && appointment.date <= endDate
      ? Object.freeze([appointment])
      : Object.freeze([]);
  }

  const occurrences: Appointment[] = [];
  // The calendar range is intentionally bounded by its caller. The guard protects
  // corrupted legacy data without imposing an end date on a valid series.
  for (let index = 0; index < 10_000; index += 1) {
    const date = occurrenceDate(seriesStart, recurrence, index);
    if (Temporal.PlainDate.compare(date, rangeEnd) > 0) break;
    if (Temporal.PlainDate.compare(date, rangeStart) < 0) continue;
    occurrences.push(Object.freeze({ ...appointment, date: date.toString() }));
  }
  return Object.freeze(occurrences);
}

export function expandCalendarEntries(
  entries: readonly CalendarEntry[],
  startDate: string,
  endDate: string,
): readonly CalendarEntry[] {
  const expanded: CalendarEntry[] = [];
  for (const entry of entries) {
    if (entry.deletedAt !== null) continue;
    if (entry.kind === "SHIFT") {
      if (entry.date >= startDate && entry.date <= endDate) expanded.push(entry);
      continue;
    }
    expanded.push(...expandAppointmentSeries(entry, startDate, endDate));
  }
  return sortCalendarEntries(expanded);
}
