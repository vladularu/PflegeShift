import { Temporal } from "@js-temporal/polyfill";

import type { ShiftEntry } from "@/domain/types";
import type { RuleRestDeviation } from "@/rules/contracts.generated";

export interface ComplianceInterval {
  readonly shift: ShiftEntry;
  readonly start: Temporal.ZonedDateTime;
  readonly end: Temporal.ZonedDateTime;
  readonly grossMinutes: number;
  readonly netMinutes: number;
}

interface WorkdayBoundary {
  readonly date: string;
  readonly earliest: ComplianceInterval;
  readonly latest: ComplianceInterval;
}

export interface RestPeriod {
  readonly current: ComplianceInterval;
  readonly next: ComplianceInterval;
  readonly minutes: number;
}

function minutesBetween(left: Temporal.ZonedDateTime, right: Temporal.ZonedDateTime): number {
  return Math.round(Number(right.epochMilliseconds - left.epochMilliseconds) / 60_000);
}

function compensationDeadline(
  start: Temporal.ZonedDateTime,
  deviation: RuleRestDeviation,
): Temporal.ZonedDateTime {
  const dayDeadline = start.add({ days: deviation.compensationWithinDays });
  const monthDeadline = start.add({
    months: deviation.compensationWithinCalendarMonths ?? 0,
  });
  return Temporal.ZonedDateTime.compare(dayDeadline, monthDeadline) >= 0
    ? dayDeadline
    : monthDeadline;
}

function workdayBoundaries(intervals: readonly ComplianceInterval[]): WorkdayBoundary[] {
  const byDate = new Map<string, ComplianceInterval[]>();
  for (const item of intervals) {
    const entries = byDate.get(item.shift.date) ?? [];
    entries.push(item);
    byDate.set(item.shift.date, entries);
  }
  return [...byDate.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([date, entries]) => ({
      date,
      earliest: entries.reduce((left, right) =>
        Temporal.ZonedDateTime.compare(left.start, right.start) <= 0 ? left : right,
      ),
      latest: entries.reduce((left, right) =>
        Temporal.ZonedDateTime.compare(left.end, right.end) >= 0 ? left : right,
      ),
    }));
}

export function restPeriods(intervals: readonly ComplianceInterval[]): readonly RestPeriod[] {
  const boundaries = workdayBoundaries(intervals);
  return boundaries.slice(0, -1).map((boundary, index) => {
    const current = boundary.latest;
    const next = boundaries[index + 1].earliest;
    return {
      current,
      next,
      minutes: minutesBetween(current.end, next.start),
    };
  });
}

export function compensatedShortRestIndexes(
  periods: readonly RestPeriod[],
  deviation: RuleRestDeviation | null,
  defaultMinutes: number,
): ReadonlySet<number> {
  const compensated = new Set<number>();
  if (deviation === null) return compensated;
  const usedCompensationPeriods = new Set<number>();

  for (let shortIndex = 0; shortIndex < periods.length; shortIndex += 1) {
    const shortened = periods[shortIndex];
    if (shortened.minutes < deviation.minimumMinutes || shortened.minutes >= defaultMinutes) {
      continue;
    }

    const deadline = compensationDeadline(shortened.next.start, deviation);
    for (
      let candidateIndex = shortIndex + 1;
      candidateIndex < periods.length;
      candidateIndex += 1
    ) {
      const candidate = periods[candidateIndex];
      if (
        usedCompensationPeriods.has(candidateIndex) ||
        candidate.minutes < deviation.compensationMinutes
      ) {
        continue;
      }

      const compensationCompleted = candidate.current.end.add({
        minutes: deviation.compensationMinutes,
      });
      if (Temporal.ZonedDateTime.compare(compensationCompleted, deadline) > 0) break;

      compensated.add(shortIndex);
      usedCompensationPeriods.add(candidateIndex);
      break;
    }
  }

  return compensated;
}

export function consecutiveDateStreaks(shifts: readonly ShiftEntry[]): ShiftEntry[][] {
  const unique = new Map<string, ShiftEntry>();
  for (const shift of shifts) unique.set(shift.date, shift);
  const sorted = [...unique.values()].sort((left, right) => left.date.localeCompare(right.date));
  const streaks: ShiftEntry[][] = [];
  let streak: ShiftEntry[] = [];
  for (const shift of sorted) {
    const previous = streak.at(-1);
    if (
      previous &&
      Temporal.PlainDate.from(shift.date).since(Temporal.PlainDate.from(previous.date)).days !== 1
    ) {
      streaks.push(streak);
      streak = [];
    }
    streak.push(shift);
  }
  if (streak.length) streaks.push(streak);
  return streaks;
}
