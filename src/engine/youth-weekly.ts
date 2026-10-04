import { Temporal } from "@js-temporal/polyfill";
import { easterSunday, resolveHolidayMapForMonths } from "./holidays";
import { clockMinutes } from "./youth-intervals";
import type { YouthCredits } from "./youth-school";
import type { YouthDay, YouthInput, YouthReport } from "./youth-types";

export function checkYouthWeeks(
  days: readonly YouthDay[],
  credits: YouthCredits,
  input: YouthInput,
  report: YouthReport,
): void {
  const byDate = new Map(days.map((d) => [d.date, d]));
  const releasedPrecedingWorkdays = new Set(
    days.flatMap((day) =>
      day.entries.flatMap((entry) =>
        entry.exam?.kind === "EXAM" &&
        entry.exam.finalWritten === true &&
        entry.exam.precedingWorkDate
          ? [entry.exam.precedingWorkDate]
          : [],
      ),
    ),
  );
  const weeks = new Map<string, YouthDay[]>();
  for (const day of days) weeks.set(day.week, [...(weeks.get(day.week) ?? []), day]);
  const holidays = resolveHolidayMapForMonths(
    [...new Set(days.map((d) => d.date.slice(0, 7)))],
    input.profile.federalState,
    input.ruleResolver,
    input.profile.holidayRegion,
  );
  if (holidays.status === "UNAVAILABLE")
    for (const day of days.filter((d) => d.date.startsWith(input.month)))
      report(
        day,
        day.date,
        "HOLIDAY_RULES_MISSING",
        "INCOMPLETE",
        "Feiertagsregeln sind für den Prüfzeitraum nicht vollständig verfügbar.",
        "§§ 4, 18 JArbSchG",
      );
  const free = input.shifts
    .filter((s) => s.deletedAt === null && s.type === "FREE" && !byDate.get(s.date)?.entries.length)
    .map((s) => s.date);
  const replacements: { day: YouthDay; lastDate: string; section: string }[] = [];
  for (const day of days) {
    const d = Temporal.PlainDate.from(day.date),
      dow = d.dayOfWeek,
      holiday = holidays.holidays.has(day.date),
      active = day.entries.length > 0;
    const ids = day.entries.map((e) => e.shift.id),
      facts = day.facts;
    const emit = (code: string, message: string, section: string, incomplete = false) =>
      report(day, day.date, code, incomplete ? "INCOMPLETE" : "WARNING", message, section, ids);
    if (active) {
      if (day.entries.some((entry) => entry.exam != null) && (dow >= 6 || holiday))
        emit(
          "EXAM_NONWORKDAY_REVIEW",
          "Für eine externe Prüfung an Wochenenden oder Feiertagen ist die Zulässigkeit nicht allein aus der Einrichtungskategorie ableitbar.",
          "§§ 10, 16–18 JArbSchG",
          true,
        );
      if (
        day.rules.daysOff.absoluteFixedHolidays.includes(day.date.slice(5)) ||
        (day.rules.daysOff.easterSundayProhibited && day.date === easterSunday(d.year))
      )
        emit(
          "ABSOLUTE_HOLIDAY",
          "An diesem besonders geschützten Feiertag greift die normale Einrichtungs-Ausnahme nicht.",
          "§ 18 Abs. 2 JArbSchG",
        );
      if (
        day.rules.daysOff.shortEveDays.includes(day.date.slice(5)) &&
        day.entries.some(
          (e) =>
            clockMinutes(e.end - 1, input.profile.timeZone) >= day.rules.daysOff.shortEveEndMinute,
        )
      )
        emit(
          "HOLIDAY_EVE",
          "Die Beschäftigung reicht in den geschützten Zeitraum am Heiligabend oder Silvester.",
          "§ 18 Abs. 1 JArbSchG",
        );
      if (dow >= 6 || holiday) {
        const allowed = facts?.careInstitution === true || facts?.medicalEmergencyService === true;
        const known =
          facts?.careInstitution !== null &&
          facts?.medicalEmergencyService !== null &&
          facts !== null;
        if (!allowed)
          emit(
            "WEEKEND_ELIGIBILITY",
            "Die erforderliche Tätigkeitsbereich-Ausnahme für diese Wochenend-/Feiertagsarbeit ist nicht bestätigt.",
            holiday ? "§ 18 JArbSchG" : dow === 6 ? "§ 16 JArbSchG" : "§ 17 JArbSchG",
            !known,
          );
        const lastDate = Temporal.PlainDate.from(day.week)
          .add({
            days: 6,
            weeks: holiday && dow !== 7 ? day.rules.daysOff.holidayReplacementFollowingWeeks : 0,
          })
          .toString();
        replacements.push({
          day,
          lastDate,
          section: holiday
            ? "§ 18 Abs. 3 JArbSchG"
            : dow === 6
              ? "§ 16 Abs. 3 JArbSchG"
              : "§ 17 Abs. 3 JArbSchG",
        });
      }
    }
  }
  const used = new Set<string>();
  for (const event of replacements.sort(
    (a, b) => a.lastDate.localeCompare(b.lastDate) || a.day.date.localeCompare(b.day.date),
  )) {
    const replacement = [...new Set(free)]
      .sort()
      .find(
        (d) =>
          d >= event.day.week &&
          d <= event.lastDate &&
          d !== event.day.date &&
          !used.has(d) &&
          byDate.has(d) &&
          !holidays.holidays.has(d) &&
          Temporal.PlainDate.from(d).dayOfWeek < 6,
      );
    if (replacement) used.add(replacement);
    else
      report(
        event.day,
        event.day.date,
        "REPLACEMENT_DAY_MISSING",
        "INCOMPLETE",
        "Eine eigene schulfreie Ersatzfreistellung im zulässigen Zeitraum ist nicht als Frei-Tag nachgewiesen.",
        event.section,
        event.day.entries.map((e) => e.shift.id),
      );
  }
  for (const weekDays of weeks.values()) {
    const target = weekDays.find((d) => d.date.startsWith(input.month));
    if (!target) continue;
    if (weekDays.length !== 7) {
      report(
        target,
        target.date,
        "PARTIAL_YOUTH_WEEK",
        "INCOMPLETE",
        "Die Kalenderwoche ist wegen fehlender Angaben oder einer Alters-/Statusgrenze nicht durchgehend mit Jugendregeln prüfbar.",
        "§§ 2, 4, 8 JArbSchG",
      );
      continue;
    }
    const occupiedDays = weekDays.filter((d) => d.entries.length).length;
    const includingExamRelease = weekDays.filter(
      (d) => d.entries.length || releasedPrecedingWorkdays.has(d.date),
    ).length;
    if (occupiedDays > target.rules.workingTime.maxDaysPerWeek)
      report(
        target,
        target.date,
        "WORKING_DAYS",
        "WARNING",
        "In dieser Kalenderwoche sind zu viele Beschäftigungs-/Schultage erfasst.",
        "§ 15 JArbSchG",
        weekDays.flatMap((d) => d.entries.map((e) => e.shift.id)),
      );
    else if (includingExamRelease > target.rules.workingTime.maxDaysPerWeek)
      report(
        target,
        target.date,
        "EXAM_WEEKDAY_CREDIT_UNCLEAR",
        "INCOMPLETE",
        "Mit dem angerechneten Arbeitstag vor der Abschlussprüfung sind mehr als fünf Tage betroffen; die Fünf-Tage-Abgrenzung benötigt fachliche Prüfung.",
        "§§ 10, 15 JArbSchG",
      );
    let total: number | null = credits.blockWeekly.has(target.week)
      ? credits.blockWeekly.get(target.week)!
      : 0;
    if (!credits.blockWeekly.has(target.week))
      for (const day of weekDays) {
        const amount = credits.daily.get(day.date) ?? null;
        if (amount === null) total = null;
        else if (total !== null) total += amount;
        if (
          Temporal.PlainDate.from(day.date).dayOfWeek <= 6 &&
          holidays.holidays.has(day.date) &&
          !day.entries.length
        ) {
          const lost = day.facts?.holidayLostMinutes[day.date];
          if (lost === undefined) {
            total = null;
            report(
              day,
              day.date,
              "HOLIDAY_CREDIT_MISSING",
              "INCOMPLETE",
              "Die durch den Feiertag ausgefallene Arbeitszeit ist nicht bestätigt; kein pauschaler Achtstundentag.",
              "§ 4 Abs. 4 JArbSchG",
            );
          } else if (total !== null) total += lost;
        }
      }
    if (total === null)
      report(
        target,
        target.date,
        "WEEKLY_CREDIT_INCOMPLETE",
        "INCOMPLETE",
        "Die anzurechnende Wochenzeit ist wegen fehlender Zeit-/Anrechnungsangaben unvollständig.",
        "§§ 4, 8, 9 JArbSchG",
      );
    else if (total > target.rules.workingTime.weeklyMinutes)
      report(
        target,
        target.date,
        "WEEKLY_TIME",
        credits.blockWeekly.has(target.week) ? "INCOMPLETE" : "WARNING",
        `Die anzurechnende Wochenzeit (${total} Min.) überschreitet ${target.rules.workingTime.weeklyMinutes} Minuten.`,
        "§§ 8, 9 JArbSchG",
      );
  }
  const monthDays = days.filter((d) => d.date.startsWith(input.month));
  if (monthDays.length === Temporal.PlainDate.from(input.month + "-01").daysInMonth) {
    const first = monthDays[0];
    if (monthDays.some((d) => d.facts?.allWorkAndSchoolRecorded !== true)) return;
    const freeSundays = monthDays.filter(
      (d) => Temporal.PlainDate.from(d.date).dayOfWeek === 7 && !d.entries.length,
    ).length;
    if (freeSundays < first.rules.daysOff.minimumFreeSundays)
      report(
        first,
        first.date,
        "FREE_SUNDAYS",
        "WARNING",
        "Im Monat bleiben zu wenige Sonntage beschäftigungsfrei.",
        "§ 17 Abs. 2 JArbSchG",
      );
    const freeSaturdays = monthDays.filter(
      (d) => Temporal.PlainDate.from(d.date).dayOfWeek === 6 && !d.entries.length,
    ).length;
    if (freeSaturdays < first.rules.daysOff.recommendedFreeSaturdays)
      report(
        first,
        first.date,
        "FREE_SATURDAYS",
        "RECOMMENDATION",
        "Nach der Soll-Regel sollten mehr Samstage im Monat beschäftigungsfrei bleiben.",
        "§ 16 Abs. 2 JArbSchG",
      );
  }
}
