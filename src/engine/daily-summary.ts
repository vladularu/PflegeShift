import { Temporal } from "@js-temporal/polyfill";

import type { ShiftEntry, ShiftType, UserProfile } from "@/domain/types";
import { getPublicHolidays } from "@/engine/holidays";
import { calculateTimedShiftBounds } from "@/engine/working-time";
import { bundledRuleResolver, type RuleResolver } from "@/rules/rule-resolver";

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
  readonly minutesByType: Readonly<Partial<Record<ShiftType, number>>>;
}

const HOLIDAY_DATE_CACHE = new WeakMap<RuleResolver, Map<string, ReadonlySet<string>>>();

function holidayDates(
  year: number,
  federalState: UserProfile["federalState"],
  ruleResolver: RuleResolver,
): ReadonlySet<string> {
  const key = `${federalState}-${year}`;
  const resolverCache = HOLIDAY_DATE_CACHE.get(ruleResolver);
  const cached = resolverCache?.get(key);
  if (cached) return cached;
  const dates = new Set(
    getPublicHolidays(year, federalState, ruleResolver).map((holiday) => holiday.date),
  );
  const nextCache = resolverCache ?? new Map<string, ReadonlySet<string>>();
  nextCache.set(key, dates);
  if (!resolverCache) HOLIDAY_DATE_CACHE.set(ruleResolver, nextCache);
  return dates;
}

export function calculateDailyTargetMinutes(
  date: string,
  profile: Pick<UserProfile, "federalState" | "weeklyMinutes">,
  ruleResolver: RuleResolver = bundledRuleResolver,
): number {
  const plainDate = Temporal.PlainDate.from(date);
  if (
    plainDate.dayOfWeek > 5 ||
    holidayDates(plainDate.year, profile.federalState, ruleResolver).has(date)
  ) {
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
  readonly minutesByType: Readonly<Partial<Record<ShiftType, number>>>;
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
  const minutesByType: Partial<Record<ShiftType, number>> = {};

  for (const { entry, bounds } of candidates) {
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
    minutesByType[entry.type] = (minutesByType[entry.type] ?? 0) + creditedMinutes;
    overlapMinutes += bounds.netMinutes - creditedMinutes;
    coverage = [...mergeInterval(coverage, interval)];
  }

  return Object.freeze({
    minutes,
    overlapMinutes,
    coverage: Object.freeze(coverage),
    minutesByType: Object.freeze(minutesByType),
  });
}

export function calculateDailyWorkCredit(
  date: string,
  entries: readonly ShiftEntry[],
  profile: ProfileForTime,
  ruleResolver: RuleResolver = bundledRuleResolver,
): DailyWorkCredit {
  const active = entries.filter((entry) => entry.deletedAt === null && entry.date === date);
  const workEntries = active.filter(
    (entry) => !["TRAINING", "VACATION", "SICK", "FREE"].includes(entry.type),
  );
  const trainingEntries = active.filter((entry) => entry.type === "TRAINING");
  const work = creditTimedEntries(workEntries, profile.timeZone);
  const training = creditTimedEntries(trainingEntries, profile.timeZone, work.coverage);
  const targetMinutes = calculateDailyTargetMinutes(date, profile, ruleResolver);
  const timedMinutes = work.minutes + training.minutes;
  const absenceMinutes = active.some((entry) => entry.type === "VACATION" || entry.type === "SICK")
    ? Math.max(0, targetMinutes - timedMinutes)
    : 0;
  const sickMinutes = active.some((entry) => entry.type === "SICK") ? absenceMinutes : 0;
  const vacationMinutes =
    sickMinutes === 0 && active.some((entry) => entry.type === "VACATION") ? absenceMinutes : 0;
  const actualMinutes = timedMinutes + absenceMinutes;
  const minutesByType: Partial<Record<ShiftType, number>> = {
    ...work.minutesByType,
    ...training.minutesByType,
  };
  if (sickMinutes > 0) minutesByType.SICK = sickMinutes;
  if (vacationMinutes > 0) minutesByType.VACATION = vacationMinutes;

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
    minutesByType: Object.freeze(minutesByType),
  });
}
