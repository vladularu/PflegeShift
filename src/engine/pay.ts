import { Temporal } from "@js-temporal/polyfill";

import type {
  AllowanceStatus,
  MonthlyPayEstimate,
  MonthlyTariffDecision,
  PremiumLine,
  ShiftEntry,
  ShiftPremiumBreakdown,
  TvoedAssessment,
  UserProfile,
} from "@/domain/types";
import { getPublicHolidays } from "@/engine/holidays";
import {
  getIndividualHourlyRate,
  getMonthlyTableAmount,
  getPremiumHourlyRate,
  getTariffVersion,
} from "@/engine/tariff";
import { calculateTimedShiftMinutes } from "@/engine/working-time";

const WORK_TYPES = new Set(["EARLY", "LATE", "NIGHT", "DAY", "CUSTOM"]);
const HOLIDAY_DATE_CACHE = new Map<string, ReadonlySet<string>>();

interface PremiumMinuteBuckets {
  night: number;
  sunday: number;
  holiday: number;
  saturday: number;
  preholiday: number;
}

interface PremiumDayContext {
  readonly holiday: boolean;
  readonly preholiday: boolean;
  readonly sunday: boolean;
  readonly saturday: boolean;
}

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function isWorkShift(shift: ShiftEntry): boolean {
  return WORK_TYPES.has(shift.type) && shift.startTime !== null && shift.endTime !== null;
}

function zonedStart(shift: ShiftEntry, timeZone: string): Temporal.ZonedDateTime {
  const date = Temporal.PlainDate.from(shift.date);
  const time = Temporal.PlainTime.from(shift.startTime!);
  return Temporal.ZonedDateTime.from(
    {
      timeZone,
      year: date.year,
      month: date.month,
      day: date.day,
      hour: time.hour,
      minute: time.minute,
    },
    { disambiguation: "earlier" },
  );
}

function grossMinutes(shift: ShiftEntry, timeZone: string): number {
  return calculateTimedShiftMinutes({ ...shift, breakMinutes: 0 }, timeZone);
}

function holidayDates(
  year: number,
  federalState: UserProfile["federalState"],
): ReadonlySet<string> {
  const key = `${federalState}-${year}`;
  const cached = HOLIDAY_DATE_CACHE.get(key);
  if (cached) return cached;
  const dates = new Set(
    getPublicHolidays(year, federalState).map((holiday) => holiday.date),
  );
  HOLIDAY_DATE_CACHE.set(key, dates);
  return dates;
}

function premiumDayContext(
  date: Temporal.PlainDate,
  federalState: UserProfile["federalState"],
): PremiumDayContext {
  return {
    holiday: holidayDates(date.year, federalState).has(date.toString()),
    preholiday: date.month === 12 && (date.day === 24 || date.day === 31),
    sunday: date.dayOfWeek === 7,
    saturday: date.dayOfWeek === 6,
  };
}

function countPremiumMinute(
  buckets: PremiumMinuteBuckets,
  day: PremiumDayContext,
  minuteOfDay: number,
): void {
  if (minuteOfDay >= 21 * 60 || minuteOfDay < 6 * 60) buckets.night++;

  if (day.holiday) {
    buckets.holiday++;
  } else if (
    day.preholiday &&
    minuteOfDay >= 6 * 60
  ) {
    buckets.preholiday++;
  } else if (day.sunday) {
    buckets.sunday++;
  } else if (
    day.saturday &&
    minuteOfDay >= 13 * 60 &&
    minuteOfDay < 21 * 60
  ) {
    buckets.saturday++;
  }
}

function countPremiumMinutes(
  shift: ShiftEntry,
  profile: UserProfile,
  gross: number,
  breakStart: number,
  breakEnd: number,
): PremiumMinuteBuckets {
  const buckets: PremiumMinuteBuckets = {
    night: 0,
    sunday: 0,
    holiday: 0,
    saturday: 0,
    preholiday: 0,
  };
  if (gross <= 0) return buckets;

  const start = zonedStart(shift, profile.timeZone);
  const lastMinute = start.add({ minutes: gross - 1 });
  const crossesOffsetTransition =
    start.offsetNanoseconds !== lastMinute.offsetNanoseconds;

  if (crossesOffsetTransition) {
    const dayContexts = new Map<string, PremiumDayContext>();
    for (let index = 0; index < gross; index++) {
      if (index >= breakStart && index < breakEnd) continue;
      const cursor = start.add({ minutes: index });
      const date = cursor.toPlainDate();
      const dateKey = date.toString();
      let day = dayContexts.get(dateKey);
      if (!day) {
        day = premiumDayContext(date, profile.federalState);
        dayContexts.set(dateKey, day);
      }
      countPremiumMinute(
        buckets,
        day,
        cursor.hour * 60 + cursor.minute,
      );
    }
    return buckets;
  }

  const startDate = start.toPlainDate();
  const startMinuteOfDay = start.hour * 60 + start.minute;
  let cachedDayOffset = 0;
  let cachedDate = startDate;
  let cachedDay = premiumDayContext(startDate, profile.federalState);

  for (let index = 0; index < gross; index++) {
    if (index >= breakStart && index < breakEnd) continue;
    const localMinute = startMinuteOfDay + index;
    const dayOffset = Math.floor(localMinute / (24 * 60));
    if (dayOffset !== cachedDayOffset) {
      cachedDayOffset = dayOffset;
      cachedDate = dayOffset === 0
        ? startDate
        : startDate.add({ days: dayOffset });
      cachedDay = premiumDayContext(cachedDate, profile.federalState);
    }
    countPremiumMinute(
      buckets,
      cachedDay,
      localMinute % (24 * 60),
    );
  }
  return buckets;
}

function premiumLine(
  key: string,
  label: string,
  minutes: number,
  percentage: number,
  hourlyRate: number,
): PremiumLine | null {
  if (minutes <= 0) return null;
  return {
    key,
    label,
    minutes,
    percentage,
    hourlyRate,
    amount: roundMoney((minutes / 60) * hourlyRate * (percentage / 100)),
  };
}

export function calculateShiftPremiumBreakdown(
  shift: ShiftEntry,
  profile: UserProfile,
): ShiftPremiumBreakdown {
  const tariff = profile.tariff;
  if (!isWorkShift(shift) || tariff === null) {
    return {
      shiftId: shift.id,
      date: shift.date,
      netMinutes: isWorkShift(shift)
        ? calculateTimedShiftMinutes(shift, profile.timeZone)
        : 0,
      premiumLines: [],
      overtimeBaseAmount: 0,
      overtimePremiumAmount: 0,
      totalAmount: 0,
    };
  }

  const premiumRate = getPremiumHourlyRate(tariff, shift.date) ?? 0;
  const individualRate = getIndividualHourlyRate(tariff, shift.date) ?? 0;
  const gross = grossMinutes(shift, profile.timeZone);
  const breakStart = Math.floor((gross - Math.min(gross, shift.breakMinutes)) / 2);
  const breakEnd = breakStart + Math.min(gross, shift.breakMinutes);
  const buckets = countPremiumMinutes(
    shift,
    profile,
    gross,
    breakStart,
    breakEnd,
  );

  const holidayPercentage =
    shift.holidayPremiumMode === "WITHOUT_TIME_OFF" ? 135 : 35;
  const lines = [
    premiumLine("night", "Nacht", buckets.night, 20, premiumRate),
    premiumLine("sunday", "Sonntag", buckets.sunday, 25, premiumRate),
    premiumLine(
      "holiday",
      shift.holidayPremiumMode === "WITHOUT_TIME_OFF"
        ? "Feiertag ohne Freizeitausgleich"
        : "Feiertag mit Freizeitausgleich",
      buckets.holiday,
      holidayPercentage,
      premiumRate,
    ),
    premiumLine("saturday", "Samstag 13–21 Uhr", buckets.saturday, 20, premiumRate),
    premiumLine("preholiday", "24./31. Dezember", buckets.preholiday, 35, premiumRate),
  ].filter((line): line is PremiumLine => line !== null);

  const netMinutes = calculateTimedShiftMinutes(shift, profile.timeZone);
  const overtimeMinutes = Math.min(shift.overtimeMinutes, netMinutes);
  const overtimePercentage = ["P7", "P8"].includes(tariff.payGroup) ? 30 : 15;
  const overtimeBaseAmount = roundMoney((overtimeMinutes / 60) * individualRate);
  const overtimePremiumAmount = roundMoney(
    (overtimeMinutes / 60) * premiumRate * (overtimePercentage / 100),
  );
  const totalAmount = roundMoney(
    lines.reduce((sum, line) => sum + line.amount, 0) +
      overtimeBaseAmount +
      overtimePremiumAmount,
  );
  return {
    shiftId: shift.id,
    date: shift.date,
    netMinutes,
    premiumLines: lines,
    overtimeBaseAmount,
    overtimePremiumAmount,
    totalAmount,
  };
}

function shiftWindow(shift: ShiftEntry): string {
  const [hour, minute] = shift.startTime!.split(":").map(Number);
  const value = hour * 60 + minute;
  if (value < 6 * 60 || value >= 20 * 60) return "Nacht";
  if (value < 11 * 60) return "Früh";
  if (value < 15 * 60) return "Tag";
  return "Spät";
}

function intervalOverlap(
  start: number,
  end: number,
  rangeStart: number,
  rangeEnd: number,
): number {
  return Math.max(0, Math.min(end, rangeEnd) - Math.max(start, rangeStart));
}

function nightOverlap(start: number, end: number): number {
  let minutes = 0;
  for (let day = -1; day <= 2; day += 1) {
    const dayStart = day * 24 * 60;
    minutes += intervalOverlap(start, end, dayStart, dayStart + 6 * 60);
    minutes += intervalOverlap(start, end, dayStart + 21 * 60, dayStart + 24 * 60);
  }
  return minutes;
}

function tariffNightMinutes(shift: ShiftEntry): number {
  const [startHour, startMinute] = shift.startTime!.split(":").map(Number);
  const [endHour, endMinute] = shift.endTime!.split(":").map(Number);
  const start = startHour * 60 + startMinute;
  const rawEnd = endHour * 60 + endMinute;
  const end = rawEnd <= start ? rawEnd + 24 * 60 : rawEnd;
  const gross = Math.max(0, end - start);
  const breakMinutes = Math.min(gross, shift.breakMinutes);
  const breakStart = start + Math.floor((gross - breakMinutes) / 2);
  const breakEnd = breakStart + breakMinutes;
  return nightOverlap(start, end) - nightOverlap(breakStart, breakEnd);
}

export function assessTvoedPattern(shifts: readonly ShiftEntry[]): TvoedAssessment {
  const work = shifts
    .filter(isWorkShift)
    .sort((left, right) =>
      left.date.localeCompare(right.date) ||
      left.startTime!.localeCompare(right.startTime!),
    );
  const orderedWindows = work.map(shiftWindow);
  const windows = new Set(orderedWindows);
  const nightShiftCount = work.filter(
    (shift) => tariffNightMinutes(shift) >= 2 * 60,
  ).length;
  const changeCount = orderedWindows.reduce(
    (count, window, index) =>
      index > 0 && orderedWindows[index - 1] !== window ? count + 1 : count,
    0,
  );
  const hasRegularChange = changeCount >= 2;
  const shiftWork =
    work.length === 0
      ? "NOT_DETECTED"
      : work.length >= 4 && windows.size >= 2 && hasRegularChange
        ? "DETECTED"
        : "REVIEW";
  const alternatingShiftWork =
    work.length === 0 || nightShiftCount === 0
      ? "NOT_DETECTED"
      : work.length >= 4 &&
          windows.size >= 3 &&
          nightShiftCount >= 2 &&
          hasRegularChange
        ? "DETECTED"
        : windows.size >= 2
          ? "REVIEW"
          : "NOT_DETECTED";
  const suggestedAllowance: AllowanceStatus =
    alternatingShiftWork === "DETECTED"
      ? "ALTERNATING_MONTHLY"
      : alternatingShiftWork === "REVIEW"
        ? "ALTERNATING_HOURLY"
        : shiftWork === "DETECTED"
          ? "SHIFT_MONTHLY"
          : shiftWork === "REVIEW"
            ? "SHIFT_HOURLY"
            : "NONE";
  return {
    shiftWork,
    alternatingShiftWork,
    suggestedAllowance,
    evidence: [
      `${work.length} Arbeitsdienste`,
      `${windows.size} Dienstlagen${windows.size ? `: ${[...windows].join(", ")}` : ""}`,
      `${changeCount} Wechsel der Dienstlage`,
      nightShiftCount > 0
        ? `${nightShiftCount} Nachtschichten mit mindestens 2 Stunden Nachtarbeit`
        : "Keine tarifliche Nachtschicht erkannt",
    ],
  };
}

function allowanceAmount(
  status: AllowanceStatus | null,
  workMinutes: number,
  profile: UserProfile,
): number {
  if (status === null || status === "NONE" || profile.tariff === null) return 0;
  const factor = profile.weeklyMinutes / profile.tariff.fullTimeWeeklyMinutes;
  if (status === "SHIFT_MONTHLY") return roundMoney(100 * factor);
  if (status === "ALTERNATING_MONTHLY") return roundMoney(250 * factor);
  const isBw = profile.federalState === "BW";
  const hourly =
    status === "ALTERNATING_HOURLY"
      ? profile.tariff.sector === "BT_K" && !isBw ? 1.49 : 1.47
      : profile.tariff.sector === "BT_K" && !isBw ? 0.60 : 0.59;
  return roundMoney((workMinutes / 60) * hourly);
}

function careAllowanceAmount(date: string, profile: UserProfile): number {
  if (profile.tariff === null) return 0;
  const fullTimeAmount = date >= "2026-05-01"
    ? 141.82
    : date >= "2025-04-01"
      ? 137.96
      : 133.80;
  return roundMoney(
    fullTimeAmount *
      (profile.weeklyMinutes / profile.tariff.fullTimeWeeklyMinutes),
  );
}

function tvoedAllowanceAmount(date: string, profile: UserProfile): number {
  if (profile.tariff === null) return 0;
  const validFrom = profile.tariff.sector === "BT_K"
    ? "2008-07-01"
    : "2021-03-01";
  if (date < validFrom) return 0;
  return roundMoney(
    25 *
      (profile.weeklyMinutes / profile.tariff.fullTimeWeeklyMinutes),
  );
}

export function calculateMonthlyPayEstimate(
  month: string,
  shifts: readonly ShiftEntry[],
  profile: UserProfile,
  decision: MonthlyTariffDecision | null,
  assessmentShifts: readonly ShiftEntry[] = shifts,
): MonthlyPayEstimate {
  const monthShifts = shifts.filter(
    (shift) => shift.deletedAt === null && shift.date.startsWith(`${month}-`) && isWorkShift(shift),
  );
  const first = Temporal.PlainDate.from(`${month}-01`);
  const assessmentStart = first.subtract({ months: 1 }).toString();
  const assessmentEnd = first.add({ months: 1 }).subtract({ days: 1 }).toString();
  const relevantAssessmentShifts = monthShifts.length === 0
    ? []
    : assessmentShifts.filter(
      (shift) =>
        shift.deletedAt === null &&
        shift.date >= assessmentStart &&
        shift.date <= assessmentEnd &&
        isWorkShift(shift),
    );
  const assessment = assessTvoedPattern(relevantAssessmentShifts);
  const dateKey = `${month}-01`;
  const version = getTariffVersion(dateKey);
  const tariff = profile.tariff;
  if (version === null || tariff === null) {
    return {
      month,
      tariffLabel: version?.label ?? null,
      available: false,
      fullTimeTableAmount: null,
      personalBaseAmount: null,
      shiftBreakdowns: [],
      timePremiumAmount: 0,
      overtimeAmount: 0,
      allowanceAmount: 0,
      tvoedAllowanceAmount: 0,
      careAllowanceAmount: 0,
      estimatedGrossAmount: null,
      assessment,
      confirmedAllowance: decision?.allowanceStatus ?? null,
    };
  }
  const shiftBreakdowns = monthShifts.map((shift) =>
    calculateShiftPremiumBreakdown(shift, profile),
  );
  const fullTimeTableAmount = getMonthlyTableAmount(tariff, dateKey)!;
  const personalBaseAmount = roundMoney(
    fullTimeTableAmount * (profile.weeklyMinutes / tariff.fullTimeWeeklyMinutes),
  );
  const timePremiumAmount = roundMoney(
    shiftBreakdowns.reduce(
      (sum, item) => sum + item.premiumLines.reduce((lineSum, line) => lineSum + line.amount, 0),
      0,
    ),
  );
  const overtimeAmount = roundMoney(
    shiftBreakdowns.reduce(
      (sum, item) => sum + item.overtimeBaseAmount + item.overtimePremiumAmount,
      0,
    ),
  );
  const workMinutes = shiftBreakdowns.reduce((sum, item) => sum + item.netMinutes, 0);
  const confirmedAllowance = decision?.allowanceStatus ?? null;
  const effectiveAllowance =
    confirmedAllowance ?? assessment.suggestedAllowance;
  const monthlyAllowanceAmount = allowanceAmount(
    effectiveAllowance,
    workMinutes,
    profile,
  );
  const monthlyTvoedAllowanceAmount = tvoedAllowanceAmount(dateKey, profile);
  const monthlyCareAllowanceAmount = careAllowanceAmount(dateKey, profile);
  return {
    month,
    tariffLabel: version.label,
    available: true,
    fullTimeTableAmount,
    personalBaseAmount,
    shiftBreakdowns,
    timePremiumAmount,
    overtimeAmount,
    allowanceAmount: monthlyAllowanceAmount,
    tvoedAllowanceAmount: monthlyTvoedAllowanceAmount,
    careAllowanceAmount: monthlyCareAllowanceAmount,
    estimatedGrossAmount: roundMoney(
      personalBaseAmount +
        timePremiumAmount +
        overtimeAmount +
        monthlyAllowanceAmount +
        monthlyTvoedAllowanceAmount +
        monthlyCareAllowanceAmount,
    ),
    assessment,
    confirmedAllowance,
  };
}
