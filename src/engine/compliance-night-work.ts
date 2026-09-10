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
import type { RuleLegalRules } from "@/rules/contracts.generated";
import { RuleResolutionError, type RuleResolver } from "@/rules/rule-resolver";

export interface NightWorkerQualificationOptions {
  readonly regularRotatingNightWork?: boolean | null;
}

export interface NightWorkAverageOptions extends NightWorkerQualificationOptions {
  readonly federalState?: FederalState;
  readonly holidayRegion?: HolidayRegion;
  readonly weeklyMinutes?: number;
}

interface NightAverageCandidate {
  readonly date: string;
  readonly deadline: Temporal.PlainDate;
  readonly rollingAverageMinutes: number | null;
  readonly rollingWorkdays: number | null;
  readonly related: readonly ShiftEntry[];
}

function minutesBetween(left: Temporal.ZonedDateTime, right: Temporal.ZonedDateTime): number {
  return Math.round(Number(right.epochMilliseconds - left.epochMilliseconds) / 60_000);
}

function zonedMinute(
  date: Temporal.PlainDate,
  minuteOfDay: number,
  timeZone: string,
): Temporal.ZonedDateTime {
  const hour = Math.floor(minuteOfDay / 60);
  const minute = minuteOfDay % 60;
  return Temporal.ZonedDateTime.from(
    {
      timeZone,
      year: date.year,
      month: date.month,
      day: date.day,
      hour,
      minute,
    },
    { disambiguation: hour < 12 ? "later" : "earlier" },
  );
}

function nightWorkMinutes(item: Interval, rules: RuleLegalRules): number {
  const cached = NIGHT_MINUTES.get(item);
  if (
    cached?.start === item.start &&
    cached.end === item.end &&
    cached.startMinute === rules.nightWork.startMinute &&
    cached.endMinute === rules.nightWork.endMinute
  ) {
    return cached.minutes;
  }
  let total = 0;
  let date = item.start.toPlainDate().subtract({ days: 1 });
  const lastDate = item.end.toPlainDate();
  while (Temporal.PlainDate.compare(date, lastDate) <= 0) {
    const nightStart = zonedMinute(date, rules.nightWork.startMinute, item.start.timeZoneId);
    const nightEnd = zonedMinute(
      rules.nightWork.endMinute <= rules.nightWork.startMinute ? date.add({ days: 1 }) : date,
      rules.nightWork.endMinute,
      item.start.timeZoneId,
    );
    const overlapStart =
      Temporal.ZonedDateTime.compare(item.start, nightStart) > 0 ? item.start : nightStart;
    const overlapEnd = Temporal.ZonedDateTime.compare(item.end, nightEnd) < 0 ? item.end : nightEnd;
    if (Temporal.ZonedDateTime.compare(overlapEnd, overlapStart) > 0) {
      total += minutesBetween(overlapStart, overlapEnd);
    }
    date = date.add({ days: 1 });
  }
  NIGHT_MINUTES.set(item, {
    start: item.start,
    end: item.end,
    startMinute: rules.nightWork.startMinute,
    endMinute: rules.nightWork.endMinute,
    minutes: total,
  });
  return total;
}

// Shared pure preparation for monthly checks of the same annual interval set.
// One value per weakly held interval; changed instants/time zone/night window miss.
// Qualification thresholds remain evaluated separately on every call.
const NIGHT_MINUTES = new WeakMap<
  Interval,
  {
    readonly start: Temporal.ZonedDateTime;
    readonly end: Temporal.ZonedDateTime;
    readonly startMinute: number;
    readonly endMinute: number;
    readonly minutes: number;
  }
>();

function compareThreshold(
  value: number,
  comparator: "GT" | "GTE" | "EQ",
  threshold: number,
): boolean {
  if (comparator === "GT") return value > threshold;
  if (comparator === "GTE") return value >= threshold;
  return value === threshold;
}

export function isNightWork(item: Interval, rules: RuleLegalRules): boolean {
  return compareThreshold(
    nightWorkMinutes(item, rules),
    rules.nightWork.qualification.comparator,
    rules.nightWork.qualification.thresholdMinutes,
  );
}

export function* qualifyAsNightWorkerIncrementally(
  intervals: readonly Interval[],
  rules: RuleLegalRules,
  engineContractVersion: number,
  calendarYear: number,
  options: NightWorkerQualificationOptions,
  batchSize = 12,
): Generator<number, boolean, void> {
  if (engineContractVersion >= 3 && options.regularRotatingNightWork === true) return true;
  const qualification = rules.nightWork.workerQualification;
  if (engineContractVersion >= 3 && qualification === undefined) return false;
  const threshold = engineContractVersion < 3 ? 1 : qualification!.annualNightWorkDaysThreshold;
  const yearPrefix = `${calendarYear}-`;
  const nightWorkDates = new Set<string>();
  const safeBatchSize = Math.max(1, Math.floor(batchSize));
  let processed = 0;
  for (const item of intervals) {
    if (item.shift.date.startsWith(yearPrefix) && isNightWork(item, rules)) {
      nightWorkDates.add(item.shift.date);
      if (nightWorkDates.size >= threshold) return true;
    }
    processed += 1;
    if (processed % safeBatchSize === 0) yield processed;
  }
  return false;
}

function stableId(rule: string, date: string, shiftIds: readonly string[]): string {
  return `${rule}:${date}:${[...shiftIds].sort().join(",")}`;
}

function issue(
  severity: ComplianceSeverity,
  rule: string,
  title: string,
  description: string,
  related: readonly ShiftEntry[],
  date = related.at(-1)?.date ?? "0000-00-00",
): ComplianceIssue {
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

function workGroupsByRecordedDate(intervals: readonly Interval[]): Interval[][] {
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

function statutoryWorkdays(
  start: Temporal.PlainDate,
  end: Temporal.PlainDate,
  holidays: ReadonlySet<string>,
  workWeekLastDay: number,
): number {
  let count = 0;
  for (let date = start; Temporal.PlainDate.compare(date, end) <= 0; date = date.add({ days: 1 })) {
    if (date.dayOfWeek <= workWeekLastDay && !holidays.has(date.toString())) count += 1;
  }
  return count;
}

function intervalsInRange(
  intervals: readonly Interval[],
  start: Temporal.PlainDate,
  end: Temporal.PlainDate,
): readonly Interval[] {
  const startValue = start.toString();
  const endValue = end.toString();
  return intervals.filter((item) => item.shift.date >= startValue && item.shift.date <= endValue);
}

function averageWorkedMinutes(
  intervals: readonly Interval[],
  start: Temporal.PlainDate,
  end: Temporal.PlainDate,
  federalState: FederalState | undefined,
  holidayRegion: HolidayRegion | undefined,
  rules: RuleLegalRules,
  ruleResolver: RuleResolver,
): { readonly averageMinutes: number; readonly workdays: number } | null {
  const holidays = knownHolidayDates(start, end, federalState, holidayRegion, ruleResolver);
  const workdays = statutoryWorkdays(start, end, holidays, rules.workingTime.workWeekLastDay);
  if (workdays === 0) return null;
  const workedMinutes = intervalsInRange(intervals, start, end).reduce(
    (sum, item) => sum + item.netMinutes,
    0,
  );
  return { averageMinutes: workedMinutes / workdays, workdays };
}

function creditedAbsenceMinutes(
  month: string,
  shifts: readonly ShiftEntry[],
  workedDates: ReadonlySet<string>,
  holidays: ReadonlySet<string>,
  weeklyMinutes: number | undefined,
  absenceWorkdaysPerWeek: number,
): number {
  if (!weeklyMinutes || weeklyMinutes <= 0) return 0;
  const dailyMinutes = Math.round(weeklyMinutes / absenceWorkdaysPerWeek);
  const creditedDates = new Set<string>();
  for (const shift of shifts) {
    if (
      shift.deletedAt !== null ||
      !shift.date.startsWith(`${month}-`) ||
      (shift.type !== "VACATION" && shift.type !== "SICK") ||
      workedDates.has(shift.date) ||
      creditedDates.has(shift.date)
    ) {
      continue;
    }
    const date = Temporal.PlainDate.from(shift.date);
    if (date.dayOfWeek <= absenceWorkdaysPerWeek && !holidays.has(shift.date)) {
      creditedDates.add(shift.date);
    }
  }
  return creditedDates.size * dailyMinutes;
}

function legacyNightAverageIssue(
  month: string,
  intervals: readonly Interval[],
  shifts: readonly ShiftEntry[],
  options: NightWorkAverageOptions,
  referenceDate: Temporal.PlainDate,
  rules: RuleLegalRules,
  ruleResolver: RuleResolver,
  extendedNightGroups: readonly (readonly Interval[])[],
): ComplianceIssue[] {
  const monthStart = Temporal.PlainDate.from(`${month}-01`);
  const monthEnd = monthStart.add({ months: 1 }).subtract({ days: 1 });
  const monthIntervals = intervalsInRange(intervals, monthStart, monthEnd);
  const holidays = knownHolidayDates(
    monthStart,
    monthEnd,
    options.federalState,
    options.holidayRegion,
    ruleResolver,
  );
  const workdayCount = statutoryWorkdays(
    monthStart,
    monthEnd,
    holidays,
    rules.workingTime.workWeekLastDay,
  );
  if (workdayCount === 0) return [];
  const workedDates = new Set(monthIntervals.map((item) => item.shift.date));
  const workedMinutes = monthIntervals.reduce((sum, item) => sum + item.netMinutes, 0);
  const absenceMinutes = creditedAbsenceMinutes(
    month,
    shifts,
    workedDates,
    holidays,
    options.weeklyMinutes,
    rules.workingTime.absenceWorkdaysPerWeek,
  );
  const averageMinutes = (workedMinutes + absenceMinutes) / workdayCount;
  if (averageMinutes <= rules.workingTime.nightAverageMinutes) return [];
  const overdue = Temporal.PlainDate.compare(referenceDate, monthEnd) > 0;
  const related = extendedNightGroups.flatMap((items) => items.map((item) => item.shift));
  const averageWindow =
    rules.nightWork.averageWindowDays === null
      ? "eines Kalendermonats"
      : rules.nightWork.averageWindowDays === 28
        ? "eines Kalendermonats oder vier Wochen"
        : `eines Kalendermonats oder ${rules.nightWork.averageWindowDays} Tagen`;
  return [
    issue(
      overdue ? "critical" : "warning",
      "ARBZG_6_NIGHT_AVERAGE",
      overdue ? "Ausgleich der Nachtarbeitszeit fehlt" : "Ausgleich der Nachtarbeitszeit offen",
      `Der eingetragene Durchschnitt beträgt ${durationLabel(averageMinutes)} je Werktag bei ${workdayCount} Werktagen. Für Nachtarbeit sind innerhalb ${averageWindow} durchschnittlich höchstens ${durationLabel(rules.workingTime.nightAverageMinutes)} zulässig.`,
      related,
    ),
  ];
}

export function checkNightWorkingTimeAverage(
  month: string,
  intervals: readonly Interval[],
  shifts: readonly ShiftEntry[],
  options: NightWorkAverageOptions,
  referenceDate: Temporal.PlainDate,
  rules: RuleLegalRules,
  ruleResolver: RuleResolver,
  engineContractVersion: number,
  nightWorkerQualified: boolean,
): ComplianceIssue[] {
  if (!nightWorkerQualified) return [];
  const monthStart = Temporal.PlainDate.from(`${month}-01`);
  const monthEnd = monthStart.add({ months: 1 }).subtract({ days: 1 });
  const monthIntervals = intervalsInRange(intervals, monthStart, monthEnd);
  const extendedNightGroups = workGroupsByRecordedDate(monthIntervals).filter(
    (items) =>
      items.some((item) => isNightWork(item, rules)) &&
      items.reduce((sum, item) => sum + item.netMinutes, 0) > rules.workingTime.nightAverageMinutes,
  );
  if (extendedNightGroups.length === 0) return [];
  if (engineContractVersion < 3) {
    return legacyNightAverageIssue(
      month,
      intervals,
      shifts,
      options,
      referenceDate,
      rules,
      ruleResolver,
      extendedNightGroups,
    );
  }

  const calendarAverage = averageWorkedMinutes(
    intervals,
    monthStart,
    monthEnd,
    options.federalState,
    options.holidayRegion,
    rules,
    ruleResolver,
  );
  if (
    calendarAverage === null ||
    calendarAverage.averageMinutes <= rules.workingTime.nightAverageMinutes
  ) {
    return [];
  }

  let candidate: NightAverageCandidate | null = null;
  for (const group of extendedNightGroups) {
    const date = group[0]!.shift.date;
    const windowDays = rules.nightWork.averageWindowDays;
    if (windowDays === null) {
      candidate = {
        date,
        deadline: monthEnd,
        rollingAverageMinutes: null,
        rollingWorkdays: null,
        related: group.map((item) => item.shift),
      };
      break;
    }
    const rollingStart = Temporal.PlainDate.from(date);
    const rollingEnd = rollingStart.add({ days: windowDays - 1 });
    const rollingAverage = averageWorkedMinutes(
      intervals,
      rollingStart,
      rollingEnd,
      options.federalState,
      options.holidayRegion,
      rules,
      ruleResolver,
    );
    if (
      rollingAverage !== null &&
      rollingAverage.averageMinutes > rules.workingTime.nightAverageMinutes
    ) {
      candidate = {
        date,
        deadline: Temporal.PlainDate.compare(monthEnd, rollingEnd) >= 0 ? monthEnd : rollingEnd,
        rollingAverageMinutes: rollingAverage.averageMinutes,
        rollingWorkdays: rollingAverage.workdays,
        related: group.map((item) => item.shift),
      };
      break;
    }
  }
  if (candidate === null) return [];

  const overdue = Temporal.PlainDate.compare(referenceDate, candidate.deadline) > 0;
  const rollingDescription =
    candidate.rollingAverageMinutes === null || candidate.rollingWorkdays === null
      ? ""
      : ` Im zugehörigen ${rules.nightWork.averageWindowDays}-Tage-Zeitraum sind es ${durationLabel(candidate.rollingAverageMinutes)} bei ${candidate.rollingWorkdays} Werktagen.`;
  return [
    issue(
      overdue ? "critical" : "warning",
      "ARBZG_6_NIGHT_AVERAGE",
      overdue ? "Ausgleich der Nachtarbeitszeit fehlt" : "Ausgleich der Nachtarbeitszeit offen",
      `Im Kalendermonat sind durchschnittlich ${durationLabel(calendarAverage.averageMinutes)} bei ${calendarAverage.workdays} Werktagen erfasst.${rollingDescription} Für Nachtarbeitnehmer sind durchschnittlich höchstens ${durationLabel(rules.workingTime.nightAverageMinutes)} zulässig.`,
      candidate.related,
      candidate.date,
    ),
  ];
}
