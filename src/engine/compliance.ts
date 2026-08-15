import { Temporal } from "@js-temporal/polyfill";

import type {
  ComplianceIssue,
  ComplianceKind,
  ComplianceSeverity,
  FederalState,
  MonthlyComplianceResult,
  ShiftEntry,
} from "@/domain/types";
import { getPublicHolidays } from "@/engine/holidays";
import { calculateTimedShiftMinutes } from "@/engine/working-time";

const RELEVANT_TYPES = new Set(["EARLY", "LATE", "NIGHT", "DAY", "TRAINING", "CUSTOM"]);

interface Interval {
  readonly shift: ShiftEntry;
  readonly start: Temporal.ZonedDateTime;
  readonly end: Temporal.ZonedDateTime;
  readonly grossMinutes: number;
  readonly netMinutes: number;
}

interface CachedInterval {
  readonly signature: string;
  readonly value: Interval;
}

const INTERVAL_CACHE = new WeakMap<ShiftEntry, Map<string, CachedInterval>>();

export interface ComplianceOptions {
  readonly federalState?: FederalState;
  readonly referenceDate?: string;
  readonly weeklyMinutes?: number;
}

function isRelevant(shift: ShiftEntry): boolean {
  return (
    shift.deletedAt === null &&
    !shift.allDay &&
    RELEVANT_TYPES.has(shift.type) &&
    shift.startTime !== null &&
    shift.endTime !== null
  );
}

function intervalSignature(shift: ShiftEntry): string {
  return [
    shift.revision,
    shift.date,
    shift.type,
    shift.startTime,
    shift.endTime,
    shift.breakMinutes,
    shift.deletedAt,
  ].join("|");
}

function toInterval(shift: ShiftEntry, timeZone: string): Interval {
  const signature = intervalSignature(shift);
  const cachedByTimeZone = INTERVAL_CACHE.get(shift);
  const cached = cachedByTimeZone?.get(timeZone);
  if (cached?.signature === signature) return cached.value;

  const date = Temporal.PlainDate.from(shift.date);
  const startTime = Temporal.PlainTime.from(shift.startTime!);
  const endTime = Temporal.PlainTime.from(shift.endTime!);
  const endDate =
    Temporal.PlainTime.compare(endTime, startTime) <= 0 ? date.add({ days: 1 }) : date;
  const start = Temporal.ZonedDateTime.from(
    {
      timeZone,
      year: date.year,
      month: date.month,
      day: date.day,
      hour: startTime.hour,
      minute: startTime.minute,
    },
    { disambiguation: "earlier" },
  );
  const end = Temporal.ZonedDateTime.from(
    {
      timeZone,
      year: endDate.year,
      month: endDate.month,
      day: endDate.day,
      hour: endTime.hour,
      minute: endTime.minute,
    },
    { disambiguation: "later" },
  );
  const value = Object.freeze({
    shift,
    start,
    end,
    grossMinutes: Math.max(
      0,
      Math.round(Number(end.epochMilliseconds - start.epochMilliseconds) / 60_000),
    ),
    netMinutes: calculateTimedShiftMinutes(shift, timeZone),
  });
  const nextCache = cachedByTimeZone ?? new Map<string, CachedInterval>();
  nextCache.set(timeZone, Object.freeze({ signature, value }));
  if (!cachedByTimeZone) INTERVAL_CACHE.set(shift, nextCache);
  return value;
}

export function* prepareComplianceIntervalsIncrementally(
  shifts: readonly ShiftEntry[],
  timeZone: string,
  batchSize = 24,
): Generator<number, void, void> {
  const safeBatchSize = Math.max(1, Math.floor(batchSize));
  let prepared = 0;
  for (const shift of shifts) {
    if (!isRelevant(shift)) continue;
    toInterval(shift, timeZone);
    prepared += 1;
    if (prepared % safeBatchSize === 0) yield prepared;
  }
  if (prepared % safeBatchSize !== 0) yield prepared;
}

function stableId(rule: string, date: string, shiftIds: readonly string[]): string {
  return `${rule}:${date}:${[...shiftIds].sort().join(",")}`;
}

function issue(
  severity: ComplianceSeverity,
  kind: ComplianceKind,
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
    kind,
    rule,
    title,
    description,
    relatedShiftIds,
    date,
  };
}

function hours(minutes: number): string {
  return `${Math.round((minutes / 60) * 100) / 100} h`;
}

function durationLabel(minutes: number): string {
  const rounded = Math.max(0, Math.round(minutes));
  return `${Math.floor(rounded / 60)}:${String(rounded % 60).padStart(2, "0")} h`;
}

function dateLabel(date: Temporal.PlainDate): string {
  return `${String(date.day).padStart(2, "0")}.${String(date.month).padStart(2, "0")}.${date.year}`;
}

function minutesBetween(left: Temporal.ZonedDateTime, right: Temporal.ZonedDateTime): number {
  return Math.round(Number(right.epochMilliseconds - left.epochMilliseconds) / 60_000);
}

function zonedHour(
  date: Temporal.PlainDate,
  hour: number,
  timeZone: string,
): Temporal.ZonedDateTime {
  return Temporal.ZonedDateTime.from(
    {
      timeZone,
      year: date.year,
      month: date.month,
      day: date.day,
      hour,
    },
    { disambiguation: hour < 12 ? "later" : "earlier" },
  );
}

function nightWorkMinutes(item: Interval): number {
  let total = 0;
  let date = item.start.toPlainDate().subtract({ days: 1 });
  const lastDate = item.end.toPlainDate();
  while (Temporal.PlainDate.compare(date, lastDate) <= 0) {
    const nightStart = zonedHour(date, 23, item.start.timeZoneId);
    const nightEnd = zonedHour(date.add({ days: 1 }), 6, item.start.timeZoneId);
    const overlapStart =
      Temporal.ZonedDateTime.compare(item.start, nightStart) > 0 ? item.start : nightStart;
    const overlapEnd = Temporal.ZonedDateTime.compare(item.end, nightEnd) < 0 ? item.end : nightEnd;
    if (Temporal.ZonedDateTime.compare(overlapEnd, overlapStart) > 0) {
      total += minutesBetween(overlapStart, overlapEnd);
    }
    date = date.add({ days: 1 });
  }
  return total;
}

function isNightWork(item: Interval): boolean {
  return nightWorkMinutes(item) > 120;
}

function checkDuplicates(intervals: readonly Interval[]): ComplianceIssue[] {
  const seen = new Map<string, ShiftEntry>();
  const issues: ComplianceIssue[] = [];
  for (const item of intervals) {
    const key = [
      item.shift.date,
      item.shift.startTime,
      item.shift.endTime,
      item.shift.breakMinutes,
      item.shift.type,
    ].join("|");
    const previous = seen.get(key);
    if (previous) {
      issues.push(
        issue(
          "critical",
          "LEGAL",
          "DATA_DUPLICATE",
          "Doppelter Kalendereintrag",
          "Derselbe Dienst wurde mit identischer Zeit, Pause und Dienstart mehrfach erfasst.",
          [previous, item.shift],
        ),
      );
    } else {
      seen.set(key, item.shift);
    }
  }
  return issues;
}

function checkOverlaps(intervals: readonly Interval[]): ComplianceIssue[] {
  const issues: ComplianceIssue[] = [];
  for (let index = 0; index < intervals.length - 1; index++) {
    const current = intervals[index];
    const next = intervals[index + 1];
    const duplicate =
      current.start.epochMilliseconds === next.start.epochMilliseconds &&
      current.end.epochMilliseconds === next.end.epochMilliseconds &&
      current.shift.breakMinutes === next.shift.breakMinutes &&
      current.shift.type === next.shift.type;
    if (!duplicate && Temporal.ZonedDateTime.compare(next.start, current.end) < 0) {
      issues.push(
        issue(
          "critical",
          "LEGAL",
          "SHIFT_OVERLAP",
          "Dienste überschneiden sich",
          "Zwei arbeitszeitrelevante Einträge liegen zeitlich übereinander.",
          [current.shift, next.shift],
        ),
      );
    }
  }
  return issues;
}

function workGroupsByRecordedDate(intervals: readonly Interval[]): Interval[][] {
  const groups = new Map<string, Interval[]>();
  for (const item of intervals) {
    const entries = groups.get(item.shift.date) ?? [];
    entries.push(item);
    groups.set(item.shift.date, entries);
  }
  return [...groups.values()];
}

function interruptionMinutes(items: readonly Interval[]): number {
  let total = 0;
  let latestEnd = items[0]?.end;
  for (const item of items.slice(1)) {
    if (!latestEnd) break;
    const gap = minutesBetween(latestEnd, item.start);
    if (gap >= 15) total += gap;
    if (Temporal.ZonedDateTime.compare(item.end, latestEnd) > 0) latestEnd = item.end;
  }
  return total;
}

function hasContinuousWorkOverSixHours(items: readonly Interval[]): boolean {
  let blockStart: Temporal.ZonedDateTime | null = null;
  let blockEnd: Temporal.ZonedDateTime | null = null;
  for (const item of items) {
    if (item.shift.breakMinutes > 0) {
      blockStart = null;
      blockEnd = null;
      continue;
    }
    if (!blockStart || !blockEnd || minutesBetween(blockEnd, item.start) >= 15) {
      blockStart = item.start;
      blockEnd = item.end;
    } else if (Temporal.ZonedDateTime.compare(item.end, blockEnd) > 0) {
      blockEnd = item.end;
    }
    if (blockStart && blockEnd && minutesBetween(blockStart, blockEnd) > 360) return true;
  }
  return false;
}

function checkWorkingTime(intervals: readonly Interval[]): ComplianceIssue[] {
  const issues: ComplianceIssue[] = [];
  for (const items of workGroupsByRecordedDate(intervals)) {
    const shifts = items.map((item) => item.shift);
    const date = shifts.at(-1)!.date;
    const net = items.reduce((sum, item) => sum + item.netMinutes, 0);
    const containsNightWork = items.some(isNightWork);
    const recordedBreak = shifts.reduce((sum, shift) => sum + shift.breakMinutes, 0);
    const interruptions = interruptionMinutes(items);

    if (net > 600) {
      issues.push(
        issue(
          "critical",
          "LEGAL",
          "ARBZG_3_MAX_10H",
          "Tagesarbeitszeit über 10 Stunden",
          `${hours(net)} Nettoarbeitszeit überschreiten die 10-Stunden-Grenze.`,
          shifts,
          date,
        ),
      );
    } else if (net > 480 && !containsNightWork) {
      issues.push(
        issue(
          "warning",
          "LEGAL",
          "ARBZG_3_OVER_8H",
          "Tagesarbeitszeit über 8 Stunden",
          `${hours(net)} Nettoarbeitszeit erfordern einen zulässigen Ausgleichszeitraum.`,
          shifts,
          date,
        ),
      );
    }

    const requiredBreak = net > 540 ? 45 : net > 360 ? 30 : 0;
    if (recordedBreak < requiredBreak) {
      if (recordedBreak + interruptions >= requiredBreak) {
        issues.push(
          issue(
            "warning",
            "LEGAL",
            "ARBZG_4_INTERRUPTION",
            "Unterbrechung als Pause prüfen",
            `${interruptions} Minuten zwischen Diensten könnten die fehlende Pause abdecken. Bitte die tatsächliche Pausenlage prüfen.`,
            shifts,
            date,
          ),
        );
      } else {
        issues.push(
          issue(
            "critical",
            "LEGAL",
            "ARBZG_4_BREAK",
            "Pause zu kurz",
            `Erfasst sind ${recordedBreak} Minuten Pause; erforderlich sind mindestens ${requiredBreak} Minuten.`,
            shifts,
            date,
          ),
        );
      }
    }
    if (hasContinuousWorkOverSixHours(items)) {
      issues.push(
        issue(
          "critical",
          "LEGAL",
          "ARBZG_4_CONTINUOUS",
          "Mehr als sechs Stunden ohne dokumentierte Pause",
          "Ein zusammenhängender Arbeitsblock überschreitet sechs Stunden ohne dokumentierte Ruhepause.",
          shifts,
          date,
        ),
      );
    }
    for (const item of items) {
      if (item.shift.breakMinutes > item.grossMinutes) {
        issues.push(
          issue(
            "critical",
            "LEGAL",
            "TIME_PLAUSIBILITY",
            "Pause länger als Dienst",
            "Die eingetragene Pause ist länger als die gesamte Brutto-Dienstzeit.",
            [item.shift],
          ),
        );
      }
      if (item.grossMinutes > 960) {
        issues.push(
          issue(
            "warning",
            "PLANNING",
            "TIME_GROSS_OVER_16H",
            "Dienst länger als 16 Stunden",
            `Die Brutto-Dienstzeit beträgt ${hours(item.grossMinutes)} und sollte auf einen Eingabefehler geprüft werden.`,
            [item.shift],
          ),
        );
      }
    }
  }
  return issues;
}

function publicHolidayDatesForMonth(
  month: string,
  federalState: FederalState | undefined,
): ReadonlySet<string> {
  if (!federalState) return new Set();
  const year = Number(month.slice(0, 4));
  return new Set(getPublicHolidays(year, federalState).map((holiday) => holiday.date));
}

function statutoryWorkdaysInMonth(month: string, holidays: ReadonlySet<string>): number {
  const first = Temporal.PlainDate.from(`${month}-01`);
  const end = first.add({ months: 1 });
  let count = 0;
  for (let date = first; Temporal.PlainDate.compare(date, end) < 0; date = date.add({ days: 1 })) {
    if (date.dayOfWeek <= 6 && !holidays.has(date.toString())) count += 1;
  }
  return count;
}

function creditedAbsenceMinutes(
  month: string,
  shifts: readonly ShiftEntry[],
  workedDates: ReadonlySet<string>,
  holidays: ReadonlySet<string>,
  weeklyMinutes: number | undefined,
): number {
  if (!weeklyMinutes || weeklyMinutes <= 0) return 0;
  const dailyMinutes = Math.round(weeklyMinutes / 5);
  const creditedDates = new Set<string>();
  for (const shift of shifts) {
    if (
      shift.deletedAt !== null ||
      !shift.date.startsWith(`${month}-`) ||
      (shift.type !== "VACATION" && shift.type !== "SICK") ||
      workedDates.has(shift.date) ||
      creditedDates.has(shift.date)
    )
      continue;
    const date = Temporal.PlainDate.from(shift.date);
    if (date.dayOfWeek <= 5 && !holidays.has(shift.date)) creditedDates.add(shift.date);
  }
  return creditedDates.size * dailyMinutes;
}

function checkNightWorkingTimeAverage(
  month: string,
  intervals: readonly Interval[],
  shifts: readonly ShiftEntry[],
  options: ComplianceOptions,
  referenceDate: Temporal.PlainDate,
): ComplianceIssue[] {
  const monthIntervals = intervals.filter((item) => item.shift.date.startsWith(`${month}-`));
  const extendedNightGroups = workGroupsByRecordedDate(monthIntervals).filter(
    (items) =>
      items.some(isNightWork) && items.reduce((sum, item) => sum + item.netMinutes, 0) > 480,
  );
  if (extendedNightGroups.length === 0) return [];

  const holidays = publicHolidayDatesForMonth(month, options.federalState);
  const workdayCount = statutoryWorkdaysInMonth(month, holidays);
  if (workdayCount === 0) return [];

  const workedDates = new Set(monthIntervals.map((item) => item.shift.date));
  const workedMinutes = monthIntervals.reduce((sum, item) => sum + item.netMinutes, 0);
  const absenceMinutes = creditedAbsenceMinutes(
    month,
    shifts,
    workedDates,
    holidays,
    options.weeklyMinutes,
  );
  const averageMinutes = (workedMinutes + absenceMinutes) / workdayCount;
  if (averageMinutes <= 480) return [];

  const monthEnd = Temporal.PlainDate.from(`${month}-01`).add({ months: 1 }).subtract({ days: 1 });
  const overdue = Temporal.PlainDate.compare(referenceDate, monthEnd) > 0;
  const related = extendedNightGroups.flatMap((items) => items.map((item) => item.shift));
  return [
    issue(
      overdue ? "critical" : "warning",
      "LEGAL",
      "ARBZG_6_NIGHT_AVERAGE",
      overdue ? "Ausgleich der Nachtarbeitszeit fehlt" : "Ausgleich der Nachtarbeitszeit offen",
      `Der eingetragene Durchschnitt beträgt ${durationLabel(averageMinutes)} je Werktag bei ${workdayCount} Werktagen. Für Nachtarbeit sind innerhalb eines Kalendermonats oder vier Wochen durchschnittlich höchstens 8:00 h zulässig.`,
      related,
    ),
  ];
}

interface WorkdayBoundary {
  readonly date: string;
  readonly earliest: Interval;
  readonly latest: Interval;
}

interface RestPeriod {
  readonly current: Interval;
  readonly next: Interval;
  readonly minutes: number;
}

function workdayBoundaries(intervals: readonly Interval[]): WorkdayBoundary[] {
  const byDate = new Map<string, Interval[]>();
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

function restPeriods(intervals: readonly Interval[]): RestPeriod[] {
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

function compensatedShortRestIndexes(periods: readonly RestPeriod[]): ReadonlySet<number> {
  const compensated = new Set<number>();
  const usedCompensationPeriods = new Set<number>();

  for (let shortIndex = 0; shortIndex < periods.length; shortIndex += 1) {
    const shortened = periods[shortIndex];
    if (shortened.minutes < 600 || shortened.minutes >= 660) continue;

    const deadline = shortened.next.start.add({ days: 28 });
    for (
      let candidateIndex = shortIndex + 1;
      candidateIndex < periods.length;
      candidateIndex += 1
    ) {
      const candidate = periods[candidateIndex];
      if (usedCompensationPeriods.has(candidateIndex) || candidate.minutes < 720) continue;

      const twelveHoursCompleted = candidate.current.end.add({ hours: 12 });
      if (Temporal.ZonedDateTime.compare(twelveHoursCompleted, deadline) > 0) break;

      compensated.add(shortIndex);
      usedCompensationPeriods.add(candidateIndex);
      break;
    }
  }

  return compensated;
}

function checkRestAndSequence(
  intervals: readonly Interval[],
  referenceDate: Temporal.PlainDate,
): ComplianceIssue[] {
  const issues: ComplianceIssue[] = [];
  const periods = restPeriods(intervals);
  const compensated = compensatedShortRestIndexes(periods);
  for (let index = 0; index < periods.length; index += 1) {
    const { current, next, minutes: rest } = periods[index];
    if (rest < 600) {
      issues.push(
        issue(
          "critical",
          "LEGAL",
          "ARBZG_5_REST_10H",
          "Ruhezeit unter 10 Stunden",
          `Zwischen den Diensten liegen nur ${hours(rest)} Ruhezeit. Damit wird auch die für Krankenhäuser und Pflegeeinrichtungen mögliche Verkürzung auf 10 Stunden unterschritten.`,
          [current.shift, next.shift],
        ),
      );
    } else if (rest < 660 && !compensated.has(index)) {
      const deadline = next.start.toPlainDate().add({ days: 28 });
      const overdue = Temporal.PlainDate.compare(referenceDate, deadline) > 0;
      issues.push(
        issue(
          overdue ? "critical" : "warning",
          "LEGAL",
          "ARBZG_5_REST_11H",
          overdue
            ? "Ausgleich für verkürzte Ruhezeit fehlt"
            : "Ausgleich für verkürzte Ruhezeit offen",
          `Die Ruhezeit beträgt ${hours(rest)}. In den eingetragenen Diensten wurde bis ${dateLabel(deadline)} keine noch unbenutzte Ruhezeit von mindestens 12 Stunden als Ausgleich erkannt.`,
          [current.shift, next.shift],
        ),
      );
    } else if (
      rest >= 660 &&
      current.shift.type === "LATE" &&
      next.shift.type === "EARLY" &&
      Temporal.PlainDate.from(next.shift.date).since(Temporal.PlainDate.from(current.shift.date))
        .days === 1
    ) {
      issues.push(
        issue(
          "warning",
          "PLANNING",
          "PLANNING_LATE_EARLY",
          "Ungünstige Folge Spät zu Früh",
          "Die gesetzliche Ruhezeit ist eingehalten; die kurze Vorwärtsrotation sollte dennoch geprüft werden.",
          [current.shift, next.shift],
        ),
      );
    }
  }
  return issues;
}

function consecutiveDateStreaks(shifts: readonly ShiftEntry[]): ShiftEntry[][] {
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

function checkPlanningSeries(intervals: readonly Interval[]): ComplianceIssue[] {
  const shifts = intervals.map((item) => item.shift);
  const issues: ComplianceIssue[] = [];
  for (const streak of consecutiveDateStreaks(shifts)) {
    if (streak.length >= 7) {
      issues.push(
        issue(
          "warning",
          "PLANNING",
          "PLANNING_7_DAYS",
          "Sieben oder mehr Arbeitstage in Folge",
          `${streak.length} aufeinanderfolgende Arbeitstage wurden erkannt.`,
          streak,
        ),
      );
    }
  }

  for (const streak of consecutiveDateStreaks(shifts.filter((shift) => shift.type === "NIGHT"))) {
    if (streak.length >= 5) {
      issues.push(
        issue(
          "warning",
          "PLANNING",
          "PLANNING_NIGHT_SERIES",
          "Fünf oder mehr Nachtdienste in Folge",
          `${streak.length} aufeinanderfolgende Nachtdienste wurden erkannt.`,
          streak,
        ),
      );
    }
  }

  const weekends = new Map<string, ShiftEntry>();
  for (const shift of shifts) {
    const date = Temporal.PlainDate.from(shift.date);
    if (date.dayOfWeek === 6) weekends.set(date.toString(), shift);
    if (date.dayOfWeek === 7) weekends.set(date.subtract({ days: 1 }).toString(), shift);
  }
  const keys = [...weekends.keys()].sort();
  for (let index = 0; index < keys.length - 1; index++) {
    if (
      Temporal.PlainDate.from(keys[index + 1]).since(Temporal.PlainDate.from(keys[index])).days ===
      7
    ) {
      issues.push(
        issue(
          "warning",
          "PLANNING",
          "PLANNING_WEEKENDS",
          "Zwei Wochenenden in Folge gearbeitet",
          "Prüfen, ob nach der Dienstplanregel jedes zweite Wochenende frei sein sollte.",
          [weekends.get(keys[index])!, weekends.get(keys[index + 1])!],
        ),
      );
    }
  }
  return issues;
}

export function* calculateMonthlyComplianceSteps(
  month: string,
  shifts: readonly ShiftEntry[],
  timeZone: string,
  options: ComplianceOptions = {},
): Generator<number, MonthlyComplianceResult, void> {
  const referenceDate = Temporal.PlainDate.from(
    options.referenceDate ?? Temporal.Now.plainDateISO(timeZone).toString(),
  );
  const first = Temporal.PlainDate.from(`${month}-01`);
  const start = first.subtract({ days: 8 }).toString();
  const end = first.add({ months: 1 }).subtract({ days: 1 }).add({ days: 28 }).toString();
  const preparation = prepareComplianceIntervalsIncrementally(shifts, timeZone);
  while (true) {
    const step = preparation.next();
    if (step.done) break;
    yield step.value;
  }
  const intervals = shifts
    .filter((shift) => isRelevant(shift) && shift.date >= start && shift.date <= end)
    .map((shift) => toInterval(shift, timeZone))
    .sort((left, right) => Temporal.ZonedDateTime.compare(left.start, right.start));
  yield 1;
  const issues: ComplianceIssue[] = [];
  issues.push(...checkDuplicates(intervals));
  yield 2;
  issues.push(...checkOverlaps(intervals));
  yield 3;
  issues.push(...checkWorkingTime(intervals));
  yield 4;
  issues.push(...checkNightWorkingTimeAverage(month, intervals, shifts, options, referenceDate));
  yield 5;
  issues.push(...checkRestAndSequence(intervals, referenceDate));
  yield 6;
  issues.push(...checkPlanningSeries(intervals));
  const monthIssues = issues.filter((item) => item.date.startsWith(`${month}-`));
  return {
    month,
    issues: monthIssues,
    criticalCount: monthIssues.filter((item) => item.severity === "critical").length,
    warningCount: monthIssues.filter((item) => item.severity === "warning").length,
    infoCount: monthIssues.filter((item) => item.severity === "info").length,
    affectedDates: [...new Set(monthIssues.map((item) => item.date))].sort(),
  };
}

export function calculateMonthlyCompliance(
  month: string,
  shifts: readonly ShiftEntry[],
  timeZone: string,
  options: ComplianceOptions = {},
): MonthlyComplianceResult {
  const steps = calculateMonthlyComplianceSteps(month, shifts, timeZone, options);
  while (true) {
    const step = steps.next();
    if (step.done) return step.value;
  }
}
