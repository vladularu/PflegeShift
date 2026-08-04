import { Temporal } from "@js-temporal/polyfill";

import type { ShiftEntry, UserProfile } from "@/domain/types";
import { getPublicHolidays } from "@/engine/holidays";
import { calculateTimedShiftBounds } from "@/engine/working-time";

type ProfileForTime = Pick<UserProfile, "federalState" | "weeklyMinutes" | "timeZone">;

interface MinuteInterval {
  readonly start: number;
  readonly end: number;
}

export interface DailyWorkCredit {
  readonly date: string;
  readonly targetMinutes: number;
  readonly actualMinutes: number;
  readonly balanceMinutes: number;
  readonly workMinutes: number;
  readonly trainingMinutes: number;
  readonly vacationMinutes: number;
  readonly sickMinutes: number;
  readonly overlapMinutes: number;
}

const HOLIDAY_DATE_CACHE = new Map<string, ReadonlySet<string>>();

function holidayDates(
  year: number,
  federalState: UserProfile["federalState"],
): ReadonlySet<string> {
  const key = `${federalState}-${year}`;
  const cached = HOLIDAY_DATE_CACHE.get(key);
  if (cached) return cached;
  const dates = new Set(getPublicHolidays(year, federalState).map((holiday) => holiday.date));
  HOLIDAY_DATE_CACHE.set(key, dates);
  return dates;
}

export function calculateDailyTargetMinutes(
  date: string,
  profile: Pick<UserProfile, "federalState" | "weeklyMinutes">,
): number {
  const plainDate = Temporal.PlainDate.from(date);
  if (plainDate.dayOfWeek > 5 || holidayDates(plainDate.year, profile.federalState).has(date)) {
    return 0;
  }
  return Math.round(profile.weeklyMinutes / 5);
}

function mergeInterval(
  intervals: readonly MinuteInterval[],
  next: MinuteInterval,
): readonly MinuteInterval[] {
  const merged: MinuteInterval[] = [];
  for (const interval of [...intervals, next].sort((left, right) => left.start - right.start)) {
    if (merged.length === 0 || interval.start > merged[merged.length - 1].end) {
      merged.push({ ...interval });
      continue;
    }
    const candidate = merged[merged.length - 1];
    merged[merged.length - 1] = {
      start: candidate.start,
      end: Math.max(candidate.end, interval.end),
    };
  }
  return merged;
}

function overlappingMinutes(interval: MinuteInterval, coverage: readonly MinuteInterval[]): number {
  return coverage.reduce(
    (sum, covered) =>
      sum +
      Math.max(0, Math.min(interval.end, covered.end) - Math.max(interval.start, covered.start)),
    0,
  );
}

function creditTimedEntries(
  entries: readonly ShiftEntry[],
  timeZone: string,
  initialCoverage: readonly MinuteInterval[] = [],
): {
  readonly minutes: number;
  readonly overlapMinutes: number;
  readonly coverage: readonly MinuteInterval[];
} {
  const candidates = entries
    .map((entry) => ({ entry, bounds: calculateTimedShiftBounds(entry, timeZone) }))
    .filter(
      (
        candidate,
      ): candidate is {
        readonly entry: ShiftEntry;
        readonly bounds: NonNullable<ReturnType<typeof calculateTimedShiftBounds>>;
      } => candidate.bounds !== null,
    )
    .sort(
      (left, right) =>
        left.bounds.startEpochMinutes - right.bounds.startEpochMinutes ||
        left.entry.id.localeCompare(right.entry.id),
    );
  let coverage = [...initialCoverage];
  let minutes = 0;
  let overlapMinutes = 0;

  for (const { bounds } of candidates) {
    const interval = {
      start: bounds.startEpochMinutes,
      end: bounds.endEpochMinutes,
    };
    const uncoveredGrossMinutes = Math.max(
      0,
      bounds.grossMinutes - overlappingMinutes(interval, coverage),
    );
    const creditedMinutes = Math.min(bounds.netMinutes, uncoveredGrossMinutes);
    minutes += creditedMinutes;
    overlapMinutes += bounds.netMinutes - creditedMinutes;
    coverage = [...mergeInterval(coverage, interval)];
  }

  return Object.freeze({ minutes, overlapMinutes, coverage: Object.freeze(coverage) });
}

export function calculateDailyWorkCredit(
  date: string,
  entries: readonly ShiftEntry[],
  profile: ProfileForTime,
): DailyWorkCredit {
  const active = entries.filter((entry) => entry.deletedAt === null && entry.date === date);
  const workEntries = active.filter(
    (entry) => !["TRAINING", "VACATION", "SICK", "FREE"].includes(entry.type),
  );
  const trainingEntries = active.filter((entry) => entry.type === "TRAINING");
  const work = creditTimedEntries(workEntries, profile.timeZone);
  const training = creditTimedEntries(trainingEntries, profile.timeZone, work.coverage);
  const targetMinutes = calculateDailyTargetMinutes(date, profile);
  const timedMinutes = work.minutes + training.minutes;
  const absenceMinutes = active.some((entry) => entry.type === "VACATION" || entry.type === "SICK")
    ? Math.max(0, targetMinutes - timedMinutes)
    : 0;
  const sickMinutes = active.some((entry) => entry.type === "SICK") ? absenceMinutes : 0;
  const vacationMinutes =
    sickMinutes === 0 && active.some((entry) => entry.type === "VACATION") ? absenceMinutes : 0;
  const actualMinutes = timedMinutes + absenceMinutes;

  return Object.freeze({
    date,
    targetMinutes,
    actualMinutes,
    balanceMinutes: actualMinutes - targetMinutes,
    workMinutes: work.minutes,
    trainingMinutes: training.minutes,
    vacationMinutes,
    sickMinutes,
    overlapMinutes: work.overlapMinutes + training.overlapMinutes,
  });
}
