import { Temporal } from "@js-temporal/polyfill";
import type { ComplianceIssue } from "@/domain/types";
import type { ComplianceOptions } from "@/engine/compliance";
import { createComplianceIssue as issue } from "@/engine/compliance-issue";
import { getPublicHolidays } from "@/engine/holidays";
import type { YouthDutyDay } from "@/engine/simple-youth-duty-time";

// JArbSchG §§ 4, 8, 15-18; institutional exceptions remain conditional.
function weekWorkMinutes(week: readonly YouthDutyDay[]): number {
  const date = Temporal.PlainDate.from(week[0]!.date);
  const monday = date.subtract({ days: date.dayOfWeek - 1 });
  const intervals = [...new Set(week.flatMap((day) => day.intervals))];
  const parts = intervals
    .map((item) => {
      const from = monday.toZonedDateTime({ timeZone: item.start.timeZoneId, plainTime: "00:00" });
      const through = from.add({ days: 7 });
      return {
        start: Temporal.ZonedDateTime.compare(item.start, from) > 0 ? item.start : from,
        end: Temporal.ZonedDateTime.compare(item.end, through) < 0 ? item.end : through,
      };
    })
    .filter((part) => Temporal.ZonedDateTime.compare(part.start, part.end) < 0)
    .sort((a, b) => Temporal.ZonedDateTime.compare(a.start, b.start));
  if (parts.length === 0) return 0;
  let end = parts[0]!.end;
  let gross = Number(end.epochMilliseconds - parts[0]!.start.epochMilliseconds) / 60_000;
  for (const part of parts.slice(1)) {
    const start = Temporal.ZonedDateTime.compare(part.start, end) > 0 ? part.start : end;
    gross += Math.max(0, Number(part.end.epochMilliseconds - start.epochMilliseconds) / 60_000);
    if (Temporal.ZonedDateTime.compare(part.end, end) > 0) end = part.end;
  }
  // A pause crossing a week boundary is subtracted from both weeks as a lower
  // bound; pauses crossing only midnight are subtracted once, not once per day.
  return Math.max(
    0,
    Math.round(gross) - intervals.reduce((sum, item) => sum + item.shift.breakMinutes, 0),
  );
}

function weeklyFindings(month: string, days: readonly YouthDutyDay[]): ComplianceIssue[] {
  const weeks = new Map<string, YouthDutyDay[]>();
  for (const day of days.filter((item) => item.workMinutes > 0)) {
    const date = Temporal.PlainDate.from(day.date);
    const monday = date.subtract({ days: date.dayOfWeek - 1 }).toString();
    const week = weeks.get(monday) ?? [];
    week.push(day);
    weeks.set(monday, week);
  }
  const findings: ComplianceIssue[] = [];
  for (const week of weeks.values()) {
    const display = week.findLast((day) => day.date.startsWith(month + "-"));
    if (!display) continue;
    const related = [...new Set(week.flatMap((day) => day.intervals.map((item) => item.shift)))];
    const minutes = weekWorkMinutes(week);
    if (minutes > 2400)
      findings.push(
        issue(
          "warning",
          "LEGAL",
          "JARBSCHG_8_WEEK",
          "Mehr als 40 Wochenstunden",
          "Die erfassten Dienste überschreiten 40 Stunden in der Woche von Montag bis Sonntag. Das ist die reguläre Grenze für Jugendliche; Feiertagsbrücken brauchen einen besonderen Ausgleich (§ 8). Nicht erfasste Arbeit und anzurechnende Feiertagsstunden können hinzukommen.",
          related,
          display.date,
        ),
      );
    if (week.length > 5)
      findings.push(
        issue(
          "warning",
          "LEGAL",
          "JARBSCHG_15_FIVE_DAYS",
          "Mehr als 5 Arbeitstage in einer Woche",
          "Jugendliche dürfen regulär an höchstens fünf Tagen von Montag bis Sonntag arbeiten (§ 15). Auch Dienste über Mitternacht berühren beide Kalendertage.",
          related,
          display.date,
        ),
      );
  }
  return findings;
}

// Gregorian Easter, same computus as the existing holiday engine. Easter Sunday
// is protected nationally by § 18 even where it is not a public-holiday entry.
function easter(year: number): string {
  const a = year % 19,
    b = Math.floor(year / 100),
    c = year % 100;
  const d = Math.floor(b / 4),
    e = b % 4;
  const f = Math.floor((b + 8) / 25),
    g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4),
    k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const value = h + l - 7 * m + 114;
  return Temporal.PlainDate.from({
    year,
    month: Math.floor(value / 31),
    day: (value % 31) + 1,
  }).toString();
}

function holidayFindings(
  month: string,
  days: readonly YouthDutyDay[],
  options: ComplianceOptions,
): ComplianceIssue[] {
  const year = Number(month.slice(0, 4));
  const protectedDates = new Set([year + "-01-01", year + "-05-01", year + "-12-25", easter(year)]);
  const holidays = options.federalState
    ? new Map(
        getPublicHolidays(
          year,
          options.federalState,
          options.ruleResolver,
          options.holidayRegion,
        ).map((day) => [day.date, day.name]),
      )
    : new Map<string, string>();
  const findings: ComplianceIssue[] = [];
  for (const day of days.filter(
    (item) => item.date.startsWith(month + "-") && item.workMinutes > 0,
  )) {
    const date = Temporal.PlainDate.from(day.date);
    const related = day.intervals.map((item) => item.shift);
    const afternoon = [year + "-12-24", year + "-12-31"].includes(day.date);
    const protectedAfternoon =
      afternoon &&
      day.intervals.some((item) => {
        const boundary = date.toZonedDateTime({
          timeZone: item.start.timeZoneId,
          plainTime: "14:00",
        });
        const from =
          Temporal.ZonedDateTime.compare(boundary, item.start) > 0 ? boundary : item.start;
        const endOfDay = boundary.startOfDay().add({ days: 1 });
        const to = Temporal.ZonedDateTime.compare(item.end, endOfDay) < 0 ? item.end : endOfDay;
        return (
          Number(to.epochMilliseconds - from.epochMilliseconds) / 60_000 > item.shift.breakMinutes
        );
      });
    if (protectedDates.has(day.date) || protectedAfternoon) {
      findings.push(
        issue(
          "warning",
          "LEGAL",
          "JARBSCHG_18_PROTECTED",
          "Geschützter Feiertag für Jugendliche",
          "An Neujahr, am 1. Mai, Ostersonntag und am 25. Dezember dürfen Jugendliche regulär auch in Krankenhäusern nicht arbeiten. Am 24. und 31. Dezember gilt dies nach 14 Uhr (§ 18).",
          related,
          day.date,
        ),
      );
    } else if (holidays.has(day.date)) {
      findings.push(
        issue(
          "info",
          "LEGAL",
          "JARBSCHG_18_HOLIDAY",
          "Feiertagsdienst für Jugendliche prüfen",
          holidays.get(day.date) +
            ": Arbeit ist nur mit gesetzlicher Ausnahme zulässig, etwa in Krankenhäusern oder entsprechenden Pflegeeinrichtungen. Für einen Feiertag an einem Werktag ist innerhalb derselben oder der folgenden drei Wochen ein anderer beschäftigungsfreier Arbeitstag nötig (§ 18).",
          related,
          day.date,
        ),
      );
    } else if (date.dayOfWeek >= 6) {
      findings.push(
        issue(
          "info",
          "LEGAL",
          "JARBSCHG_16_17_WEEKEND",
          "Wochenenddienst für Jugendliche prüfen",
          "Samstags- und Sonntagsarbeit ist nur mit gesetzlicher Ausnahme zulässig, etwa in Krankenhäusern oder entsprechenden Pflegeeinrichtungen. Zum Ausgleich muss ein anderer berufsschulfreier Arbeitstag derselben Woche frei bleiben. Zwei Samstage im Monat sollen, mindestens zwei Sonntage müssen frei sein (§§ 16–17).",
          related,
          day.date,
        ),
      );
    }
  }
  const sundaysWorked = days.filter(
    (day) =>
      day.date.startsWith(month + "-") &&
      day.workMinutes > 0 &&
      Temporal.PlainDate.from(day.date).dayOfWeek === 7,
  );
  const first = Temporal.PlainDate.from(month + "-01");
  let sundays = 0;
  for (let day = first; day.month === first.month; day = day.add({ days: 1 }))
    if (day.dayOfWeek === 7) sundays++;
  if (sundaysWorked.length > sundays - 2)
    findings.push(
      issue(
        "warning",
        "LEGAL",
        "JARBSCHG_17_FREE_SUNDAYS",
        "Mindestens 2 freie Sonntage nötig",
        "Die erfassten Dienste lassen in diesem Monat weniger als zwei Sonntage frei. Mindestens zwei müssen beschäftigungsfrei bleiben, auch bei einer zulässigen Ausnahme (§ 17).",
        sundaysWorked.flatMap((day) => day.intervals.map((item) => item.shift)),
        sundaysWorked.at(-1)!.date,
      ),
    );
  const work = days.find((day) => day.date.startsWith(month + "-"));
  if (work && (!options.federalState || options.holidayRegion === "UNKNOWN"))
    findings.push(
      issue(
        "info",
        "LEGAL",
        "JARBSCHG_HOLIDAY_LOCATION",
        "Regionale Feiertage nicht vollständig geprüft",
        "Für örtlich unterschiedliche Feiertage fehlt eine eindeutige Region. Bundesweit geschützte Tage werden trotzdem geprüft.",
        [],
        work.date,
      ),
    );
  return findings;
}

export function checkYouthWeeksAndHolidays(
  month: string,
  days: readonly YouthDutyDay[],
  options: ComplianceOptions,
): ComplianceIssue[] {
  return [...weeklyFindings(month, days), ...holidayFindings(month, days, options)];
}
