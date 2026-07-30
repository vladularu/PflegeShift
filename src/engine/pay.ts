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
  const holidaysByYear = new Map<number, Set<string>>();
  const buckets = { night: 0, sunday: 0, holiday: 0, saturday: 0, preholiday: 0 };
  const start = zonedStart(shift, profile.timeZone);

  for (let index = 0; index < gross; index++) {
    if (index >= breakStart && index < breakEnd) continue;
    const cursor = start.add({ minutes: index });
    const date = cursor.toPlainDate();
    let holidays = holidaysByYear.get(date.year);
    if (!holidays) {
      holidays = new Set(
        getPublicHolidays(date.year, profile.federalState).map((holiday) => holiday.date),
      );
      holidaysByYear.set(date.year, holidays);
    }
    const dateKey = date.toString();
    const minuteOfDay = cursor.hour * 60 + cursor.minute;
    if (minuteOfDay >= 21 * 60 || minuteOfDay < 6 * 60) buckets.night++;

    if (holidays.has(dateKey)) {
      buckets.holiday++;
    } else if (
      (date.month === 12 && (date.day === 24 || date.day === 31)) &&
      minuteOfDay >= 6 * 60
    ) {
      buckets.preholiday++;
    } else if (date.dayOfWeek === 7) {
      buckets.sunday++;
    } else if (date.dayOfWeek === 6 && minuteOfDay >= 13 * 60 && minuteOfDay < 21 * 60) {
      buckets.saturday++;
    }
  }

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

function hasTariffNightWork(shift: ShiftEntry): boolean {
  const [startHour, startMinute] = shift.startTime!.split(":").map(Number);
  const [endHour, endMinute] = shift.endTime!.split(":").map(Number);
  const start = startHour * 60 + startMinute;
  const end = endHour * 60 + endMinute;
  if (end <= start) return true;
  return start < 6 * 60 || start >= 21 * 60 || end > 21 * 60;
}

export function assessTvoedPattern(shifts: readonly ShiftEntry[]): TvoedAssessment {
  const work = shifts.filter(isWorkShift);
  const windows = new Set(work.map(shiftWindow));
  const hasNight = work.some(hasTariffNightWork);
  const shiftWork =
    work.length === 0
      ? "NOT_DETECTED"
      : work.length >= 4 && windows.size >= 2
        ? "DETECTED"
        : "REVIEW";
  const alternatingShiftWork =
    work.length === 0 || !hasNight
      ? "NOT_DETECTED"
      : work.length >= 4 && windows.size >= 3
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
      hasNight ? "Nachtarbeit erkannt" : "Keine Nachtarbeit erkannt",
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

export function calculateMonthlyPayEstimate(
  month: string,
  shifts: readonly ShiftEntry[],
  profile: UserProfile,
  decision: MonthlyTariffDecision | null,
): MonthlyPayEstimate {
  const monthShifts = shifts.filter(
    (shift) => shift.deletedAt === null && shift.date.startsWith(`${month}-`) && isWorkShift(shift),
  );
  const assessment = assessTvoedPattern(monthShifts);
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
  const monthlyAllowanceAmount = allowanceAmount(
    confirmedAllowance,
    workMinutes,
    profile,
  );
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
    estimatedGrossAmount: roundMoney(
      personalBaseAmount + timePremiumAmount + overtimeAmount + monthlyAllowanceAmount,
    ),
    assessment,
    confirmedAllowance,
  };
}
