import { Temporal } from "@js-temporal/polyfill";

import type { ComplianceIssue, ComplianceSeverity, FederalState, ShiftEntry } from "@/domain/types";
import type { ComplianceInterval as Interval } from "@/engine/compliance-sequences";
import { getPublicHolidays } from "@/engine/holidays";
import type { RuleLegalRules } from "@/rules/contracts.generated";
import { RuleResolutionError, type RuleResolver } from "@/rules/rule-resolver";

interface SundayHolidayRestOptions {
  readonly federalState?: FederalState;
  readonly sectorId?: string;
}

interface RestObligation {
  readonly kind: "SUNDAY" | "WEEKDAY_HOLIDAY";
  readonly date: Temporal.PlainDate;
  readonly windowStart: Temporal.PlainDate;
  readonly windowEnd: Temporal.PlainDate;
  readonly related: readonly ShiftEntry[];
}

interface ReplacementCandidate {
  readonly date: Temporal.PlainDate;
  readonly evidence: ShiftEntry;
  readonly observedRestMinutes: null | number;
}

interface ObligationMatch {
  readonly obligation: RestObligation;
  readonly candidate: ReplacementCandidate;
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
  date: string,
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

function dateLabel(date: Temporal.PlainDate): string {
  return `${String(date.day).padStart(2, "0")}.${String(date.month).padStart(2, "0")}.${date.year}`;
}

function dayStart(date: Temporal.PlainDate, timeZone: string): Temporal.ZonedDateTime {
  return Temporal.ZonedDateTime.from(
    {
      timeZone,
      year: date.year,
      month: date.month,
      day: date.day,
      hour: 0,
      minute: 0,
    },
    { disambiguation: "earlier" },
  );
}

function minutesBetween(left: Temporal.ZonedDateTime, right: Temporal.ZonedDateTime): number {
  return Math.round(Number(right.epochMilliseconds - left.epochMilliseconds) / 60_000);
}

function* workByCalendarDateIncrementally(
  intervals: readonly Interval[],
  timeZone: string,
): Generator<number, ReadonlyMap<string, readonly Interval[]>, void> {
  const result = new Map<string, Interval[]>();
  let processed = 0;
  for (const interval of intervals) {
    for (let date = interval.start.toPlainDate(); ; date = date.add({ days: 1 })) {
      const start = dayStart(date, timeZone);
      if (Temporal.ZonedDateTime.compare(start, interval.end) >= 0) break;
      const end = dayStart(date.add({ days: 1 }), timeZone);
      if (
        Temporal.ZonedDateTime.compare(interval.start, end) < 0 &&
        Temporal.ZonedDateTime.compare(interval.end, start) > 0
      ) {
        const entries = result.get(date.toString()) ?? [];
        entries.push(interval);
        result.set(date.toString(), entries);
      }
    }
    processed += 1;
    if (processed % 24 === 0) yield processed;
  }
  return result;
}

function* knownHolidayDatesIncrementally(
  years: ReadonlySet<number>,
  federalState: FederalState,
  ruleResolver: RuleResolver,
): Generator<number, ReadonlySet<string> | null, void> {
  const dates = new Set<string>();
  let processed = 0;
  for (const year of years) {
    try {
      for (const holiday of getPublicHolidays(year, federalState, ruleResolver)) {
        dates.add(holiday.date);
      }
    } catch (error) {
      if (!(error instanceof RuleResolutionError)) throw error;
      return null;
    }
    processed += 1;
    yield processed;
  }
  return dates;
}

function replacementCandidate(
  date: Temporal.PlainDate,
  evidence: ShiftEntry,
  intervals: readonly Interval[],
  workDates: ReadonlyMap<string, readonly Interval[]>,
  holidayDates: ReadonlySet<string>,
  timeZone: string,
): ReplacementCandidate | null {
  const value = date.toString();
  if (date.dayOfWeek === 7 || holidayDates.has(value) || workDates.has(value)) return null;

  const start = dayStart(date, timeZone);
  const end = dayStart(date.add({ days: 1 }), timeZone);
  let previousEnd: Temporal.ZonedDateTime | null = null;
  let nextStart: Temporal.ZonedDateTime | null = null;
  for (const interval of intervals) {
    if (Temporal.ZonedDateTime.compare(interval.end, start) <= 0) {
      if (previousEnd === null || Temporal.ZonedDateTime.compare(interval.end, previousEnd) > 0) {
        previousEnd = interval.end;
      }
      continue;
    }
    if (Temporal.ZonedDateTime.compare(interval.start, end) >= 0) {
      nextStart = interval.start;
      break;
    }
  }

  return {
    date,
    evidence,
    observedRestMinutes:
      previousEnd === null || nextStart === null ? null : minutesBetween(previousEnd, nextStart),
  };
}

function replacementObligations(
  workDates: ReadonlyMap<string, readonly Interval[]>,
  holidayDates: ReadonlySet<string>,
  sundayPeriodDays: number,
  holidayPeriodDays: number,
): readonly RestObligation[] {
  const obligations: RestObligation[] = [];
  for (const [dateValue, work] of workDates) {
    const date = Temporal.PlainDate.from(dateValue);
    const isSunday = date.dayOfWeek === 7;
    const isWeekdayHoliday = !isSunday && holidayDates.has(dateValue);
    if (!isSunday && !isWeekdayHoliday) continue;
    const periodDays = isSunday ? sundayPeriodDays : holidayPeriodDays;
    const reachDays = periodDays - 1;
    obligations.push({
      kind: isSunday ? "SUNDAY" : "WEEKDAY_HOLIDAY",
      date,
      windowStart: date.subtract({ days: reachDays }),
      windowEnd: date.add({ days: reachDays }),
      related: work.map((item) => item.shift),
    });
  }
  return obligations.sort(
    (left, right) =>
      Temporal.PlainDate.compare(left.windowEnd, right.windowEnd) ||
      Temporal.PlainDate.compare(left.date, right.date) ||
      left.kind.localeCompare(right.kind),
  );
}

function matchObligations(
  obligations: readonly RestObligation[],
  candidates: readonly ReplacementCandidate[],
): { readonly unmatched: readonly RestObligation[]; readonly matched: readonly ObligationMatch[] } {
  const unmatched = new Set(obligations);
  const matched: ObligationMatch[] = [];
  for (const candidate of candidates) {
    const match = obligations.find(
      (obligation) =>
        unmatched.has(obligation) &&
        Temporal.PlainDate.compare(candidate.date, obligation.windowStart) >= 0 &&
        Temporal.PlainDate.compare(candidate.date, obligation.windowEnd) <= 0,
    );
    if (match) {
      unmatched.delete(match);
      matched.push({ obligation: match, candidate });
    }
  }
  return {
    unmatched: obligations.filter((obligation) => unmatched.has(obligation)),
    matched,
  };
}

function freeSundayIssues(
  year: number,
  workDates: ReadonlyMap<string, readonly Interval[]>,
  referenceDate: Temporal.PlainDate,
  minimumFreeSundays: number,
): readonly ComplianceIssue[] {
  const workedSundays: { date: Temporal.PlainDate; related: readonly ShiftEntry[] }[] = [];
  let sundayCount = 0;
  for (
    let date = Temporal.PlainDate.from({ year, month: 1, day: 1 });
    date.year === year;
    date = date.add({ days: 1 })
  ) {
    if (date.dayOfWeek !== 7) continue;
    sundayCount += 1;
    const work = workDates.get(date.toString());
    if (work) workedSundays.push({ date, related: work.map((item) => item.shift) });
  }

  const permittedWorkedSundays = Math.max(0, sundayCount - minimumFreeSundays);
  return workedSundays.slice(permittedWorkedSundays).map(({ date, related }) => {
    const completed = Temporal.PlainDate.compare(date, referenceDate) <= 0;
    return issue(
      completed ? "critical" : "warning",
      "ARBZG_11_FREE_SUNDAYS",
      completed
        ? "Zu wenige beschäftigungsfreie Sonntage"
        : "Mindestzahl freier Sonntage gefährdet",
      `Mit diesem Dienst bleiben im Kalenderjahr ${year} weniger als ${minimumFreeSundays} Sonntage beschäftigungsfrei.`,
      related,
      date.toString(),
    );
  });
}

export function* checkSundayHolidayRestIncrementally(
  month: string,
  intervals: readonly Interval[],
  shifts: readonly ShiftEntry[],
  options: SundayHolidayRestOptions,
  referenceDate: Temporal.PlainDate,
  rules: RuleLegalRules,
  ruleResolver: RuleResolver,
  engineContractVersion: number,
  timeZone: string,
): Generator<number, readonly ComplianceIssue[], void> {
  const restRules = rules.sundayHolidayRest;
  const sectorId = options.sectorId ?? "care";
  if (
    engineContractVersion < 5 ||
    restRules === undefined ||
    options.federalState === undefined ||
    !restRules.eligibleSectorIds.includes(sectorId)
  ) {
    return [];
  }

  const workDateSteps = workByCalendarDateIncrementally(intervals, timeZone);
  let workDates: ReadonlyMap<string, readonly Interval[]>;
  while (true) {
    const step = workDateSteps.next();
    if (step.done) {
      workDates = step.value;
      break;
    }
    yield step.value;
  }
  const years = new Set<number>([Number(month.slice(0, 4))]);
  for (const date of workDates.keys()) years.add(Number(date.slice(0, 4)));
  for (const shift of shifts) years.add(Number(shift.date.slice(0, 4)));
  const holidaySteps = knownHolidayDatesIncrementally(years, options.federalState, ruleResolver);
  let holidayDates: ReadonlySet<string> | null;
  while (true) {
    const step = holidaySteps.next();
    if (step.done) {
      holidayDates = step.value;
      break;
    }
    yield step.value;
  }
  if (holidayDates === null) return [];
  const requiredRestMinutes = restRules.replacementDayMinutes + restRules.connectedRestMinutes;
  const evidenceByDate = new Map<string, ShiftEntry>();
  for (const shift of shifts) {
    if (
      shift.deletedAt === null &&
      shift.type === restRules.evidenceShiftType &&
      shift.startTime === null &&
      shift.endTime === null &&
      !evidenceByDate.has(shift.date)
    ) {
      evidenceByDate.set(shift.date, shift);
    }
  }
  const candidates: ReplacementCandidate[] = [];
  let processedCandidates = 0;
  for (const [date, evidence] of [...evidenceByDate.entries()].sort(([left], [right]) =>
    left.localeCompare(right),
  )) {
    const candidate = replacementCandidate(
      Temporal.PlainDate.from(date),
      evidence,
      intervals,
      workDates,
      holidayDates,
      timeZone,
    );
    if (candidate !== null) candidates.push(candidate);
    processedCandidates += 1;
    if (processedCandidates % 8 === 0) yield processedCandidates;
  }
  const obligations = replacementObligations(
    workDates,
    holidayDates,
    restRules.sundayCompensationPeriodDays,
    restRules.weekdayHolidayCompensationPeriodDays,
  );
  const matches = matchObligations(obligations, candidates);
  const issues = matches.unmatched.map((obligation) => {
    const overdue = Temporal.PlainDate.compare(referenceDate, obligation.windowEnd) > 0;
    const sunday = obligation.kind === "SUNDAY";
    const periodLabel = sunday
      ? `${restRules.sundayCompensationPeriodDays} Tagen`
      : `${restRules.weekdayHolidayCompensationPeriodDays} Tagen`;
    return issue(
      overdue ? "critical" : "warning",
      sunday ? "ARBZG_11_SUNDAY_REST" : "ARBZG_11_HOLIDAY_REST",
      overdue
        ? sunday
          ? "Ersatzruhetag für Sonntagsarbeit fehlt"
          : "Ersatzruhetag für Feiertagsarbeit fehlt"
        : sunday
          ? "Ersatzruhetag für Sonntagsarbeit offen"
          : "Ersatzruhetag für Feiertagsarbeit offen",
      `Für die Beschäftigung am ${dateLabel(obligation.date)} ist innerhalb eines den Beschäftigungstag einschließenden Zeitraums von ${periodLabel} ein eigener als „Frei“ dokumentierter, arbeitsfreier Ersatzruhetag erforderlich. Der mögliche Zuordnungsbereich reicht vom ${dateLabel(obligation.windowStart)} bis ${dateLabel(obligation.windowEnd)}.`,
      obligation.related,
      obligation.date.toString(),
    );
  });

  for (const match of matches.matched) {
    if (
      match.candidate.observedRestMinutes === null ||
      match.candidate.observedRestMinutes >= requiredRestMinutes
    ) {
      continue;
    }
    issues.push(
      issue(
        "warning",
        "ARBZG_11_REST_CONNECTION",
        "Verbindung des Ersatzruhetags prüfen",
        `Der Ersatzruhetag am ${dateLabel(match.candidate.date)} ist mit ${match.candidate.observedRestMinutes / 60} Stunden erfasster zusammenhängender Ruhe kürzer als die regulären ${requiredRestMinutes / 60} Stunden aus Ersatzruhetag und §-5-Ruhezeit. Prüfen, ob technische oder arbeitsorganisatorische Gründe nach § 11 Abs. 4 ArbZG entgegenstehen.`,
        [...match.obligation.related, match.candidate.evidence],
        match.obligation.date.toString(),
      ),
    );
  }

  issues.push(
    ...freeSundayIssues(
      Number(month.slice(0, 4)),
      workDates,
      referenceDate,
      restRules.minimumFreeSundaysPerCalendarYear,
    ),
  );
  return issues;
}
