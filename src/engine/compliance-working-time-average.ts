import { Temporal } from "@js-temporal/polyfill";

import type {
  ComplianceIssue,
  ComplianceSeverity,
  FederalState,
  HolidayRegion,
  ShiftEntry,
} from "@/domain/types";
import type { ComplianceInterval as Interval } from "@/engine/compliance-sequences";
import { getPublicHolidays } from "@/engine/holidays";
import { isNightWork } from "@/engine/compliance-night-work";
import type { RuleLegalRules } from "@/rules/contracts.generated";
import { RuleResolutionError, type RuleResolver } from "@/rules/rule-resolver";

export interface WorkingTimeAverageOptions {
  readonly federalState?: FederalState;
  readonly holidayRegion?: HolidayRegion;
}

interface WindowAverage {
  readonly averageMinutes: number;
  readonly statutoryWorkdays: number;
  readonly neutralAbsenceDays: number;
}

function stableId(rule: string, date: string, shiftIds: readonly string[]): string {
  return `${rule}:${date}:${[...shiftIds].sort().join(",")}`;
}

function issue(
  severity: ComplianceSeverity,
  title: string,
  description: string,
  related: readonly ShiftEntry[],
  date: string,
): ComplianceIssue {
  const rule = "ARBZG_3_OVER_8H";
  const relatedShiftIds = related.map((shift) => shift.id);
  return {
    id: stableId(rule, date, relatedShiftIds),
    severity,
    kind: "LEGAL",
    rule,
    title,
    description,
    relatedShiftIds,
    date,
  };
}

function durationLabel(minutes: number): string {
  const rounded = Math.max(0, Math.round(minutes));
  return `${Math.floor(rounded / 60)}:${String(rounded % 60).padStart(2, "0")} h`;
}

function dateLabel(date: Temporal.PlainDate): string {
  return `${String(date.day).padStart(2, "0")}.${String(date.month).padStart(2, "0")}.${date.year}`;
}

function workGroupsByRecordedDate(
  intervals: readonly Interval[],
): readonly (readonly Interval[])[] {
  const groups = new Map<string, Interval[]>();
  for (const item of intervals) {
    const entries = groups.get(item.shift.date) ?? [];
    entries.push(item);
    groups.set(item.shift.date, entries);
  }
  return [...groups.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([, entries]) => entries);
}

function knownHolidayDates(
  start: Temporal.PlainDate,
  end: Temporal.PlainDate,
  federalState: FederalState | undefined,
  holidayRegion: HolidayRegion | undefined,
  ruleResolver: RuleResolver,
): ReadonlySet<string> {
  if (!federalState) return new Set();
  const holidays = new Set<string>();
  for (let year = start.year; year <= end.year; year += 1) {
    try {
      for (const holiday of getPublicHolidays(
        year,
        federalState,
        ruleResolver,
        holidayRegion ?? "NONE",
      )) {
        if (holiday.date >= start.toString() && holiday.date <= end.toString()) {
          holidays.add(holiday.date);
        }
      }
    } catch (error) {
      if (!(error instanceof RuleResolutionError)) throw error;
    }
  }
  return holidays;
}

function averageFromPrefix(
  start: Temporal.PlainDate,
  end: Temporal.PlainDate,
  dateIndexes: ReadonlyMap<string, number>,
  workedMinutesPrefix: readonly number[],
  statutoryWorkdaysPrefix: readonly number[],
  neutralAbsenceDaysPrefix: readonly number[],
): WindowAverage | null {
  const startIndex = dateIndexes.get(start.toString());
  const endIndex = dateIndexes.get(end.toString());
  if (startIndex === undefined || endIndex === undefined) return null;
  const workedMinutes = workedMinutesPrefix[endIndex + 1]! - workedMinutesPrefix[startIndex]!;
  const statutoryWorkdays =
    statutoryWorkdaysPrefix[endIndex + 1]! - statutoryWorkdaysPrefix[startIndex]!;
  const neutralAbsenceDays =
    neutralAbsenceDaysPrefix[endIndex + 1]! - neutralAbsenceDaysPrefix[startIndex]!;
  if (statutoryWorkdays === 0) return null;
  return {
    averageMinutes: workedMinutes / statutoryWorkdays,
    statutoryWorkdays,
    neutralAbsenceDays,
  };
}

export function* checkWorkingTimeAverageIncrementally(
  month: string,
  intervals: readonly Interval[],
  shifts: readonly ShiftEntry[],
  options: WorkingTimeAverageOptions,
  referenceDate: Temporal.PlainDate,
  rules: RuleLegalRules,
  ruleResolver: RuleResolver,
  engineContractVersion: number,
  nightWorkerQualified: boolean,
): Generator<number, ComplianceIssue[], void> {
  const averageRules = rules.workingTime.standardAverage;
  if (engineContractVersion < 4 || averageRules === undefined) return [];

  const candidates = workGroupsByRecordedDate(intervals).filter((items) => {
    if (!items[0]!.shift.date.startsWith(`${month}-`)) return false;
    const netMinutes = items.reduce((sum, item) => sum + item.netMinutes, 0);
    if (
      netMinutes <= rules.workingTime.standardDailyMinutes ||
      netMinutes > rules.workingTime.maxDailyMinutes
    ) {
      return false;
    }
    return !(nightWorkerQualified && items.some((item) => isNightWork(item, rules)));
  });
  if (candidates.length === 0) return [];

  let checkpoint = 0;
  yield checkpoint;

  const workedMinutesByDate = new Map<string, number>();
  for (const item of intervals) {
    workedMinutesByDate.set(
      item.shift.date,
      (workedMinutesByDate.get(item.shift.date) ?? 0) + item.netMinutes,
    );
  }
  const neutralTypes = new Set<string>(averageRules.neutralAbsenceTypes);
  const neutralAbsenceDates = new Set<string>();
  for (const shift of shifts) {
    if (
      shift.deletedAt === null &&
      neutralTypes.has(shift.type) &&
      !workedMinutesByDate.has(shift.date)
    ) {
      neutralAbsenceDates.add(shift.date);
    }
  }
  yield (checkpoint += 1);

  const firstDate = Temporal.PlainDate.from(candidates[0]![0]!.shift.date);
  const lastCandidateDate = Temporal.PlainDate.from(candidates.at(-1)![0]!.shift.date);
  const lastCalendarEnd = lastCandidateDate
    .add({ months: averageRules.calendarMonths })
    .subtract({ days: 1 });
  const lastWeekEnd = lastCandidateDate.add({ weeks: averageRules.weeks }).subtract({ days: 1 });
  const lastDate =
    Temporal.PlainDate.compare(lastCalendarEnd, lastWeekEnd) >= 0 ? lastCalendarEnd : lastWeekEnd;
  const holidays = knownHolidayDates(
    firstDate,
    lastDate,
    options.federalState,
    options.holidayRegion,
    ruleResolver,
  );
  yield (checkpoint += 1);

  const dateIndexes = new Map<string, number>();
  const workedMinutesPrefix = [0];
  const statutoryWorkdaysPrefix = [0];
  const neutralAbsenceDaysPrefix = [0];
  let index = 0;
  for (
    let date = firstDate;
    Temporal.PlainDate.compare(date, lastDate) <= 0;
    date = date.add({ days: 1 })
  ) {
    const dateValue = date.toString();
    dateIndexes.set(dateValue, index);
    const statutoryWorkday =
      date.dayOfWeek <= rules.workingTime.workWeekLastDay && !holidays.has(dateValue);
    const neutralAbsenceDay = statutoryWorkday && neutralAbsenceDates.has(dateValue);
    workedMinutesPrefix.push(
      workedMinutesPrefix[index]! + (workedMinutesByDate.get(dateValue) ?? 0),
    );
    statutoryWorkdaysPrefix.push(
      statutoryWorkdaysPrefix[index]! + (statutoryWorkday && !neutralAbsenceDay ? 1 : 0),
    );
    neutralAbsenceDaysPrefix.push(neutralAbsenceDaysPrefix[index]! + (neutralAbsenceDay ? 1 : 0));
    index += 1;
    if (index % 14 === 0) yield (checkpoint += 1);
  }
  yield (checkpoint += 1);

  for (const candidate of candidates) {
    const start = Temporal.PlainDate.from(candidate[0]!.shift.date);
    const calendarEnd = start.add({ months: averageRules.calendarMonths }).subtract({ days: 1 });
    const weekEnd = start.add({ weeks: averageRules.weeks }).subtract({ days: 1 });
    const calendarAverage = averageFromPrefix(
      start,
      calendarEnd,
      dateIndexes,
      workedMinutesPrefix,
      statutoryWorkdaysPrefix,
      neutralAbsenceDaysPrefix,
    );
    const weekAverage = averageFromPrefix(
      start,
      weekEnd,
      dateIndexes,
      workedMinutesPrefix,
      statutoryWorkdaysPrefix,
      neutralAbsenceDaysPrefix,
    );
    if (
      calendarAverage !== null &&
      weekAverage !== null &&
      calendarAverage.averageMinutes > rules.workingTime.standardDailyMinutes &&
      weekAverage.averageMinutes > rules.workingTime.standardDailyMinutes
    ) {
      const deadline =
        Temporal.PlainDate.compare(calendarEnd, weekEnd) >= 0 ? calendarEnd : weekEnd;
      const overdue = Temporal.PlainDate.compare(referenceDate, deadline) > 0;
      const neutralAbsenceDays = Math.max(
        calendarAverage.neutralAbsenceDays,
        weekAverage.neutralAbsenceDays,
      );
      const absenceDescription =
        neutralAbsenceDays === 0
          ? ""
          : ` Urlaub und Krankheit wurden mit ${neutralAbsenceDays} neutralen Werktagen nicht als Ausgleich verwendet.`;
      return [
        issue(
          overdue ? "critical" : "warning",
          overdue ? "Ausgleich der Tagesarbeitszeit fehlt" : "Ausgleich der Tagesarbeitszeit offen",
          `Ab ${dateLabel(start)} liegen die erfassten Durchschnitte bei ${durationLabel(calendarAverage.averageMinutes)} in ${averageRules.calendarMonths} Kalendermonaten (${calendarAverage.statutoryWorkdays} Werktage) und ${durationLabel(weekAverage.averageMinutes)} in ${averageRules.weeks} Wochen (${weekAverage.statutoryWorkdays} Werktage). Zulässig sind höchstens ${durationLabel(rules.workingTime.standardDailyMinutes)} je Werktag; eine der beiden Alternativen muss bis ${dateLabel(deadline)} eingehalten sein.${absenceDescription}`,
          candidate.map((item) => item.shift),
          candidate[0]!.shift.date,
        ),
      ];
    }
    yield (checkpoint += 1);
  }
  return [];
}
