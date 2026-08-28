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
import {
  checkNightWorkingTimeAverage,
  isNightWork,
  qualifyAsNightWorkerIncrementally,
} from "@/engine/compliance-night-work";
import { checkWorkingTimeAverageIncrementally } from "@/engine/compliance-working-time-average";
import { checkSundayHolidayRestIncrementally } from "@/engine/compliance-sunday-holiday-rest";
import { calculateTimedShiftMinutes } from "@/engine/working-time";
import type { RuleLegalRules } from "@/rules/contracts.generated";
import { getLegalCalculationEnd, getLegalCalculationWindow } from "@/rules/calculation-windows";
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
  readonly regularRotatingNightWork?: boolean;
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

function compareIntervalsByRecordedStart(left: Interval, right: Interval): number {
  return (
    left.shift.date.localeCompare(right.shift.date) ||
    (left.shift.startTime ?? "").localeCompare(right.shift.startTime ?? "") ||
    left.shift.id.localeCompare(right.shift.id)
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
  engineContractVersion: number,
  nightWorkerQualified: boolean,
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
    } else if (
      engineContractVersion < 4 &&
      net > rules.workingTime.standardDailyMinutes &&
      !(containsNightWork && nightWorkerQualified)
    ) {
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
  const legalPackage = requireResolvedPackage(ruleResolver.resolveLegal(first.toString()));
  const rules = legalPackage.rules;
  const calculationWindow = getLegalCalculationWindow(first.toString(), ruleResolver);
  const baseStart = first.subtract({ days: calculationWindow.lookbackDays });
  const monthEnd = first.add({ months: 1 }).subtract({ days: 1 });
  const shortAssessmentStart = first.subtract({
    days: calculationWindow.shortAssessmentLookbackDays,
  });
  const shortAssessmentEnd = monthEnd.add({
    days: calculationWindow.shortAssessmentLookaheadDays,
  });
  const baseEnd = getLegalCalculationEnd(monthEnd, calculationWindow);
  const yearStart = Temporal.PlainDate.from({ year: first.year, month: 1, day: 1 });
  const yearEnd = Temporal.PlainDate.from({ year: first.year, month: 12, day: 31 });
  const start = (
    calculationWindow.calendarYearCoverage && Temporal.PlainDate.compare(yearStart, baseStart) < 0
      ? yearStart
      : baseStart
  ).toString();
  const end = (
    calculationWindow.calendarYearCoverage && Temporal.PlainDate.compare(yearEnd, baseEnd) > 0
      ? yearEnd
      : baseEnd
  ).toString();
  const preparation = prepareComplianceIntervalsIncrementally(shifts, timeZone);
  while (true) {
    const step = preparation.next();
    if (step.done) break;
    yield step.value;
  }
  const intervals = shifts
    .filter((shift) => isRelevant(shift) && shift.date >= start && shift.date <= end)
    .map((shift) => toInterval(shift, timeZone))
    .sort(compareIntervalsByRecordedStart);
  const assessmentStart = shortAssessmentStart.toString();
  const assessmentEnd = shortAssessmentEnd.toString();
  const assessmentIntervals = intervals.filter(
    (item) => item.shift.date >= assessmentStart && item.shift.date <= assessmentEnd,
  );
  const workingTimeAverageIntervals = intervals.filter(
    (item) => item.shift.date >= first.toString() && item.shift.date <= baseEnd.toString(),
  );
  const calculationShifts = shifts.filter(
    (shift) => shift.deletedAt === null && shift.date >= start && shift.date <= end,
  );
  const nightWorkerQualification = qualifyAsNightWorkerIncrementally(
    intervals,
    rules,
    legalPackage.engineContractVersion,
    first.year,
    options,
  );
  let nightWorkerQualified = false;
  while (true) {
    const step = nightWorkerQualification.next();
    if (step.done) {
      nightWorkerQualified = step.value;
      break;
    }
    yield step.value;
  }
  yield 1;
  const issues: ComplianceIssue[] = [];
  issues.push(...checkDuplicates(assessmentIntervals));
  yield 2;
  issues.push(...checkOverlaps(assessmentIntervals));
  yield 3;
  issues.push(
    ...checkWorkingTime(
      assessmentIntervals,
      rules,
      legalPackage.engineContractVersion,
      nightWorkerQualified,
    ),
  );
  yield 4;
  const workingTimeAverage = checkWorkingTimeAverageIncrementally(
    month,
    workingTimeAverageIntervals,
    shifts,
    options,
    referenceDate,
    rules,
    ruleResolver,
    legalPackage.engineContractVersion,
    nightWorkerQualified,
  );
  while (true) {
    const step = workingTimeAverage.next();
    if (step.done) {
      issues.push(...step.value);
      break;
    }
    yield step.value;
  }
  issues.push(
    ...checkNightWorkingTimeAverage(
      month,
      assessmentIntervals,
      shifts,
      options,
      referenceDate,
      rules,
      ruleResolver,
      legalPackage.engineContractVersion,
      nightWorkerQualified,
    ),
  );
  yield 5;
  issues.push(
    ...checkRestAndSequence(assessmentIntervals, referenceDate, rules, options.sectorId ?? "care"),
  );
  yield 6;
  const sundayHolidayRest = checkSundayHolidayRestIncrementally(
    month,
    intervals,
    calculationShifts,
    options,
    referenceDate,
    rules,
    ruleResolver,
    legalPackage.engineContractVersion,
    timeZone,
  );
  while (true) {
    const step = sundayHolidayRest.next();
    if (step.done) {
      issues.push(...step.value);
      break;
    }
    yield step.value;
  }
  yield 7;
  issues.push(...checkPlanningSeries(assessmentIntervals, rules));
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
