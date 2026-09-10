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

interface SundayHolidayRestOptions {
  readonly federalState?: FederalState;
  readonly holidayRegion?: HolidayRegion;
  readonly sundayHolidayWorkEligible?: boolean | null;
  readonly sectorId?: string;
}

interface HolidayCoverage {
  readonly dates: ReadonlySet<string>;
  readonly missingYears: ReadonlySet<number>;
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
  readonly evidence: readonly ShiftEntry[];
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

// Calendar boundaries do not depend on shifts or rules. Share this expensive
// timezone conversion across all twelve monthly checks, including a cold report.
const dayStarts = new Map<string, Temporal.ZonedDateTime>();

function dayStart(date: Temporal.PlainDate, timeZone: string): Temporal.ZonedDateTime {
  const key = `${timeZone}:${date.toString()}`;
  const cached = dayStarts.get(key);
  if (cached) return cached;
  const value = Temporal.ZonedDateTime.from(
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
  if (dayStarts.size >= 2048) dayStarts.delete(dayStarts.keys().next().value!);
  dayStarts.set(key, value);
  return value;
}

const intervalCalendarDates = new WeakMap<
  Interval,
  {
    readonly start: Temporal.ZonedDateTime;
    readonly end: Temporal.ZonedDateTime;
    readonly timeZone: string;
    readonly dates: readonly string[];
  }
>();

function* workByCalendarDateIncrementally(
  intervals: readonly Interval[],
  timeZone: string,
): Generator<number, ReadonlyMap<string, readonly Interval[]>, void> {
  const result = new Map<string, Interval[]>();
  let processed = 0;
  for (const interval of intervals) {
    const cached = intervalCalendarDates.get(interval);
    let dates: readonly string[];
    if (
      cached?.start === interval.start &&
      cached.end === interval.end &&
      cached.timeZone === timeZone
    ) {
      dates = cached.dates;
    } else {
      const computed: string[] = [];
      const intervalStart = interval.start.epochMilliseconds;
      const intervalEnd = interval.end.epochMilliseconds;
      for (let date = interval.start.toPlainDate(); ; date = date.add({ days: 1 })) {
        const start = dayStart(date, timeZone).epochMilliseconds;
        if (start >= intervalEnd) break;
        const end = dayStart(date.add({ days: 1 }), timeZone).epochMilliseconds;
        if (intervalStart < end && intervalEnd > start) computed.push(date.toString());
      }
      dates = computed;
      intervalCalendarDates.set(interval, {
        start: interval.start,
        end: interval.end,
        timeZone,
        dates,
      });
    }
    for (const date of dates) {
      const entries = result.get(date) ?? [];
      entries.push(interval);
      result.set(date, entries);
    }
    processed += 1;
    if (processed % 24 === 0) yield processed;
  }
  return result;
}

function* knownHolidayDatesIncrementally(
  years: ReadonlySet<number>,
  federalState: FederalState,
  holidayRegion: HolidayRegion,
  ruleResolver: RuleResolver,
): Generator<number, HolidayCoverage, void> {
  const dates = new Set<string>();
  const missingYears = new Set<number>();
  let processed = 0;
  for (const year of years) {
    try {
      for (const holiday of getPublicHolidays(year, federalState, ruleResolver, holidayRegion)) {
        dates.add(holiday.date);
      }
    } catch (error) {
      if (!(error instanceof RuleResolutionError)) throw error;
      missingYears.add(year);
    }
    processed += 1;
    yield processed;
  }
  return { dates, missingYears };
}

function observedRestAroundCalendarDay(
  date: Temporal.PlainDate,
  intervals: readonly { readonly start: number; readonly end: number }[],
  timeZone: string,
): number | null {
  const start = dayStart(date, timeZone).epochMilliseconds;
  const end = dayStart(date.add({ days: 1 }), timeZone).epochMilliseconds;
  let previousEnd: number | null = null;
  let nextStart: number | null = null;
  for (const interval of intervals) {
    if (interval.end <= start) {
      if (previousEnd === null || interval.end > previousEnd) {
        previousEnd = interval.end;
      }
    } else if (nextStart === null && interval.start >= end) {
      nextStart = interval.start;
    }
  }
  return previousEnd === null || nextStart === null
    ? null
    : Math.round((nextStart - previousEnd) / 60_000);
}

function replacementCandidate(
  date: Temporal.PlainDate,
  entriesByDate: ReadonlyMap<string, readonly ShiftEntry[]>,
  intervals: readonly { readonly start: number; readonly end: number }[],
  workDates: ReadonlyMap<string, readonly Interval[]>,
  holidayDates: ReadonlySet<string>,
  evidenceShiftType: ShiftEntry["type"],
  timeZone: string,
): ReplacementCandidate | null {
  const value = date.toString();
  if (date.dayOfWeek === 7 || holidayDates.has(value) || workDates.has(value)) return null;
  const entries = entriesByDate.get(value) ?? [];
  if (
    entries.some(
      (entry) =>
        entry.type !== evidenceShiftType || entry.startTime !== null || entry.endTime !== null,
    )
  ) {
    return null;
  }

  const start = dayStart(date, timeZone).epochMilliseconds;
  const end = dayStart(date.add({ days: 1 }), timeZone).epochMilliseconds;
  let previousEnd: number | null = null;
  let nextStart: number | null = null;
  for (const interval of intervals) {
    if (interval.end <= start) {
      if (previousEnd === null || interval.end > previousEnd) {
        previousEnd = interval.end;
      }
      continue;
    }
    if (interval.start >= end) {
      nextStart = interval.start;
      break;
    }
  }

  return {
    date,
    evidence: entries,
    observedRestMinutes:
      previousEnd === null || nextStart === null
        ? null
        : Math.round((nextStart - previousEnd) / 60_000),
  };
}

function replacementCandidateDates(
  obligations: readonly RestObligation[],
  coverageStart: Temporal.PlainDate,
  coverageEnd: Temporal.PlainDate,
): readonly Temporal.PlainDate[] {
  const dates = new Map<string, Temporal.PlainDate>();
  for (const obligation of obligations) {
    let date =
      Temporal.PlainDate.compare(obligation.windowStart, coverageStart) < 0
        ? coverageStart
        : obligation.windowStart;
    const end =
      Temporal.PlainDate.compare(obligation.windowEnd, coverageEnd) > 0
        ? coverageEnd
        : obligation.windowEnd;
    for (; Temporal.PlainDate.compare(date, end) <= 0; date = date.add({ days: 1 })) {
      if (date.dayOfWeek !== 7) dates.set(date.toString(), date);
    }
  }
  return [...dates.values()].sort(Temporal.PlainDate.compare);
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
  requiredRestMinutes: number,
): { readonly unmatched: readonly RestObligation[]; readonly matched: readonly ObligationMatch[] } {
  const unmatched: RestObligation[] = [];
  const available = new Set(candidates);
  const matched: ObligationMatch[] = [];
  // Calendar-day distance, not elapsed hours: preserve matching across DST changes.
  const epoch = Temporal.PlainDate.from("1970-01-01");
  const ranked = candidates.map((candidate) => ({
    candidate,
    day: candidate.date.since(epoch).days,
    quality:
      candidate.observedRestMinutes === null
        ? 2
        : candidate.observedRestMinutes >= requiredRestMinutes
          ? 0
          : 1,
  }));
  for (const obligation of obligations) {
    const start = obligation.windowStart.since(epoch).days;
    const end = obligation.windowEnd.since(epoch).days;
    const day = obligation.date.since(epoch).days;
    let best: (typeof ranked)[number] | undefined;
    for (const item of ranked) {
      if (!available.has(item.candidate) || item.day < start || item.day > end) continue;
      if (
        best === undefined ||
        item.quality < best.quality ||
        (item.quality === best.quality &&
          (Math.abs(item.day - day) < Math.abs(best.day - day) ||
            (Math.abs(item.day - day) === Math.abs(best.day - day) && item.day < best.day)))
      )
        best = item;
    }
    const candidate = best?.candidate;
    if (candidate === undefined) {
      unmatched.push(obligation);
    } else {
      available.delete(candidate);
      matched.push({ obligation, candidate });
    }
  }
  return { unmatched, matched };
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
  coverageStartValue: string,
  coverageEndValue: string,
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
  const holidaySteps = knownHolidayDatesIncrementally(
    years,
    options.federalState,
    options.holidayRegion ?? "NONE",
    ruleResolver,
  );
  let holidayCoverage: HolidayCoverage;
  while (true) {
    const step = holidaySteps.next();
    if (step.done) {
      holidayCoverage = step.value;
      break;
    }
    yield step.value;
  }
  const holidayDates = holidayCoverage.dates;
  const requiredRestMinutes = restRules.replacementDayMinutes + restRules.connectedRestMinutes;
  const entriesByDate = new Map<string, ShiftEntry[]>();
  for (const shift of shifts) {
    if (shift.deletedAt !== null) continue;
    const entries = entriesByDate.get(shift.date) ?? [];
    entries.push(shift);
    entriesByDate.set(shift.date, entries);
  }
  const obligations = replacementObligations(
    workDates,
    holidayDates,
    restRules.sundayCompensationPeriodDays,
    restRules.weekdayHolidayCompensationPeriodDays,
  );
  const candidateDates = replacementCandidateDates(
    obligations,
    Temporal.PlainDate.from(coverageStartValue),
    Temporal.PlainDate.from(coverageEndValue),
  );
  const candidates: ReplacementCandidate[] = [];
  // Inputs are minute-precision instants; convert once, outside the candidate loop.
  // Day boundaries still use Temporal in the profile's time zone (including DST).
  const restIntervals = intervals.map((interval) => ({
    start: interval.start.epochMilliseconds,
    end: interval.end.epochMilliseconds,
  }));
  let processedCandidates = 0;
  for (const date of candidateDates) {
    const candidate = replacementCandidate(
      date,
      entriesByDate,
      restIntervals,
      workDates,
      holidayDates,
      restRules.evidenceShiftType,
      timeZone,
    );
    if (candidate !== null) candidates.push(candidate);
    processedCandidates += 1;
    if (processedCandidates % 8 === 0) yield processedCandidates;
  }
  const matches = matchObligations(obligations, candidates, requiredRestMinutes);
  const issues: ComplianceIssue[] = [];
  if (holidayCoverage.missingYears.size > 0) {
    issues.push(
      issue(
        "warning",
        "HOLIDAY_CATALOG_COVERAGE",
        "Feiertagskatalog unvollständig",
        `Für ${[...holidayCoverage.missingYears].sort().join(", ")} fehlt ein gültiges Feiertagspaket. Sonntage werden weiter geprüft; Feiertagsprüfungen sind unvollständig.`,
        obligations[0]?.related ?? [],
        `${month}-01`,
      ),
    );
  }
  if (obligations.length > 0 && options.sundayHolidayWorkEligible !== true) {
    const related = obligations[0]!.related;
    issues.push(
      issue(
        options.sundayHolidayWorkEligible === false ? "critical" : "warning",
        "ARBZG_10_ELIGIBILITY",
        options.sundayHolidayWorkEligible === false
          ? "Sonn- oder Feiertagsarbeit nicht als zulässig erfasst"
          : "Zulässigkeit der Sonn- oder Feiertagsarbeit offen",
        "Bitte prüfen und bestätigen, ob die erfasste Sonn- oder Feiertagsarbeit unter eine Ausnahme nach § 10 ArbZG oder eine andere wirksame Ausnahme fällt.",
        related,
        obligations[0]!.date.toString(),
      ),
    );
  }
  issues.push(
    ...matches.unmatched.map((obligation) => {
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
        `Für die Beschäftigung am ${dateLabel(obligation.date)} ist innerhalb eines den Beschäftigungstag einschließenden Zeitraums von ${periodLabel} ein arbeitsfreier Werktag als Ersatzruhetag erforderlich. Tage ohne Arbeitseintrag werden als arbeitsfrei gewertet. Der mögliche Zuordnungsbereich reicht vom ${dateLabel(obligation.windowStart)} bis ${dateLabel(obligation.windowEnd)}.`,
        obligation.related,
        obligation.date.toString(),
      );
    }),
  );

  for (const match of matches.matched) {
    if (
      match.candidate.observedRestMinutes !== null &&
      match.candidate.observedRestMinutes >= requiredRestMinutes
    ) {
      continue;
    }
    issues.push(
      issue(
        "warning",
        "ARBZG_11_REST_CONNECTION",
        "Verbindung des Ersatzruhetags prüfen",
        match.candidate.observedRestMinutes === null
          ? `Für den Ersatzruhetag am ${dateLabel(match.candidate.date)} reicht der geladene Zeitraum nicht aus, um die Verbindung mit der §-5-Ruhezeit nachzuweisen.`
          : `Der Ersatzruhetag am ${dateLabel(match.candidate.date)} ist mit ${match.candidate.observedRestMinutes / 60} Stunden erfasster zusammenhängender Ruhe kürzer als die regulären ${requiredRestMinutes / 60} Stunden aus Ersatzruhetag und §-5-Ruhezeit. Prüfen, ob technische oder arbeitsorganisatorische Gründe nach § 11 Abs. 4 ArbZG entgegenstehen.`,
        [...match.obligation.related, ...match.candidate.evidence],
        match.obligation.date.toString(),
      ),
    );
  }

  const monthStart = Temporal.PlainDate.from(`${month}-01`);
  const monthEnd = monthStart.add({ months: 1 }).subtract({ days: 1 });
  for (
    let date = monthStart;
    Temporal.PlainDate.compare(date, monthEnd) <= 0;
    date = date.add({ days: 1 })
  ) {
    const dateValue = date.toString();
    if (workDates.has(dateValue) || (date.dayOfWeek !== 7 && !holidayDates.has(dateValue))) {
      continue;
    }
    const observedRest = observedRestAroundCalendarDay(date, restIntervals, timeZone);
    if (observedRest !== null && observedRest < requiredRestMinutes) {
      issues.push(
        issue(
          "warning",
          "ARBZG_11_REST_CONNECTION",
          "Verbindung der Sonn- oder Feiertagsruhe prüfen",
          `Die arbeitsfreie Sonn- oder Feiertagsruhe am ${dateLabel(date)} ist mit ${observedRest / 60} Stunden erfasster zusammenhängender Ruhe kürzer als die regulären ${requiredRestMinutes / 60} Stunden einschließlich §-5-Ruhezeit.`,
          [],
          dateValue,
        ),
      );
    }
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
