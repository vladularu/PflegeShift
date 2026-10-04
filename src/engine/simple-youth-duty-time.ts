import { Temporal } from "@js-temporal/polyfill";
import type { ComplianceIssue, MonthlyComplianceResult } from "@/domain/types";
import type { ComplianceOptions } from "@/engine/compliance";
import { createComplianceIssue as issue } from "@/engine/compliance-issue";
import { restPeriods, type ComplianceInterval } from "@/engine/compliance-sequences";
import { checkYouthWeeksAndHolidays } from "@/engine/simple-youth-duty-week";

// JArbSchG §§ 4, 8, 11-14. Manual opt-in, no age or exception confirmations.
// https://www.gesetze-im-internet.de/jarbschg/BJNR009650976.html
export interface YouthDutyDay {
  readonly date: string;
  readonly intervals: readonly ComplianceInterval[];
  readonly workMinutes: number;
  readonly breakMinutes: number;
  readonly hasGap: boolean;
}
const elapsed = (start: Temporal.ZonedDateTime, end: Temporal.ZonedDateTime) =>
  Math.max(0, Math.round(Number(end.epochMilliseconds - start.epochMilliseconds) / 60_000));
const amount = (minutes: number) =>
  (minutes / 60).toLocaleString("de-DE", { maximumFractionDigits: 2 });

export function youthDutyDays(intervals: readonly ComplianceInterval[]): readonly YouthDutyDay[] {
  const parts = new Map<
    string,
    { item: ComplianceInterval; start: Temporal.ZonedDateTime; end: Temporal.ZonedDateTime }[]
  >();
  for (const item of intervals) {
    let start = item.start;
    while (Temporal.ZonedDateTime.compare(start, item.end) < 0) {
      const midnight = start.startOfDay().add({ days: 1 });
      const end = Temporal.ZonedDateTime.compare(midnight, item.end) < 0 ? midnight : item.end;
      const date = start.toPlainDate().toString();
      const values = parts.get(date) ?? [];
      values.push({ item, start, end });
      parts.set(date, values);
      start = end;
    }
  }
  return [...parts.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, values]) => {
      values.sort((a, b) => Temporal.ZonedDateTime.compare(a.start, b.start));
      let end = values[0]!.end;
      let gross = elapsed(values[0]!.start, end);
      let hasGap = false;
      for (const part of values.slice(1)) {
        if (Temporal.ZonedDateTime.compare(part.start, end) > 0) {
          hasGap ||= elapsed(end, part.start) >= 15;
          gross += elapsed(part.start, part.end);
        } else if (Temporal.ZonedDateTime.compare(part.end, end) > 0)
          gross += elapsed(end, part.end);
        if (Temporal.ZonedDateTime.compare(part.end, end) > 0) end = part.end;
      }
      const items = [...new Set(values.map((part) => part.item))];
      const breaks = items.reduce((sum, item) => sum + item.shift.breakMinutes, 0);
      // With unknown pause placement, subtract the entire pause from EACH affected
      // calendar day. This is a lower bound, never invented work across midnight.
      return {
        date,
        intervals: items,
        workMinutes: Math.max(0, gross - breaks),
        breakMinutes: breaks,
        hasGap,
      };
    });
}

function dailyFindings(days: readonly YouthDutyDay[]): ComplianceIssue[] {
  const findings: ComplianceIssue[] = [];
  for (const day of days) {
    const related = day.intervals.map((item) => item.shift);
    if (day.workMinutes > 480)
      findings.push(
        issue(
          day.workMinutes > 510 ? "warning" : "info",
          "LEGAL",
          "JARBSCHG_8_DAILY",
          day.workMinutes > 510
            ? "Arbeitszeit für Jugendliche zu lang"
            : "Arbeitszeit über 8 Stunden prüfen",
          amount(day.workMinutes) +
            " Stunden erfasste Arbeit. Regulär sind höchstens 8 Stunden erlaubt. Bis 8,5 Stunden können bei verkürzten anderen Arbeitstagen derselben Woche zulässig sein; für Feiertagsbrücken gelten besondere Ausgleichsregeln (§ 8).",
          related,
          day.date,
        ),
      );
    const required = day.workMinutes > 360 ? 60 : day.workMinutes > 270 ? 30 : 0;
    if (day.breakMinutes < required)
      findings.push(
        issue(
          day.hasGap ? "info" : "warning",
          "LEGAL",
          "JARBSCHG_11_BREAK_DURATION",
          day.hasGap ? "Pausen zwischen Diensten prüfen" : "Mehr Pause für Jugendliche nötig",
          "Bei der erfassten Arbeitszeit sind mindestens " +
            required +
            " Minuten Pause nötig. Eingetragen: " +
            day.breakMinutes +
            " Minuten. Eine Unterbrechung zwischen Diensten zählt nur als tatsächliche Ruhepause (§ 11).",
          related,
          day.date,
        ),
      );
  }
  return findings;
}

function serviceFindings(intervals: readonly ComplianceInterval[]): ComplianceIssue[] {
  const findings: ComplianceIssue[] = [];
  const byStartDate = new Map<string, ComplianceInterval[]>();
  for (const item of intervals) {
    const group = byStartDate.get(item.shift.date) ?? [];
    group.push(item);
    byStartDate.set(item.shift.date, group);
    const startMinutes = item.start.hour * 60 + item.start.minute;
    const endMinutes = item.end.hour * 60 + item.end.minute;
    const overnight = !item.start.toPlainDate().equals(item.end.toPlainDate());
    if (startMinutes < 360 || endMinutes > 1200 || overnight) {
      const outsideExtendedWindow = startMinutes < 330 || endMinutes > 1410 || overnight;
      findings.push(
        issue(
          outsideExtendedWindow ? "warning" : "info",
          "LEGAL",
          "JARBSCHG_14_NIGHT",
          outsideExtendedWindow
            ? "Nachtdienst für Jugendliche prüfen"
            : "Früh- oder Spätdienst für Jugendliche prüfen",
          "Regulär darf nur von 6 bis 20 Uhr gearbeitet werden. Für Jugendliche über 16 Jahre gibt es unter bestimmten Voraussetzungen Ausnahmen in Mehrschichtbetrieben, teilweise bis 23 bzw. 23:30 Uhr oder ab 5:30 Uhr. Diese Ausnahme und die Grenze vor frühem Berufsschulunterricht sind hier nicht bestätigt (§ 14).",
          [item.shift],
        ),
      );
    }
  }
  for (const [date, group] of byStartDate) {
    const start = group.reduce((a, b) =>
      Temporal.ZonedDateTime.compare(a.start, b.start) < 0 ? a : b,
    ).start;
    const end = group.reduce((a, b) =>
      Temporal.ZonedDateTime.compare(a.end, b.end) > 0 ? a : b,
    ).end;
    if (elapsed(start, end) > 600)
      findings.push(
        issue(
          "warning",
          "LEGAL",
          "JARBSCHG_12_SPAN",
          "Dienstspanne über 10 Stunden",
          "Vom ersten Beginn bis zum letzten Ende einschließlich Pausen liegen " +
            amount(elapsed(start, end)) +
            " Stunden. Für Jugendliche beträgt die reguläre Grenze 10 Stunden (§ 12).",
          group.map((item) => item.shift),
          date,
        ),
      );
  }
  for (const period of restPeriods(intervals)) {
    if (period.minutes >= 0 && period.minutes < 720)
      findings.push(
        issue(
          "warning",
          "LEGAL",
          "JARBSCHG_13_REST",
          "Weniger als 12 Stunden Ruhezeit",
          "Zwischen diesen Arbeitstagen liegen " +
            amount(period.minutes) +
            " Stunden. Jugendliche brauchen mindestens 12 zusammenhängende Stunden Freizeit (§ 13).",
          [period.current.shift, period.next.shift],
          period.next.shift.date,
        ),
      );
  }
  return findings;
}

function scopeFindings(month: string, days: readonly YouthDutyDay[]): ComplianceIssue[] {
  const inMonth = days.filter((day) => day.date.startsWith(month + "-"));
  const findings: ComplianceIssue[] = [];
  const withPause = inMonth.find((day) => day.workMinutes > 270 && day.breakMinutes > 0);
  if (withPause)
    findings.push(
      issue(
        "info",
        "LEGAL",
        "JARBSCHG_11_BREAK_PLACEMENT",
        "Pausenlage prüfen",
        "Die Pausensumme ist geprüft. Ohne Beginn und Ende jeder Pause lassen sich mindestens 15 Minuten je Pause, höchstens 4,5 Stunden am Stück sowie die Lage frühestens eine Stunde nach Beginn und spätestens eine Stunde vor Ende nicht prüfen (§ 11).",
        [],
        withPause.date,
      ),
    );
  const training = inMonth
    .flatMap((day) => day.intervals)
    .find((item) => item.shift.type === "TRAINING");
  if (training)
    findings.push(
      issue(
        "info",
        "LEGAL",
        "JARBSCHG_SCHOOL_SCOPE",
        "Schulzeiten zusätzlich berücksichtigen",
        "Hier werden die eingetragenen Zeiten geprüft. Gesetzliche Berufsschul- und Prüfungsanrechnung sowie besondere Regeln bei Vollzeitschulpflicht werden daraus nicht automatisch abgeleitet.",
        [training.shift],
      ),
    );
  return findings;
}

export function calculateSimpleYouthCompliance(
  month: string,
  intervals: readonly ComplianceInterval[],
  options: ComplianceOptions,
  shared: readonly ComplianceIssue[],
): MonthlyComplianceResult {
  const first = Temporal.PlainDate.from(month + "-01");
  const from = first.subtract({ days: 7 }).toString();
  const through = first.add({ months: 1, days: 21 }).toString();
  const relevant = intervals.filter(
    (item) => item.end.toPlainDate().toString() >= from && item.shift.date <= through,
  );
  const days = youthDutyDays(relevant);
  const issues = [
    ...shared,
    ...dailyFindings(days),
    ...serviceFindings(relevant),
    ...checkYouthWeeksAndHolidays(month, days, options),
    ...scopeFindings(month, days),
  ]
    .filter((finding) => finding.date.startsWith(month + "-"))
    .map((finding) =>
      finding.kind === "LEGAL" ? { ...finding, assessmentRanges: [{ from, through }] } : finding,
    );
  return {
    month,
    issues,
    assessmentRange: { from, through },
    criticalCount: issues.filter((finding) => finding.severity === "critical").length,
    warningCount: issues.filter((finding) => finding.severity === "warning").length,
    infoCount: issues.filter((finding) => finding.severity === "info").length,
    affectedDates: [...new Set(issues.map((finding) => finding.date))].sort(),
  };
}
