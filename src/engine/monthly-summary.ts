import { Temporal } from "@js-temporal/polyfill";

import type {
  MonthlySummary,
  MonthlySummaryCategory,
  ShiftEntry,
  UserProfile,
} from "@/domain/types";
import { getPublicHolidays } from "@/engine/holidays";
import { calculateTimedShiftMinutes } from "@/engine/working-time";

function category(): { minutes: number; entryCount: number } {
  return { minutes: 0, entryCount: 0 };
}

function freezeCategory(value: MonthlySummaryCategory): MonthlySummaryCategory {
  return Object.freeze({ ...value });
}

export function calculateMonthlyTargetMinutes(
  month: string,
  profile: Pick<UserProfile, "federalState" | "weeklyMinutes">,
): number {
  const yearMonth = Temporal.PlainYearMonth.from(month);
  const holidayDates = new Set(
    getPublicHolidays(yearMonth.year, profile.federalState).map((holiday) => holiday.date),
  );
  let workingDays = 0;

  for (let day = 1; day <= yearMonth.daysInMonth; day += 1) {
    const date = yearMonth.toPlainDate({ day });
    if (date.dayOfWeek <= 5 && !holidayDates.has(date.toString())) {
      workingDays += 1;
    }
  }

  return Math.round((profile.weeklyMinutes / 5) * workingDays);
}

export function calculateMonthlySummary(
  month: string,
  entries: readonly ShiftEntry[],
  profile: Pick<UserProfile, "federalState" | "weeklyMinutes" | "timeZone">,
): MonthlySummary {
  const work = category();
  const training = category();
  const vacation = category();
  const sick = category();
  const free = category();
  const absenceCredit = Math.round(profile.weeklyMinutes / 5);

  for (const entry of entries) {
    if (!entry.date.startsWith(`${month}-`) || entry.deletedAt !== null) {
      continue;
    }

    if (entry.type === "FREE") {
      free.entryCount += 1;
      continue;
    }

    if (entry.type === "VACATION" || entry.type === "SICK") {
      const target = entry.type === "VACATION" ? vacation : sick;
      target.entryCount += 1;
      target.minutes += absenceCredit;
      continue;
    }

    const minutes = calculateTimedShiftMinutes(entry, profile.timeZone);
    const target = entry.type === "TRAINING" ? training : work;
    target.entryCount += 1;
    target.minutes += minutes;
  }

  const actualMinutes = work.minutes + training.minutes + vacation.minutes + sick.minutes;
  const targetMinutes = calculateMonthlyTargetMinutes(month, profile);

  return Object.freeze({
    month,
    targetMinutes,
    actualMinutes,
    balanceMinutes: actualMinutes - targetMinutes,
    work: freezeCategory(work),
    training: freezeCategory(training),
    vacation: freezeCategory(vacation),
    sick: freezeCategory(sick),
    free: freezeCategory(free),
  });
}
