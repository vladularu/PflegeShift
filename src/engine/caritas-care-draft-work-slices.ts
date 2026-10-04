import { Temporal } from "@js-temporal/polyfill";
import {
  isCurrentShiftTraining,
  requireShiftTrainingParent,
  validateSavedShiftTraining,
  type SavedShiftTraining,
} from "@/domain/training-data";
import type { ShiftEntry } from "@/domain/types";
import type { CaritasDraftWorkedSlice } from "./caritas-care-draft-time-premiums";
import { isPayWorkShift } from "./tvoed-pattern";
import { calculateTimedShiftBounds } from "./working-time";

export type CaritasDraftNetSlice = Pick<
  CaritasDraftWorkedSlice,
  "date" | "fromMinute" | "throughMinute"
>;

export interface CaritasDraftShiftNetSlice extends CaritasDraftNetSlice {
  readonly shiftId: string;
}

export type CaritasDraftWorkSlices =
  | {
      readonly kind: "confirmed-net-slices";
      readonly shiftId: string;
      readonly detailRevision: number;
      readonly workedMinutes: number;
      readonly slices: readonly CaritasDraftNetSlice[];
    }
  | {
      readonly kind: "unavailable";
      readonly reason:
        | "NOT_TIMED_WORK"
        | "PAUSES_MISSING_OR_STALE"
        | "PAUSE_DATA_INVALID"
        | "TIME_BOUNDS_INVALID"
        | "DST_TRANSITION_UNSUPPORTED"
        | "NO_NET_WORK";
    };

export type CaritasDraftMonthWorkSlices =
  | {
      readonly kind: "confirmed-month-net-slices";
      readonly month: string;
      readonly workedMinutes: number;
      readonly slices: readonly CaritasDraftShiftNetSlice[];
    }
  | {
      readonly kind: "unavailable";
      readonly reason:
        | Extract<CaritasDraftWorkSlices, { kind: "unavailable" }>["reason"]
        | "INVALID_MONTH"
        | "ENTRIES_INCOMPLETE"
        | "WORK_TIME_MISSING"
        | "DETAILS_AMBIGUOUS"
        | "WORKED_SLICES_OVERLAP";
      readonly shiftId?: string;
    };

function zonedMinute(epochMinute: number, timeZone: string) {
  return Temporal.Instant.fromEpochMilliseconds(epochMinute * 60_000).toZonedDateTimeISO(timeZone);
}

/**
 * Candidate-only bridge from existing, revision-bound pause records to actual net work.
 * Clock-time slices cannot represent a repeated/missing DST hour, so those shifts fail closed.
 */
export function deriveCaritasDraftWorkSlices(
  shift: ShiftEntry,
  rawDetails: SavedShiftTraining | null,
  timeZone: string,
): CaritasDraftWorkSlices {
  if (
    shift.deletedAt !== null ||
    !isPayWorkShift(shift) ||
    shift.allDay ||
    !shift.startTime ||
    !shift.endTime
  )
    return { kind: "unavailable", reason: "NOT_TIMED_WORK" };
  if (rawDetails === null) return { kind: "unavailable", reason: "PAUSES_MISSING_OR_STALE" };
  let details: SavedShiftTraining;
  try {
    details = validateSavedShiftTraining(rawDetails);
    if (!isCurrentShiftTraining(details, shift, timeZone))
      return { kind: "unavailable", reason: "PAUSES_MISSING_OR_STALE" };
    requireShiftTrainingParent(details, shift);
  } catch {
    return { kind: "unavailable", reason: "PAUSE_DATA_INVALID" };
  }
  if (details.data.pauses === null)
    return { kind: "unavailable", reason: "PAUSES_MISSING_OR_STALE" };

  try {
    const bounds = calculateTimedShiftBounds(shift, timeZone);
    if (!bounds || bounds.grossMinutes <= 0)
      return { kind: "unavailable", reason: "TIME_BOUNDS_INVALID" };
    const first = zonedMinute(bounds.startEpochMinutes, timeZone);
    const last = zonedMinute(bounds.endEpochMinutes - 1, timeZone);
    if (first.offsetNanoseconds !== last.offsetNanoseconds)
      return { kind: "unavailable", reason: "DST_TRANSITION_UNSUPPORTED" };

    const work: { from: number; through: number }[] = [];
    let from = bounds.startEpochMinutes;
    for (const pause of details.data.pauses) {
      const pauseFrom = Date.parse(pause.start) / 60_000;
      const pauseThrough = Date.parse(pause.end) / 60_000;
      if (pauseFrom > from) work.push({ from, through: pauseFrom });
      from = pauseThrough;
    }
    if (from < bounds.endEpochMinutes) work.push({ from, through: bounds.endEpochMinutes });

    const slices: CaritasDraftNetSlice[] = [];
    for (const interval of work) {
      let cursor = interval.from;
      while (cursor < interval.through) {
        const start = zonedMinute(cursor, timeZone);
        const nextMidnight = Number(start.startOfDay().add({ days: 1 }).epochMilliseconds) / 60_000;
        const through = Math.min(interval.through, nextMidnight);
        const end =
          through === nextMidnight
            ? 1440
            : (() => {
                const local = zonedMinute(through, timeZone);
                return local.hour * 60 + local.minute;
              })();
        const beginning = start.hour * 60 + start.minute;
        if (end <= beginning || end - beginning !== through - cursor)
          return { kind: "unavailable", reason: "DST_TRANSITION_UNSUPPORTED" };
        slices.push({
          date: start.toPlainDate().toString(),
          fromMinute: beginning,
          throughMinute: end,
        });
        cursor = through;
      }
    }
    const workedMinutes = slices.reduce(
      (sum, slice) => sum + slice.throughMinute - slice.fromMinute,
      0,
    );
    if (workedMinutes === 0) return { kind: "unavailable", reason: "NO_NET_WORK" };
    if (workedMinutes !== bounds.netMinutes)
      return { kind: "unavailable", reason: "PAUSE_DATA_INVALID" };
    return {
      kind: "confirmed-net-slices",
      shiftId: shift.id,
      detailRevision: details.revision,
      workedMinutes,
      slices,
    };
  } catch {
    return { kind: "unavailable", reason: "TIME_BOUNDS_INVALID" };
  }
}

/** Collects a complete month, including a previous-month night shift after midnight. */
export function deriveCaritasDraftMonthWorkSlices(input: {
  readonly month: string;
  readonly shifts: readonly ShiftEntry[];
  readonly details: readonly SavedShiftTraining[];
  readonly timeZone: string;
  readonly entriesComplete: boolean;
}): CaritasDraftMonthWorkSlices {
  let first: Temporal.PlainDate;
  try {
    if (!/^\d{4}-\d{2}$/u.test(input.month)) throw new RangeError("Invalid month");
    const yearMonth = Temporal.PlainYearMonth.from(input.month);
    if (yearMonth.toString() !== input.month) throw new RangeError("Invalid month");
    first = yearMonth.toPlainDate({ day: 1 });
  } catch {
    return { kind: "unavailable", reason: "INVALID_MONTH" };
  }
  if (!input.entriesComplete) return { kind: "unavailable", reason: "ENTRIES_INCOMPLETE" };
  const from = first.toString();
  const through = first.add({ months: 1 }).subtract({ days: 1 }).toString();
  const previous = first.subtract({ days: 1 }).toString();
  const workTypes = new Set(["EARLY", "LATE", "NIGHT", "DAY", "CUSTOM"]);
  const slices: CaritasDraftShiftNetSlice[] = [];
  for (const shift of input.shifts) {
    if (shift.deletedAt !== null) continue;
    const inMonth = shift.date >= from && shift.date <= through;
    const carried =
      shift.date === previous &&
      shift.startTime !== null &&
      shift.endTime !== null &&
      shift.endTime <= shift.startTime &&
      shift.endTime !== "00:00";
    if (!inMonth && !carried) continue;
    if (!workTypes.has(shift.type)) continue;
    if (!isPayWorkShift(shift))
      return { kind: "unavailable", reason: "WORK_TIME_MISSING", shiftId: shift.id };
    const matches = input.details.filter((item) => item.shiftId === shift.id);
    if (matches.length > 1)
      return { kind: "unavailable", reason: "DETAILS_AMBIGUOUS", shiftId: shift.id };
    const result = deriveCaritasDraftWorkSlices(shift, matches[0] ?? null, input.timeZone);
    if (result.kind === "unavailable") return { ...result, shiftId: shift.id };
    for (const slice of result.slices)
      if (slice.date >= from && slice.date <= through) slices.push({ ...slice, shiftId: shift.id });
  }
  slices.sort((a, b) => a.date.localeCompare(b.date) || a.fromMinute - b.fromMinute);
  for (let index = 1; index < slices.length; index++) {
    const previousSlice = slices[index - 1],
      current = slices[index];
    if (previousSlice.date === current.date && previousSlice.throughMinute > current.fromMinute)
      return { kind: "unavailable", reason: "WORKED_SLICES_OVERLAP" };
  }
  return {
    kind: "confirmed-month-net-slices",
    month: input.month,
    workedMinutes: slices.reduce((sum, item) => sum + item.throughMinute - item.fromMinute, 0),
    slices,
  };
}
