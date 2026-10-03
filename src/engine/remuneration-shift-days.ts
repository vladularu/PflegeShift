import { Temporal } from "@js-temporal/polyfill";
import type { ShiftEntry } from "@/domain/types";
import { calculateTimedShiftBounds } from "./working-time";
import { isPayWorkShift } from "./tvoed-pattern";
import { remunerationMonthStart } from "./remuneration-context";

export interface RemunerationShiftDay {
  readonly date: string;
  readonly fromEpochMinutes: number;
  readonly untilEpochMinutes: number;
  readonly from: number;
  readonly until: number;
  readonly netMinutes: number;
  readonly estimatedPause: boolean;
}

/** Real elapsed minutes; the existing duration-only pause is placed once per whole shift. */
export function remunerationShiftDays(
  shift: ShiftEntry,
  timeZone: string,
): readonly RemunerationShiftDay[] {
  if (shift.deletedAt !== null || !isPayWorkShift(shift)) return [];
  const bounds = calculateTimedShiftBounds(shift, timeZone);
  if (!bounds || bounds.grossMinutes <= 0) return [];
  const breakDuration = Math.min(bounds.grossMinutes, shift.breakMinutes);
  const breakFrom =
    bounds.startEpochMinutes + Math.floor((bounds.grossMinutes - breakDuration) / 2);
  const breakUntil = breakFrom + breakDuration;
  const days: RemunerationShiftDay[] = [];
  for (let from = bounds.startEpochMinutes; from < bounds.endEpochMinutes;) {
    const local = Temporal.Instant.fromEpochMilliseconds(from * 60_000).toZonedDateTimeISO(
      timeZone,
    );
    const until = Math.min(
      bounds.endEpochMinutes,
      Number(local.startOfDay().add({ days: 1 }).epochMilliseconds) / 60_000,
    );
    days.push({
      date: local.toPlainDate().toString(),
      fromEpochMinutes: from,
      untilEpochMinutes: until,
      from: from - bounds.startEpochMinutes,
      until: until - bounds.startEpochMinutes,
      netMinutes:
        until - from - Math.max(0, Math.min(until, breakUntil) - Math.max(from, breakFrom)),
      estimatedPause: breakDuration > 0,
    });
    from = until;
  }
  return days;
}

/** Include preceding-day shifts, because their final minutes may belong to this month. */
export function remunerationMonthShifts(
  month: string,
  shifts: readonly ShiftEntry[],
): readonly ShiftEntry[] {
  const first = remunerationMonthStart(month);
  const precedingDate = first.subtract({ days: 1 }).toString();
  const nextMonth = first.add({ months: 1 }).toString();
  const seen = new Set<string>();
  return shifts.filter((shift) => {
    if (
      shift.deletedAt !== null ||
      shift.date < precedingDate ||
      shift.date >= nextMonth ||
      !isPayWorkShift(shift)
    )
      return false;
    if (seen.has(shift.id))
      throw new Error("Ein Dienst wurde mehrfach zur Vergütungsberechnung übergeben.");
    seen.add(shift.id);
    return true;
  });
}
