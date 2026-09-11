import { Temporal } from "@js-temporal/polyfill";

import type { CalendarEntry, ShiftEntry } from "@/domain/types";
import { tvoedKNightDeadline } from "@/engine/tvoed-k-night-reference";
import { isPayWorkShift } from "@/engine/tvoed-pattern";

/** Calendar-based monthly estimate evidence, never a confirmed entitlement. */
export interface NightSequenceExplanation {
  readonly title: string;
  readonly dates: readonly string[];
  readonly deadline: string | null;
  readonly hasAbsence: boolean;
  readonly uncertain: boolean;
  readonly qualifiedNightCount: number;
}

function calculateNightBounds(shift: ShiftEntry, timeZone: string) {
  const date = Temporal.PlainDate.from(shift.date);
  const startTime = Temporal.PlainTime.from(shift.startTime!);
  const endTime = Temporal.PlainTime.from(shift.endTime!);
  const endDate =
    Temporal.PlainTime.compare(endTime, startTime) <= 0 ? date.add({ days: 1 }) : date;
  const start = date
    .toPlainDateTime(startTime)
    .toZonedDateTime(timeZone, { disambiguation: "reject" })
    .toInstant();
  const end = endDate
    .toPlainDateTime(endTime)
    .toZonedDateTime(timeZone, { disambiguation: "reject" })
    .toInstant();
  const duration = end.since(start).total("minutes");
  if (
    !Number.isFinite(shift.breakMinutes) ||
    shift.breakMinutes < 0 ||
    shift.breakMinutes > duration
  ) {
    throw new Error("Invalid break duration");
  }
  let grossNight = 0;
  const startMinute = startTime.hour * 60 + startTime.minute + startTime.second / 60;
  const endMinute =
    endTime.hour * 60 + endTime.minute + endTime.second / 60 + (endDate.equals(date) ? 0 : 1440);
  let offset = -1;
  for (
    let day = date.subtract({ days: 1 });
    Temporal.PlainDate.compare(day, endDate) <= 0;
    day = day.add({ days: 1 }), offset += 1
  ) {
    // Skip civil windows that cannot overlap; actual elapsed minutes below remain DST-aware.
    if (endMinute <= offset * 1440 + 1260 || startMinute >= offset * 1440 + 1800) continue;
    const from = day.toPlainDateTime("21:00").toZonedDateTime(timeZone).toInstant();
    const until = day
      .add({ days: 1 })
      .toPlainDateTime("06:00")
      .toZonedDateTime(timeZone)
      .toInstant();
    const overlapStart = Temporal.Instant.compare(start, from) > 0 ? start : from;
    const overlapEnd = Temporal.Instant.compare(end, until) < 0 ? end : until;
    if (Temporal.Instant.compare(overlapStart, overlapEnd) < 0)
      grossNight += overlapEnd.since(overlapStart).total("minutes");
  }
  // A range, not a guessed pause placement or invented actual night minutes.
  const minimum = Math.max(0, grossNight - shift.breakMinutes);
  const maximum = Math.min(grossNight, duration - shift.breakMinutes);
  return {
    date: shift.date,
    start,
    end,
    qualified: minimum >= 120,
    uncertain: minimum < 120 && maximum >= 120,
  };
}

// One entry/time-zone result per live object; changed time fields always invalidate it.
const boundsCache = new WeakMap<
  ShiftEntry,
  { key: string; value: ReturnType<typeof calculateNightBounds> }
>();
function nightBounds(shift: ShiftEntry, timeZone: string) {
  const key = JSON.stringify([
    shift.date,
    shift.startTime,
    shift.endTime,
    shift.breakMinutes,
    timeZone,
  ]);
  const cached = boundsCache.get(shift);
  if (cached?.key === key) return cached.value;
  const value = calculateNightBounds(shift, timeZone);
  boundsCache.set(shift, { key, value });
  return value;
}

/** Same monthly selection for pay and explanation; no future-month follow-up reuse. */
export function explainNightSequence(
  entries: readonly CalendarEntry[],
  month: string,
  timeZone: string,
): NightSequenceExplanation {
  const first = Temporal.PlainDate.from(`${month}-01`);
  const from = first.subtract({ months: 1 }).toString();
  const until = first.add({ months: 1 }).toString();
  const relevant = entries.filter(
    (entry): entry is ShiftEntry =>
      entry.kind === "SHIFT" &&
      entry.deletedAt === null &&
      entry.date >= from &&
      entry.date < until,
  );
  let invalid = false;
  const seen = new Set<string>();
  const nights = relevant
    .filter(isPayWorkShift)
    .flatMap((entry) => {
      try {
        if (seen.has(entry.id)) throw new Error("Duplicate shift");
        seen.add(entry.id);
        return [nightBounds(entry, timeZone)];
      } catch {
        invalid = true;
        return [];
      }
    })
    .sort((a, b) => Temporal.Instant.compare(a.start, b.start));
  if (
    nights.some(
      (night, index) =>
        index > 0 && Temporal.Instant.compare(night.start, nights[index - 1].end) < 0,
    )
  )
    invalid = true;
  const qualified = nights.filter((night) => night.qualified);
  let dates: readonly string[] = [];
  let deadline: string | null = null;
  if (!invalid && qualified.filter((night) => night.date.startsWith(`${month}-`)).length >= 2) {
    for (const anchor of qualified) {
      const limit = tvoedKNightDeadline(anchor.end.toString(), timeZone);
      const following = qualified.filter(
        (night) =>
          Temporal.Instant.compare(night.start, anchor.end) >= 0 &&
          Temporal.Instant.compare(night.start, limit.deadlineExclusive) < 0,
      );
      // Each follow-up is reserved for its start month, not reused in another.
      const pair = following.filter((night) => night.date.startsWith(`${month}-`)).slice(0, 2);
      if (pair.length !== 2) continue;
      dates = [
        anchor.date,
        ...pair
          .sort((a, b) => Temporal.Instant.compare(a.start, b.start))
          .map((night) => night.date),
      ];
      deadline = limit.deadlineDate;
      break;
    }
  }
  const uncertain = invalid || nights.some((night) => night.uncertain);
  return Object.freeze({
    title:
      dates.length > 0
        ? "Passende Nachtdienstfolge gefunden"
        : uncertain
          ? "Nachtdienstfolge noch nicht eindeutig"
          : "Noch keine passende Nachtdienstfolge erkennbar",
    dates: Object.freeze(dates),
    deadline,
    uncertain,
    qualifiedNightCount: qualified.length,
    hasAbsence: relevant.some(
      (entry) =>
        entry.date.startsWith(`${month}-`) && (entry.type === "VACATION" || entry.type === "SICK"),
    ),
  });
}
