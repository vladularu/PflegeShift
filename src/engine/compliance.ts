import { Temporal } from "@js-temporal/polyfill";

import type {
  ComplianceIssue,
  ComplianceKind,
  ComplianceSeverity,
  MonthlyComplianceResult,
  ShiftEntry,
} from "@/domain/types";
import { calculateTimedShiftMinutes } from "@/engine/working-time";

const RELEVANT_TYPES = new Set(["EARLY", "LATE", "NIGHT", "DAY", "TRAINING", "CUSTOM"]);

interface Interval {
  readonly shift: ShiftEntry;
  readonly start: Temporal.ZonedDateTime;
  readonly end: Temporal.ZonedDateTime;
  readonly grossMinutes: number;
  readonly netMinutes: number;
}

function isRelevant(shift: ShiftEntry): boolean {
  return shift.deletedAt === null && RELEVANT_TYPES.has(shift.type) &&
    shift.startTime !== null && shift.endTime !== null;
}

function toInterval(shift: ShiftEntry, timeZone: string): Interval {
  const date = Temporal.PlainDate.from(shift.date);
  const startTime = Temporal.PlainTime.from(shift.startTime!);
  const endTime = Temporal.PlainTime.from(shift.endTime!);
  const endDate = Temporal.PlainTime.compare(endTime, startTime) <= 0
    ? date.add({ days: 1 })
    : date;
  const start = Temporal.ZonedDateTime.from({
    timeZone,
    year: date.year,
    month: date.month,
    day: date.day,
    hour: startTime.hour,
    minute: startTime.minute,
  }, { disambiguation: "earlier" });
  const end = Temporal.ZonedDateTime.from({
    timeZone,
    year: endDate.year,
    month: endDate.month,
    day: endDate.day,
    hour: endTime.hour,
    minute: endTime.minute,
  }, { disambiguation: "later" });
  return {
    shift,
    start,
    end,
    grossMinutes: Math.max(
      0,
      Math.round(Number(end.epochMilliseconds - start.epochMilliseconds) / 60_000),
    ),
    netMinutes: calculateTimedShiftMinutes(shift, timeZone),
  };
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

function minutesBetween(
  left: Temporal.ZonedDateTime,
  right: Temporal.ZonedDateTime,
): number {
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
      issues.push(issue(
        "critical",
        "LEGAL",
        "DATA_DUPLICATE",
        "Doppelter Kalendereintrag",
        "Derselbe Dienst wurde mit identischer Zeit, Pause und Dienstart mehrfach erfasst.",
        [previous, item.shift],
      ));
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
    const duplicate = current.start.epochMilliseconds === next.start.epochMilliseconds &&
      current.end.epochMilliseconds === next.end.epochMilliseconds &&
      current.shift.breakMinutes === next.shift.breakMinutes &&
      current.shift.type === next.shift.type;
    if (!duplicate && Temporal.ZonedDateTime.compare(next.start, current.end) < 0) {
      issues.push(issue(
        "critical",
        "LEGAL",
        "SHIFT_OVERLAP",
        "Dienste überschneiden sich",
        "Zwei arbeitszeitrelevante Einträge liegen zeitlich übereinander.",
        [current.shift, next.shift],
      ));
    }
  }
  return issues;
}

function connectedWorkGroups(intervals: readonly Interval[]): Interval[][] {
  const groups: Interval[][] = [];
  let group: Interval[] = [];
  let latestEnd: Temporal.ZonedDateTime | null = null;
  for (const item of intervals) {
    if (latestEnd && minutesBetween(latestEnd, item.start) >= 600) {
      groups.push(group);
      group = [];
      latestEnd = null;
    }
    group.push(item);
    if (!latestEnd || Temporal.ZonedDateTime.compare(item.end, latestEnd) > 0) {
      latestEnd = item.end;
    }
  }
  if (group.length) groups.push(group);
  return groups;
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
  for (const items of connectedWorkGroups(intervals)) {
    const shifts = items.map((item) => item.shift);
    const date = shifts.at(-1)!.date;
    const net = items.reduce((sum, item) => sum + item.netMinutes, 0);
    const recordedBreak = shifts.reduce((sum, shift) => sum + shift.breakMinutes, 0);
    const interruptions = interruptionMinutes(items);

    if (net > 600) {
      issues.push(issue(
        "critical", "LEGAL", "ARBZG_3_MAX_10H", "Tagesarbeitszeit über 10 Stunden",
        `${hours(net)} Nettoarbeitszeit überschreiten die 10-Stunden-Grenze.`,
        shifts, date,
      ));
    } else if (net > 480) {
      issues.push(issue(
        "warning", "LEGAL", "ARBZG_3_OVER_8H", "Tagesarbeitszeit über 8 Stunden",
        `${hours(net)} Nettoarbeitszeit erfordern einen zulässigen Ausgleichszeitraum.`,
        shifts, date,
      ));
    }

    const requiredBreak = net > 540 ? 45 : net > 360 ? 30 : 0;
    if (recordedBreak < requiredBreak) {
      if (recordedBreak + interruptions >= requiredBreak) {
        issues.push(issue(
          "warning", "LEGAL", "ARBZG_4_INTERRUPTION", "Unterbrechung als Pause prüfen",
          `${interruptions} Minuten zwischen Diensten könnten die fehlende Pause abdecken. Bitte die tatsächliche Pausenlage prüfen.`,
          shifts, date,
        ));
      } else {
        issues.push(issue(
          "critical", "LEGAL", "ARBZG_4_BREAK", "Pause zu kurz",
          `Erfasst sind ${recordedBreak} Minuten Pause; erforderlich sind mindestens ${requiredBreak} Minuten.`,
          shifts, date,
        ));
      }
    }
    if (hasContinuousWorkOverSixHours(items)) {
      issues.push(issue(
        "critical", "LEGAL", "ARBZG_4_CONTINUOUS",
        "Mehr als sechs Stunden ohne dokumentierte Pause",
        "Ein zusammenhängender Arbeitsblock überschreitet sechs Stunden ohne dokumentierte Ruhepause.",
        shifts, date,
      ));
    }
    for (const item of items) {
      if (item.shift.breakMinutes > item.grossMinutes) {
        issues.push(issue(
          "critical", "LEGAL", "TIME_PLAUSIBILITY", "Pause länger als Dienst",
          "Die eingetragene Pause ist länger als die gesamte Brutto-Dienstzeit.",
          [item.shift],
        ));
      }
      if (item.grossMinutes > 960) {
        issues.push(issue(
          "warning", "PLANNING", "TIME_GROSS_OVER_16H", "Dienst länger als 16 Stunden",
          `Die Brutto-Dienstzeit beträgt ${hours(item.grossMinutes)} und sollte auf einen Eingabefehler geprüft werden.`,
          [item.shift],
        ));
      }
    }
  }
  return issues;
}

interface WorkdayBoundary {
  readonly date: string;
  readonly earliest: Interval;
  readonly latest: Interval;
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
        Temporal.ZonedDateTime.compare(left.start, right.start) <= 0 ? left : right),
      latest: entries.reduce((left, right) =>
        Temporal.ZonedDateTime.compare(left.end, right.end) >= 0 ? left : right),
    }));
}

function checkRestAndSequence(intervals: readonly Interval[]): ComplianceIssue[] {
  const issues: ComplianceIssue[] = [];
  const boundaries = workdayBoundaries(intervals);
  for (let index = 0; index < boundaries.length - 1; index++) {
    const current = boundaries[index].latest;
    const next = boundaries[index + 1].earliest;
    const rest = minutesBetween(current.end, next.start);
    if (rest < 600) {
      issues.push(issue(
        "critical", "LEGAL", "ARBZG_5_REST_10H", "Ruhezeit unter 10 Stunden",
        `Zwischen den Arbeitstagen liegen nur ${hours(rest)} Ruhezeit.`,
        [current.shift, next.shift],
      ));
    } else if (rest < 660) {
      issues.push(issue(
        "warning", "LEGAL", "ARBZG_5_REST_11H", "Ruhezeit unter 11 Stunden",
        `Die Ruhezeit beträgt ${hours(rest)}. Eine Verkürzung muss tariflich zulässig und ausgeglichen sein.`,
        [current.shift, next.shift],
      ));
    } else if (
      current.shift.type === "LATE" &&
      next.shift.type === "EARLY" &&
      Temporal.PlainDate.from(boundaries[index + 1].date)
        .since(Temporal.PlainDate.from(boundaries[index].date)).days === 1
    ) {
      issues.push(issue(
        "warning", "PLANNING", "PLANNING_LATE_EARLY", "Ungünstige Folge Spät zu Früh",
        "Die gesetzliche Ruhezeit ist eingehalten; die kurze Vorwärtsrotation sollte dennoch geprüft werden.",
        [current.shift, next.shift],
      ));
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
    if (previous &&
      Temporal.PlainDate.from(shift.date).since(Temporal.PlainDate.from(previous.date)).days !== 1) {
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
      issues.push(issue(
        "warning", "PLANNING", "PLANNING_7_DAYS",
        "Sieben oder mehr Arbeitstage in Folge",
        `${streak.length} aufeinanderfolgende Arbeitstage wurden erkannt.`,
        streak,
      ));
    }
  }

  for (const streak of consecutiveDateStreaks(shifts.filter((shift) => shift.type === "NIGHT"))) {
    if (streak.length >= 4) {
      issues.push(issue(
        "warning", "PLANNING", "PLANNING_NIGHT_SERIES",
        "Vier oder mehr Nachtdienste in Folge",
        `${streak.length} aufeinanderfolgende Nachtdienste wurden erkannt.`,
        streak,
      ));
    }
    if (streak.length >= 2) {
      const last = streak.at(-1)!;
      const lastIndex = intervals.findIndex((item) => item.shift.id === last.id);
      const next = intervals[lastIndex + 1];
      if (next && (next.shift.type === "EARLY" || next.shift.type === "DAY")) {
        const rest = minutesBetween(intervals[lastIndex].end, next.start);
        if (rest >= 660 && rest < 1_440) {
          issues.push(issue(
            "warning", "PLANNING", "PLANNING_NIGHT_RECOVERY",
            "Kurze Erholung nach Nachtserie",
            `Nach der Nachtserie folgen nur ${hours(rest)} Erholungszeit.`,
            [...streak, next.shift],
          ));
        }
      }
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
    if (Temporal.PlainDate.from(keys[index + 1]).since(Temporal.PlainDate.from(keys[index])).days === 7) {
      issues.push(issue(
        "warning", "PLANNING", "PLANNING_WEEKENDS",
        "Zwei Wochenenden in Folge gearbeitet",
        "Prüfen, ob nach der Dienstplanregel jedes zweite Wochenende frei sein sollte.",
        [weekends.get(keys[index])!, weekends.get(keys[index + 1])!],
      ));
    }
  }
  return issues;
}

export function calculateMonthlyCompliance(
  month: string,
  shifts: readonly ShiftEntry[],
  timeZone: string,
): MonthlyComplianceResult {
  const first = Temporal.PlainDate.from(`${month}-01`);
  const start = first.subtract({ days: 8 }).toString();
  const end = first.add({ months: 1 }).subtract({ days: 1 }).toString();
  const intervals = shifts
    .filter((shift) => isRelevant(shift) && shift.date >= start && shift.date <= end)
    .map((shift) => toInterval(shift, timeZone))
    .sort((left, right) => Temporal.ZonedDateTime.compare(left.start, right.start));
  const issues = [
    ...checkDuplicates(intervals),
    ...checkOverlaps(intervals),
    ...checkWorkingTime(intervals),
    ...checkRestAndSequence(intervals),
    ...checkPlanningSeries(intervals),
  ].filter((item) => item.date.startsWith(`${month}-`));
  return {
    month,
    issues,
    criticalCount: issues.filter((item) => item.severity === "critical").length,
    warningCount: issues.filter((item) => item.severity === "warning").length,
    infoCount: issues.filter((item) => item.severity === "info").length,
    affectedDates: [...new Set(issues.map((item) => item.date))].sort(),
  };
}
