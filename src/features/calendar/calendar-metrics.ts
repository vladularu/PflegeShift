import { Temporal } from "@js-temporal/polyfill";

import type { CalendarEntry, ShiftEntry, ShiftType, UserProfile } from "@/domain/types";
import { calculateDailyWorkCredit } from "@/engine/daily-summary";

type ProfileForTime = Pick<UserProfile, "federalState" | "weeklyMinutes" | "timeZone">;

export interface DailySummary {
  readonly date: string;
  readonly targetMinutes: number;
  readonly actualMinutes: number;
  readonly balanceMinutes: number;
}

export interface DailyHoursPoint extends DailySummary {
  readonly day: number;
}

export interface MonthProgressValue {
  readonly displayPercent: number;
  readonly fillPercent: number;
}

export function calculateMonthProgress(
  actualMinutes: number,
  targetMinutes: number,
): MonthProgressValue {
  const displayPercent = targetMinutes <= 0
    ? 0
    : Math.max(0, Math.round((actualMinutes / targetMinutes) * 100));

  return Object.freeze({
    displayPercent,
    fillPercent: Math.min(100, displayPercent),
  });
}

export function calculateDailySummary(
  date: string,
  entries: readonly CalendarEntry[],
  profile: ProfileForTime,
): DailySummary {
  const result = calculateDailyWorkCredit(
    date,
    entries.filter((entry): entry is ShiftEntry => entry.kind === "SHIFT"),
    profile,
  );

  return Object.freeze({
    date,
    targetMinutes: result.targetMinutes,
    actualMinutes: result.actualMinutes,
    balanceMinutes: result.balanceMinutes,
  });
}

export function buildMonthlyHoursSeries(
  month: string,
  entries: readonly CalendarEntry[],
  profile: ProfileForTime,
): readonly DailyHoursPoint[] {
  const yearMonth = Temporal.PlainYearMonth.from(month);
  return Object.freeze(
    Array.from({ length: yearMonth.daysInMonth }, (_, index) => {
      const date = yearMonth.toPlainDate({ day: index + 1 }).toString();
      return Object.freeze({ day: index + 1, ...calculateDailySummary(date, entries, profile) });
    }),
  );
}

export function buildShiftTypeDistribution(
  month: string,
  entries: readonly CalendarEntry[],
): ReadonlyMap<ShiftType, number> {
  const counts = new Map<ShiftType, number>();
  for (const entry of entries) {
    if (
      entry.kind !== "SHIFT"
      || entry.deletedAt !== null
      || !entry.date.startsWith(`${month}-`)
    ) continue;
    counts.set(entry.type, (counts.get(entry.type) ?? 0) + 1);
  }
  return counts;
}

export function clampDateToMonth(date: string, month: string): string {
  const source = Temporal.PlainDate.from(date);
  const target = Temporal.PlainYearMonth.from(month);
  return target.toPlainDate({ day: Math.min(source.day, target.daysInMonth) }).toString();
}
