import { Temporal } from "@js-temporal/polyfill";
import type { YouthDay, YouthInput, YouthReport, YouthSpan } from "./youth-types";
import { clockMinutes, unionMinutes, workSpans } from "./youth-intervals";
import {
  locatedExamTravel,
  locatedSchoolTravel,
  trainingActivityBounds,
} from "./youth-school-travel";

export function checkYouthDay(
  day: YouthDay,
  input: YouthInput,
  report: YouthReport,
  credit: number | null,
  nextEarlySchool: boolean,
): void {
  const { entries, rules, facts, date } = day;
  const ids = entries.map((e) => e.shift.id);
  const emit = (code: string, message: string, section: string, incomplete = false) =>
    report(day, date, code, incomplete ? "INCOMPLETE" : "WARNING", message, section, ids);
  if (facts?.allWorkAndSchoolRecorded !== true || input.profile.allEmploymentWorkRecorded !== true)
    emit(
      "SCOPE_INCOMPLETE",
      "Bitte bestätigen, dass sämtliche Beschäftigungen und Schulzeiten erfasst sind.",
      "§ 4 Abs. 5 JArbSchG",
      true,
    );
  if (facts?.otherExceptions !== false)
    emit(
      "EXCEPTIONS_UNRESOLVED",
      "Individuelle, tarifliche oder besondere Ausnahmen sind nicht abschließend geklärt. Standardregeln allein ergeben keine Freigabe.",
      "§§ 8, 14, 21–21b JArbSchG",
      true,
    );
  const shorterConfirmed =
    facts?.shortenedWorkingDays.some(
      (d) =>
        d !== date &&
        Temporal.PlainDate.from(d).dayOfWeek <= 6 &&
        day.week ===
          Temporal.PlainDate.from(d)
            .subtract({ days: Temporal.PlainDate.from(d).dayOfWeek - 1 })
            .toString(),
    ) === true;
  const dailyLimit = shorterConfirmed
    ? rules.workingTime.reducedWeekDailyMinutes
    : rules.workingTime.dailyMinutes;
  if (credit !== null && credit > dailyLimit)
    emit(
      "DAILY_TIME",
      `Die anzurechnende Tageszeit (${credit} Min.) überschreitet ${dailyLimit} Minuten.`,
      "§§ 8–10 JArbSchG",
    );
  if (!entries.length) return;
  const unresolvedTravel = day.schoolEntries.some((e) => locatedSchoolTravel(e, entries) === null);
  if (unresolvedTravel)
    emit(
      "SCHOOL_TRAVEL_POSITION",
      "Notwendige Schul-/Arbeitswege sind zeitlich nicht verortet. Die Anrechnung ihrer Dauer allein belegt keine Pause oder ununterbrochene Freizeit.",
      "§§ 9, 11, 13 JArbSchG",
      true,
    );
  const unresolvedExamTravel = entries.some(
    (e) => e.exam !== null && locatedExamTravel(e, entries) === null,
  );
  if (unresolvedExamTravel)
    emit(
      "EXAM_TRAVEL_POSITION",
      "Notwendige Prüfungswege sind zeitlich nicht verortet oder unbestätigt; Ruhe- und Pausenlage bleiben offen.",
      "§§ 10, 11, 13 JArbSchG",
      true,
    );
  if (entries.some((e) => e.pauses === null))
    emit(
      "PAUSE_DATA_MISSING",
      "Die tatsächliche Pausenlage fehlt oder gehört zu einem älteren Dienststand.",
      "§ 11 JArbSchG",
      true,
    );
  if (facts?.pausesPredefined !== true)
    emit(
      "PAUSE_PREDETERMINATION_UNKNOWN",
      "Ob die Pausen im Voraus feststanden, ist nicht bestätigt.",
      "§ 11 Abs. 1 JArbSchG",
      true,
    );
  const activity = entries.map((entry) => trainingActivityBounds(entry, entries));
  const first = Math.min(...activity.map((e) => e.start)),
    last = Math.max(...activity.map((e) => e.end));
  if ((last - first) / 60000 > rules.workingTime.shiftSpanMinutes)
    emit(
      "SHIFT_SPAN",
      `Die Schichtzeit überschreitet ${rules.workingTime.shiftSpanMinutes} Minuten.`,
      "§ 12 JArbSchG",
    );
  if (entries.every((e) => e.pauses !== null)) {
    const minimum = rules.breaks.minimumSegmentMinutes;
    const pauses: YouthSpan[] = entries.flatMap((e) =>
      e.pauses!.filter((p) => (p.originalMinutes ?? (p.end - p.start) / 60000) >= minimum),
    );
    const sorted = [...activity].sort((a, b) => a.start - b.start);
    if (
      facts?.allWorkAndSchoolRecorded === true &&
      facts.pausesPredefined === true &&
      !unresolvedTravel &&
      !unresolvedExamTravel
    ) {
      let end = sorted[0].end;
      for (const entry of sorted.slice(1)) {
        if ((entry.start - end) / 60000 >= minimum) pauses.push({ start: end, end: entry.start });
        end = Math.max(end, entry.end);
      }
    }
    const work = unionMinutes([
      ...entries.flatMap((e) => workSpans(e, minimum)),
      ...day.schoolEntries.flatMap((e) => locatedSchoolTravel(e, entries) ?? []),
      ...entries.flatMap((e) => (e.exam ? (locatedExamTravel(e, entries) ?? []) : [])),
    ]);
    const required = rules.breaks.tiers.reduce(
      (minutes, tier) => (work > tier.overMinutes ? tier.requiredMinutes : minutes),
      0,
    );
    if (unionMinutes(pauses) < required)
      emit(
        "BREAK_DURATION",
        `Für die erfasste Arbeitszeit fehlen anrechenbare Pausen: mindestens ${required} Minuten.`,
        "§ 11 Abs. 1 JArbSchG",
      );
    if (
      pauses.some(
        (p) =>
          (p.start - first) / 60000 < rules.breaks.afterStartMinutes ||
          (last - p.end) / 60000 < rules.breaks.beforeEndMinutes,
      )
    )
      emit(
        "BREAK_POSITION",
        "Eine Pause liegt zu nah am Beginn oder Ende der täglichen Beschäftigung.",
        "§ 11 Abs. 2 JArbSchG",
      );
    const validPauses = [...pauses].sort((a, b) => a.start - b.start);
    let cursor = first;
    for (const p of validPauses) {
      if ((p.start - cursor) / 60000 > rules.breaks.maxContinuousMinutes) {
        emit(
          "CONTINUOUS_TIME",
          "Eine Beschäftigungsstrecke ohne anrechenbare Pause ist zu lang.",
          "§ 11 Abs. 2 JArbSchG",
        );
        break;
      }
      cursor = Math.max(cursor, p.end);
    }
    if ((last - cursor) / 60000 > rules.breaks.maxContinuousMinutes)
      emit(
        "CONTINUOUS_TIME",
        "Eine Beschäftigungsstrecke ohne anrechenbare Pause ist zu lang.",
        "§ 11 Abs. 2 JArbSchG",
      );
  }
  const mayWorkLate =
    day.age >= rules.employmentWindow.multiShiftMinimumAge &&
    facts?.multiShiftOperation === true &&
    !nextEarlySchool;
  const limit = mayWorkLate
    ? rules.employmentWindow.multiShiftEndMinute
    : rules.employmentWindow.endMinute;
  for (const entry of day.workEntries) {
    const start = clockMinutes(entry.start, input.profile.timeZone);
    const end = Temporal.Instant.fromEpochMilliseconds(entry.end).toZonedDateTimeISO(
      input.profile.timeZone,
    );
    const endMinute = end.toPlainDate().toString() > date ? 1440 : end.hour * 60 + end.minute;
    if (start < rules.employmentWindow.startMinute || endMinute > limit) {
      const possibleUnconfirmedException =
        facts?.multiShiftOperation === null &&
        day.age >= rules.employmentWindow.multiShiftMinimumAge &&
        start >= rules.employmentWindow.startMinute &&
        endMinute <= rules.employmentWindow.multiShiftEndMinute &&
        !nextEarlySchool;
      emit(
        "EMPLOYMENT_WINDOW",
        nextEarlySchool
          ? "Vor einem frühen Berufsschultag endet auch im Mehrschichtbetrieb die zulässige Beschäftigung früher."
          : "Der Dienst liegt außerhalb des anhand der bestätigten Angaben zulässigen Beschäftigungszeitraums.",
        "§ 14 JArbSchG",
        possibleUnconfirmedException,
      );
    }
  }
  for (const school of day.schoolEntries) {
    if (
      clockMinutes(school.start, input.profile.timeZone) < rules.school.earlyStartMinute &&
      day.workEntries.some((e) => e.start < school.start)
    )
      emit(
        "WORK_BEFORE_EARLY_SCHOOL",
        "Vor diesem früh beginnenden Berufsschulunterricht ist keine Beschäftigung zulässig.",
        "§ 9 Abs. 1 Nr. 1 JArbSchG",
      );
  }
  const ordered = [...activity].sort((a, b) => a.start - b.start);
  for (let index = 1; index < ordered.length; index++)
    if (ordered.slice(0, index).some((e) => e.end > ordered[index].start))
      emit(
        "OVERLAPPING_ENTRIES",
        "Dienst- oder Schulzeiten überschneiden sich. Die Zeitbasis muss geklärt werden.",
        "§ 4 JArbSchG",
        true,
      );
}
