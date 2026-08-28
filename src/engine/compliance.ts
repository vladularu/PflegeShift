import { Temporal } from "@js-temporal/polyfill";

import type {
  ComplianceIssue,
  ComplianceKind,
  ComplianceSeverity,
  FederalState,
  MonthlyComplianceResult,
  ShiftEntry,
} from "@/domain/types";
import {
  compensatedShortRestIndexes,
  consecutiveDateStreaks,
  restPeriods,
  type ComplianceInterval as Interval,
} from "@/engine/compliance-sequences";
import { getPublicHolidays } from "@/engine/holidays";
import { calculateTimedShiftMinutes } from "@/engine/working-time";
import type { RuleLegalRules } from "@/rules/contracts.generated";
import { getLegalCalculationWindow } from "@/rules/calculation-windows";
import {
  bundledRuleResolver,
  requireResolvedPackage,
  type RuleResolver,
} from "@/rules/rule-resolver";

const RELEVANT_TYPES = new Set(["EARLY", "LATE", "NIGHT", "DAY", "TRAINING", "CUSTOM"]);

interface CachedInterval {
  readonly signature: string;
  readonly value: Interval;
}

const INTERVAL_CACHE = new WeakMap<ShiftEntry, Map<string, CachedInterval>>();

export interface ComplianceOptions {
  readonly federalState?: FederalState;
  readonly referenceDate?: string;
  readonly weeklyMinutes?: number;
  readonly ruleResolver?: RuleResolver;
  readonly sectorId?: string;
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

function germanQuantity(value: number, capitalize = false): string {
  const words: Readonly<Record<number, string>> = {
    5: "fünf",
    6: "sechs",
    7: "sieben",
  };
  const valueLabel = words[value] ?? String(value);
  return capitalize ? `${valueLabel.charAt(0).toUpperCase()}${valueLabel.slice(1)}` : valueLabel;
}

function dateLabel(date: Temporal.PlainDate): string {
  return `${String(date.day).padStart(2, "0")}.${String(date.month).padStart(2, "0")}.${date.year}`;
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
  return total;
}

function compareThreshold(
  value: number,
  comparator: "GT" | "GTE" | "EQ",
  threshold: number,
): boolean {
  if (comparator === "GT") return value > threshold;
  if (comparator === "GTE") return value >= threshold;
  return value === threshold;
}

function isNightWork(item: Interval, rules: RuleLegalRules): boolean {
  return compareThreshold(
    nightWorkMinutes(item, rules),
    rules.nightWork.qualification.comparator,
    rules.nightWork.qualification.thresholdMinutes,
  );
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

function interruptionMinutes(items: readonly Interval[], minimumSegmentMinutes: number): number {
  let total = 0;
  let latestEnd = items[0]?.end;
  for (const item of items.slice(1)) {
    if (!latestEnd) break;
    const gap = minutesBetween(latestEnd, item.start);
    if (gap >= minimumSegmentMinutes) total += gap;
    if (Temporal.ZonedDateTime.compare(item.end, latestEnd) > 0) latestEnd = item.end;
  }
  return total;
}

function hasContinuousWorkOverBreakThreshold(
  items: readonly Interval[],
  rules: RuleLegalRules,
): boolean {
  const firstBreakThreshold = continuousWorkThreshold(rules);
  let blockStart: Temporal.ZonedDateTime | null = null;
  let blockEnd: Temporal.ZonedDateTime | null = null;
  for (const item of items) {
    if (item.shift.breakMinutes > 0) {
      blockStart = null;
      blockEnd = null;
      continue;
    }
    if (
      !blockStart ||
      !blockEnd ||
      minutesBetween(blockEnd, item.start) >= rules.breaks.minimumSegmentMinutes
    ) {
      blockStart = item.start;
      blockEnd = item.end;
    } else if (Temporal.ZonedDateTime.compare(item.end, blockEnd) > 0) {
      blockEnd = item.end;
    }
    if (blockStart && blockEnd && minutesBetween(blockStart, blockEnd) > firstBreakThreshold)
      return true;
  }
  return false;
}

function continuousWorkThreshold(rules: RuleLegalRules): number {
  return Math.min(...rules.breaks.tiers.map((tier) => tier.overMinutes));
}

function requiredBreakMinutes(netMinutes: number, rules: RuleLegalRules): number {
  return rules.breaks.tiers.reduce(
    (required, tier) =>
      netMinutes > tier.overMinutes ? Math.max(required, tier.requiredMinutes) : required,
    0,
  );
}

function checkWorkingTime(
  intervals: readonly Interval[],
  rules: RuleLegalRules,
): ComplianceIssue[] {
  const issues: ComplianceIssue[] = [];
  for (const items of workGroupsByRecordedDate(intervals)) {
    const shifts = items.map((item) => item.shift);
    const date = shifts.at(-1)!.date;
    const net = items.reduce((sum, item) => sum + item.netMinutes, 0);
    const containsNightWork = items.some((item) => isNightWork(item, rules));
    const recordedBreak = shifts.reduce((sum, shift) => sum + shift.breakMinutes, 0);
    const interruptions = interruptionMinutes(items, rules.breaks.minimumSegmentMinutes);

    if (net > rules.workingTime.maxDailyMinutes) {
      issues.push(
        issue(
          "critical",
          "LEGAL",
          "ARBZG_3_MAX_10H",
          "Tagesarbeitszeit über 10 Stunden",
          `${hours(net)} Nettoarbeitszeit überschreiten die ${rules.workingTime.maxDailyMinutes / 60}-Stunden-Grenze.`,
          shifts,
          date,
        ),
      );
    } else if (net > rules.workingTime.standardDailyMinutes && !containsNightWork) {
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

    const requiredBreak = requiredBreakMinutes(net, rules);
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
    if (hasContinuousWorkOverBreakThreshold(items, rules)) {
      const thresholdHours = continuousWorkThreshold(rules) / 60;
      const thresholdLabel = germanQuantity(thresholdHours);
      issues.push(
        issue(
          "critical",
          "LEGAL",
          "ARBZG_4_CONTINUOUS",
          `Mehr als ${thresholdLabel} Stunden ohne dokumentierte Pause`,
          `Ein zusammenhängender Arbeitsblock überschreitet ${thresholdLabel} Stunden ohne dokumentierte Ruhepause.`,
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
      if (item.grossMinutes > rules.workingTime.grossPlanningWarningMinutes) {
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
  ruleResolver: RuleResolver,
): ReadonlySet<string> {
  if (!federalState) return new Set();
  const year = Number(month.slice(0, 4));
  return new Set(
    getPublicHolidays(year, federalState, ruleResolver).map((holiday) => holiday.date),
  );
}

function statutoryWorkdaysInMonth(
  month: string,
  holidays: ReadonlySet<string>,
  workWeekLastDay: number,
): number {
  const first = Temporal.PlainDate.from(`${month}-01`);
  const end = first.add({ months: 1 });
  let count = 0;
  for (let date = first; Temporal.PlainDate.compare(date, end) < 0; date = date.add({ days: 1 })) {
    if (date.dayOfWeek <= workWeekLastDay && !holidays.has(date.toString())) count += 1;
  }
  return count;
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
    )
      continue;
    const date = Temporal.PlainDate.from(shift.date);
    if (date.dayOfWeek <= absenceWorkdaysPerWeek && !holidays.has(shift.date)) {
      creditedDates.add(shift.date);
    }
  }
  return creditedDates.size * dailyMinutes;
}

function checkNightWorkingTimeAverage(
  month: string,
  intervals: readonly Interval[],
  shifts: readonly ShiftEntry[],
  options: ComplianceOptions,
  referenceDate: Temporal.PlainDate,
  rules: RuleLegalRules,
  ruleResolver: RuleResolver,
): ComplianceIssue[] {
  const monthIntervals = intervals.filter((item) => item.shift.date.startsWith(`${month}-`));
  const extendedNightGroups = workGroupsByRecordedDate(monthIntervals).filter(
    (items) =>
      items.some((item) => isNightWork(item, rules)) &&
      items.reduce((sum, item) => sum + item.netMinutes, 0) > rules.workingTime.nightAverageMinutes,
  );
  if (extendedNightGroups.length === 0) return [];

  const holidays = publicHolidayDatesForMonth(month, options.federalState, ruleResolver);
  const workdayCount = statutoryWorkdaysInMonth(month, holidays, rules.workingTime.workWeekLastDay);
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

  const monthEnd = Temporal.PlainDate.from(`${month}-01`).add({ months: 1 }).subtract({ days: 1 });
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
      "LEGAL",
      "ARBZG_6_NIGHT_AVERAGE",
      overdue ? "Ausgleich der Nachtarbeitszeit fehlt" : "Ausgleich der Nachtarbeitszeit offen",
      `Der eingetragene Durchschnitt beträgt ${durationLabel(averageMinutes)} je Werktag bei ${workdayCount} Werktagen. Für Nachtarbeit sind innerhalb ${averageWindow} durchschnittlich höchstens ${durationLabel(rules.workingTime.nightAverageMinutes)} zulässig.`,
      related,
    ),
  ];
}

function checkRestAndSequence(
  intervals: readonly Interval[],
  referenceDate: Temporal.PlainDate,
  rules: RuleLegalRules,
  sectorId: string,
): ComplianceIssue[] {
  const issues: ComplianceIssue[] = [];
  const periods = restPeriods(intervals);
  const deviation =
    rules.restPeriod.deviations.find((candidate) => candidate.sectorIds.includes(sectorId)) ?? null;
  const minimumMinutes = deviation?.minimumMinutes ?? rules.restPeriod.defaultMinutes;
  const compensated = compensatedShortRestIndexes(
    periods,
    deviation,
    rules.restPeriod.defaultMinutes,
  );
  for (let index = 0; index < periods.length; index += 1) {
    const { current, next, minutes: rest } = periods[index];
    if (rest < 0) continue;
    if (rest < minimumMinutes) {
      issues.push(
        issue(
          "critical",
          "LEGAL",
          "ARBZG_5_REST_10H",
          `Ruhezeit unter ${minimumMinutes / 60} Stunden`,
          `Zwischen den Diensten liegen nur ${hours(rest)} Ruhezeit. Damit wird auch die für Krankenhäuser und Pflegeeinrichtungen mögliche Verkürzung auf ${minimumMinutes / 60} Stunden unterschritten.`,
          [current.shift, next.shift],
        ),
      );
    } else if (
      deviation !== null &&
      rest < rules.restPeriod.defaultMinutes &&
      !compensated.has(index)
    ) {
      const deadline = next.start.toPlainDate().add({ days: deviation.compensationWithinDays });
      const overdue = Temporal.PlainDate.compare(referenceDate, deadline) > 0;
      issues.push(
        issue(
          overdue ? "critical" : "warning",
          "LEGAL",
          "ARBZG_5_REST_11H",
          overdue
            ? "Ausgleich für verkürzte Ruhezeit fehlt"
            : "Ausgleich für verkürzte Ruhezeit offen",
          `Die Ruhezeit beträgt ${hours(rest)}. In den eingetragenen Diensten wurde bis ${dateLabel(deadline)} keine noch unbenutzte Ruhezeit von mindestens ${deviation.compensationMinutes / 60} Stunden als Ausgleich erkannt.`,
          [current.shift, next.shift],
        ),
      );
    } else if (
      rest >= rules.restPeriod.defaultMinutes &&
      current.shift.type === "LATE" &&
      next.shift.type === "EARLY" &&
      Temporal.PlainDate.from(next.shift.date).since(Temporal.PlainDate.from(current.shift.date))
        .days === rules.planning.lateEarlyDayGap
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

function checkPlanningSeries(
  intervals: readonly Interval[],
  rules: RuleLegalRules,
): ComplianceIssue[] {
  const shifts = intervals.map((item) => item.shift);
  const issues: ComplianceIssue[] = [];
  for (const streak of consecutiveDateStreaks(shifts)) {
    if (streak.length >= rules.planning.consecutiveWorkDaysWarning) {
      issues.push(
        issue(
          "warning",
          "PLANNING",
          "PLANNING_7_DAYS",
          `${germanQuantity(rules.planning.consecutiveWorkDaysWarning, true)} oder mehr Arbeitstage in Folge`,
          `${streak.length} aufeinanderfolgende Arbeitstage wurden erkannt.`,
          streak,
        ),
      );
    }
  }

  const nightShifts = intervals
    .filter((item) => isNightWork(item, rules))
    .map((item) => item.shift);
  for (const streak of consecutiveDateStreaks(nightShifts)) {
    if (streak.length >= rules.planning.consecutiveNightShiftsWarning) {
      issues.push(
        issue(
          "warning",
          "PLANNING",
          "PLANNING_NIGHT_SERIES",
          `${germanQuantity(rules.planning.consecutiveNightShiftsWarning, true)} oder mehr Nachtdienste in Folge`,
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
      rules.planning.consecutiveWeekendGapDays
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
  const ruleResolver = options.ruleResolver ?? bundledRuleResolver;
  const referenceDate = Temporal.PlainDate.from(
    options.referenceDate ?? Temporal.Now.plainDateISO(timeZone).toString(),
  );
  const first = Temporal.PlainDate.from(`${month}-01`);
  const rules = requireResolvedPackage(ruleResolver.resolveLegal(first.toString())).rules;
  const calculationWindow = getLegalCalculationWindow(first.toString(), ruleResolver);
  const start = first.subtract({ days: calculationWindow.lookbackDays }).toString();
  const end = first
    .add({ months: 1 })
    .subtract({ days: 1 })
    .add({ days: calculationWindow.lookaheadDays })
    .toString();
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
  issues.push(...checkWorkingTime(intervals, rules));
  yield 4;
  issues.push(
    ...checkNightWorkingTimeAverage(
      month,
      intervals,
      shifts,
      options,
      referenceDate,
      rules,
      ruleResolver,
    ),
  );
  yield 5;
  issues.push(...checkRestAndSequence(intervals, referenceDate, rules, options.sectorId ?? "care"));
  yield 6;
  issues.push(...checkPlanningSeries(intervals, rules));
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
