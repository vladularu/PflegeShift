import type { YouthDay, YouthReport } from "./youth-types";
import { unionMinutes } from "./youth-intervals";
import { locatedExamTravel } from "./youth-school-travel";

/** § 10 JArbSchG: release and credit only from explicitly classified, current facts. */
export function assessYouthExams(
  days: readonly YouthDay[],
  baseCredits: ReadonlyMap<string, number | null>,
  report: YouthReport,
): Map<string, number | null> {
  const daily = new Map(baseCredits);
  const byDate = new Map(days.map((day) => [day.date, day]));
  for (const day of days) {
    const examinations = day.entries.filter((entry) => entry.exam != null);
    for (const entry of examinations) {
      const exam = entry.exam!;
      const emit = (code: string, severity: "WARNING" | "INCOMPLETE", message: string) =>
        report(day, day.date, code, severity, message, "§ 10 JArbSchG", [entry.shift.id]);
      if (
        entry.shift.startTime === null ||
        entry.shift.endTime === null ||
        entry.shift.endTime <= entry.shift.startTime
      ) {
        emit(
          "EXAM_CROSS_DAY_UNSUPPORTED",
          "INCOMPLETE",
          "Eine Prüfung über Mitternacht wird ohne tagesgenau getrennte Teilnahme- und Wegezeiten nicht angerechnet.",
        );
        daily.set(day.date, null);
        continue;
      }
      if (day.legal.engineContractVersion < 10 || day.rules.exam === undefined) {
        emit(
          "EXAM_ASSESSMENT_PENDING",
          "INCOMPLETE",
          "Für Prüfung oder außerbetriebliche Ausbildungsmaßnahme fehlt ein unterstützter §-10-Regelstand.",
        );
        daily.set(day.date, null);
        if (exam.kind === "EXAM" && exam.finalWritten === true) {
          if (exam.precedingWorkDate) {
            report(
              byDate.get(exam.precedingWorkDate) ?? day,
              exam.precedingWorkDate,
              "EXAM_PRECEDING_DAY_PENDING",
              "INCOMPLETE",
              "Der bestätigte Arbeitstag vor der schriftlichen Abschlussprüfung benötigt eine gesonderte Freistellungsprüfung.",
              "§ 10 JArbSchG",
              [entry.shift.id],
            );
            daily.set(exam.precedingWorkDate, null);
          } else {
            emit(
              "EXAM_PRECEDING_WORKDAY_UNKNOWN",
              "INCOMPLETE",
              "Der unmittelbar vorausgehende Arbeitstag ist unbekannt; er wird nicht als vorheriger Kalendertag geraten.",
            );
          }
        }
        continue;
      } else if (exam.requiredByRuleOrContract !== true) {
        emit(
          "EXAM_BASIS_UNCONFIRMED",
          "INCOMPLETE",
          "Die öffentlich-rechtliche oder vertragliche Grundlage der externen Teilnahme ist nicht bestätigt.",
        );
        daily.set(day.date, null);
      } else if (
        entry.pauses === null ||
        exam.participation.length === 0 ||
        exam.travelToWorkMinutes === null ||
        exam.travelFromWorkMinutes === null
      ) {
        emit(
          "EXAM_CREDIT_MISSING",
          "INCOMPLETE",
          "Für die Prüfungsanrechnung fehlen Teilnahme-, Pausen- oder notwendige Wegezeiten.",
        );
        daily.set(day.date, null);
      } else if (day.schoolEntries.length) {
        emit(
          "EXAM_SCHOOL_COMBINATION",
          "INCOMPLETE",
          "Prüfung und Berufsschule am selben Tag benötigen eine getrennte Anrechnungsprüfung.",
        );
        daily.set(day.date, null);
      } else {
        const covered = unionMinutes([
          ...exam.participation.map((span) => ({
            start: Date.parse(span.start),
            end: Date.parse(span.end),
          })),
          ...entry.pauses,
        ]);
        const credit = covered + exam.travelToWorkMinutes + exam.travelFromWorkMinutes;
        if (covered < (entry.end - entry.start) / 60000) {
          emit(
            "EXAM_INTERVAL_GAP_UNCLASSIFIED",
            "INCOMPLETE",
            "Zwischen bestätigten Teilnahme- und Pausenintervallen bleibt eine Zeitspanne ungeklärt.",
          );
          daily.set(day.date, null);
        }
        const overlappingWork = day.workEntries.some(
          (work) => work.start < entry.end && entry.start < work.end,
        );
        if (overlappingWork) {
          emit(
            "EXAM_RELEASE_OVERLAP",
            "WARNING",
            "Ein Dienst überschneidet sich mit der bestätigten Prüfungsteilnahme; Freistellung ist nicht gewährleistet.",
          );
          daily.set(day.date, null);
        } else if (daily.get(day.date) !== null) {
          const previous = daily.get(day.date);
          daily.set(
            day.date,
            previous === null || previous === undefined ? null : previous + credit,
          );
        }
        if (locatedExamTravel(entry, day.entries) === null)
          emit(
            "EXAM_TRAVEL_POSITION",
            "INCOMPLETE",
            "Die notwendige Wegezeit ist angerechnet, aber nicht zeitlich verortet; Ruhe- und Pausenlage bleiben offen.",
          );
      }
      if (exam.kind !== "EXAM" || exam.finalWritten === false) continue;
      if (exam.finalWritten === null) {
        emit(
          "EXAM_FINAL_STATUS_UNKNOWN",
          "INCOMPLETE",
          "Ob es eine schriftliche Abschlussprüfung ist, wurde nicht bestätigt.",
        );
        continue;
      }
      if (exam.precedingWorkDate === null) {
        emit(
          "EXAM_PRECEDING_WORKDAY_UNKNOWN",
          "INCOMPLETE",
          "Der unmittelbar vorausgehende Arbeitstag ist unbekannt; er wird nicht als vorheriger Kalendertag geraten.",
        );
        continue;
      }
      const prior = byDate.get(exam.precedingWorkDate);
      if (!prior || prior.legal.engineContractVersion < 10 || prior.rules.exam === undefined) {
        emit(
          "EXAM_PRECEDING_DAY_PENDING",
          "INCOMPLETE",
          "Der bestätigte Arbeitstag vor der schriftlichen Abschlussprüfung ist im unterstützten Jugend-Regelstand nicht vollständig prüfbar.",
        );
        daily.set(exam.precedingWorkDate, null);
        continue;
      }
      if (prior.workEntries.length)
        report(
          prior,
          prior.date,
          "EXAM_PRECEDING_WORKDAY_NOT_FREE",
          "WARNING",
          "Am bestätigten Arbeitstag vor der schriftlichen Abschlussprüfung ist ein Dienst geplant; die Freistellung ist nicht gewährleistet.",
          "§ 10 Abs. 1 Nr. 2 JArbSchG",
          [entry.shift.id, ...prior.workEntries.map((work) => work.shift.id)],
        );
      if (prior.schoolEntries.length || prior.entries.some((item) => item.exam != null)) {
        report(
          prior,
          prior.date,
          "EXAM_PRECEDING_DAY_COMBINATION",
          "INCOMPLETE",
          "Weitere Ausbildungszeit am vorausgehenden Arbeitstag benötigt eine gesonderte Anrechnungsprüfung.",
          "§ 10 Abs. 2 Nr. 2 JArbSchG",
          [entry.shift.id],
        );
        daily.set(prior.date, null);
      } else if (prior.facts?.averageDailyTrainingMinutes === null || prior.facts === null) {
        report(
          prior,
          prior.date,
          "EXAM_PRECEDING_AVERAGE_MISSING",
          "INCOMPLETE",
          "Die bestätigte durchschnittliche tägliche Arbeitszeit für den vorausgehenden Arbeitstag fehlt.",
          "§ 10 Abs. 2 Nr. 2 JArbSchG",
          [entry.shift.id],
        );
        daily.set(prior.date, null);
      } else {
        daily.set(prior.date, prior.facts.averageDailyTrainingMinutes);
      }
    }
  }
  return daily;
}
