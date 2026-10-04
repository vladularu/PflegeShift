import { Temporal } from "@js-temporal/polyfill";
import { trainingProfileForDate, type TrainingProfileData } from "@/domain/training-data";
import type { RuleLegalPackage } from "@/rules/contracts.generated";
import { clockMinutes, unionMinutes, weekStart } from "./youth-intervals";
import { youthSchoolCredits, type SchoolCreditDay } from "./youth-school";
import type { YouthEntry, YouthFinding, YouthInput } from "./youth-types";

interface TrainingDay extends SchoolCreditDay {
  readonly entries: readonly YouthEntry[];
  readonly legal: RuleLegalPackage;
  readonly training: TrainingProfileData;
  readonly adult: boolean;
}
export interface AdultTrainingResult {
  readonly findings: readonly YouthFinding[];
  readonly dailyCredits: ReadonlyMap<string, number | null>;
  readonly blockWeeklyCredits: ReadonlyMap<string, number | null>;
  readonly assessedDates: readonly string[];
}
/** Adult training release/credit only; never applies youth daily limits or rest exceptions. */
export function calculateAdultTraining(
  input: YouthInput,
  entries: readonly YouthEntry[],
  problems: readonly { date: string; code: string; message: string; id: string }[] = [],
): AdultTrainingResult {
  const first = Temporal.PlainDate.from(input.month + "-01"),
    last = first.add({ months: 1 });
  const days: TrainingDay[] = [],
    findings: YouthFinding[] = [],
    keys = new Set<string>();
  const dailyCredits = new Map<string, number | null>(),
    blockWeeklyCredits = new Map<string, number | null>();
  function report(
    day: TrainingDay | null,
    date: string,
    code: string,
    severity: YouthFinding["severity"],
    message: string,
    section: string,
    shiftIds: readonly string[] = [],
  ) {
    if (day && !day.adult && (code.startsWith("BLOCK_") || code === "WORK_IN_SCHOOL_BLOCK")) {
      const target = days.find(
        (d) => d.week === day!.week && d.adult && d.date.startsWith(input.month),
      );
      if (target) {
        day = target;
        date = target.date;
      }
    }
    if (!date.startsWith(input.month) || (day && !day.adult) || keys.has(date + code)) return;
    keys.add(date + code);
    const basis = day?.training.training?.legalBasis;
    findings.push({
      code,
      severity,
      date,
      message,
      section,
      shiftIds,
      packageId: day?.legal.packageId ?? null,
      versionId: day?.legal.versionId ?? null,
      sourceIds:
        basis === "BBIG"
          ? code.startsWith("EXAM") && day!.legal.rules.adultTraining!.bbig.exam
            ? day!.legal.rules.adultTraining!.bbig.exam.sourceIds
            : day!.legal.rules.adultTraining!.bbig.sourceIds
          : basis === "PFLBG"
            ? day!.legal.rules.adultTraining!.pflbg.sourceIds
            : [],
    });
  }
  for (
    let date = first.subtract({ days: 7 });
    Temporal.PlainDate.compare(date, last.add({ days: 7 })) < 0;
    date = date.add({ days: 1 })
  ) {
    const id = date.toString(),
      training = trainingProfileForDate(input.profiles, id)?.data;
    if (!training || training.status !== "training" || !training.birthDate) continue;
    const age = Temporal.PlainDate.from(training.birthDate).until(date, {
      largestUnit: "years",
    }).years;
    const resolution = input.ruleResolver.resolveLegal(id);
    if (!resolution.ok || !resolution.value.rules.adultTraining) {
      if (age >= 18)
        report(
          null,
          id,
          "TRAINING_RULES_MISSING",
          "INCOMPLETE",
          "Für die Ausbildungsgrundlage fehlt ein unterstützter Regelstand im aktiven Katalog.",
          "Ausbildungsrecht",
        );
      continue;
    }
    const legal = resolution.value,
      policy = legal.rules.adultTraining!;
    const current = entries.filter((e) => e.shift.date === id);
    const day: TrainingDay = {
      date: id,
      week: weekStart(id),
      entries: current,
      training,
      adult: age >= policy.minimumAge,
      legal,
      facts:
        [...input.facts]
          .filter((f) => f.effectiveFrom <= id)
          .sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom))[0] ?? null,
      schoolEntries: current.filter((e) => e.school !== null),
      workEntries: current.filter((e) => e.school === null && e.exam == null),
      rules: { school: policy.bbig.school, breaks: legal.rules.breaks },
    };
    if (training.training!.startedOn > id) {
      report(
        day,
        id,
        "TRAINING_NOT_STARTED",
        "INCOMPLETE",
        "Der Ausbildungsstatus liegt vor dem angegebenen Ausbildungsbeginn.",
        "Ausbildungsgrundlage",
      );
      continue;
    }
    days.push(day);
    const basis = training.training!.legalBasis;
    if (basis === "UNKNOWN" || basis === "OTHER") {
      report(
        day,
        id,
        "TRAINING_BASIS_UNKNOWN",
        "INCOMPLETE",
        "Die Ausbildungsgrundlage ist nicht unterstützt oder noch ungeklärt. BBiG-Regeln werden nicht pauschal übernommen.",
        "Ausbildungsgrundlage",
      );
      continue;
    }
    const section = basis === "BBIG" ? "§ 15 BBiG" : "§§ 18, 63 PflBG";
    for (const problem of problems.filter((p) => p.date === id))
      report(day, id, problem.code, "INCOMPLETE", problem.message, section, [problem.id]);
    if (
      day.facts?.allWorkAndSchoolRecorded !== true ||
      input.profile.allEmploymentWorkRecorded !== true
    )
      report(
        day,
        id,
        "TRAINING_SCOPE_INCOMPLETE",
        "INCOMPLETE",
        "Bitte bestätigen, dass alle Beschäftigungen und Ausbildungsveranstaltungen eingetragen sind.",
        section,
      );
    for (const school of day.schoolEntries) {
      const overlaps = day.workEntries.filter(
        (work) => work.start < school.end && work.end > school.start,
      );
      if (overlaps.length && (basis === "BBIG" || policy.pflbg.schoolRelease))
        report(
          day,
          id,
          "SCHOOL_RELEASE_OVERLAP",
          "WARNING",
          "Dienst und Unterricht überschneiden sich. Die Freistellung für die Teilnahme ist nicht gewährleistet.",
          section,
          [school.shift.id, ...overlaps.map((e) => e.shift.id)],
        );
      if (
        basis === "BBIG" &&
        clockMinutes(school.start, input.profile.timeZone) < policy.bbig.school.earlyStartMinute &&
        day.workEntries.some((work) => work.start < school.start)
      )
        report(
          day,
          id,
          "WORK_BEFORE_EARLY_SCHOOL",
          "WARNING",
          "Vor dem früh beginnenden Berufsschulunterricht ist keine Beschäftigung zulässig.",
          section,
          [school.shift.id, ...day.workEntries.map((e) => e.shift.id)],
        );
      if (school.school!.travelToWorkMinutes !== 0 || school.school!.travelFromWorkMinutes !== 0)
        report(
          day,
          id,
          "SCHOOL_TRAVEL_POSITION",
          "INCOMPLETE",
          "Notwendige Schul-/Arbeitswege sind für Pausen und Ruhezeit noch zeitlich zu verorten. Die Dauer wird nicht als Ruhepause angenommen.",
          section,
          [school.shift.id],
        );
      if (basis === "PFLBG") {
        const actual = school.school!;
        const amount =
          school.pauses === null ||
          actual.travelToWorkMinutes === null ||
          actual.travelFromWorkMinutes === null
            ? null
            : unionMinutes([
                ...actual.lessons.map((l) => ({
                  start: Date.parse(l.start),
                  end: Date.parse(l.end),
                })),
                ...school.pauses,
              ]) +
              actual.travelToWorkMinutes +
              actual.travelFromWorkMinutes;
        const previous = dailyCredits.get(id);
        dailyCredits.set(
          id,
          amount === null || previous === null ? null : (previous ?? 0) + amount,
        );
        // PflBG does not supply the BBiG daily/block lump sums. Actual attendance is kept separately.
        if (amount === null)
          report(
            day,
            id,
            "SCHOOL_CREDIT_MISSING",
            "INCOMPLETE",
            "Für die dokumentierte Teilnahmezeit fehlen Pausen oder notwendige Wegezeiten.",
            section,
            [school.shift.id],
          );
        if (policy.pflbg.preparationTimeRequired && day.workEntries.length)
          report(
            day,
            id,
            "PFLBG_PREPARATION",
            "INCOMPLETE",
            "Bei zusätzlichem Dienst müssen erforderliche Lern- und Vorbereitungszeiten berücksichtigt sein. Es wird kein pauschaler BBiG-Freitag angenommen.",
            section,
            [school.shift.id, ...day.workEntries.map((e) => e.shift.id)],
          );
      }
    }
  }
  const bbigDays = days.filter((d) => d.training.training!.legalBasis === "BBIG");
  const credit = youthSchoolCredits(bbigDays, report, input.month, "§ 15 BBiG", "ALLOW");
  for (const [date, minutes] of credit.daily)
    if (bbigDays.find((d) => d.date === date)?.adult) dailyCredits.set(date, minutes);
  for (const [week, minutes] of credit.blockWeekly) blockWeeklyCredits.set(week, minutes);
  const byDate = new Map(days.map((day) => [day.date, day]));
  for (const day of days) {
    if (!day.adult) continue;
    for (const event of day.entries.filter((entry) => entry.exam != null)) {
      const exam = event.exam!;
      const basis = day.training.training!.legalBasis;
      const section = basis === "BBIG" ? "§ 15 BBiG" : "§§ 18, 63 PflBG";
      const emit = (code: string, severity: YouthFinding["severity"], message: string) =>
        report(day, day.date, code, severity, message, section, [event.shift.id]);
      const policy = day.legal.rules.adultTraining?.bbig.exam;
      if (basis !== "BBIG" || day.legal.engineContractVersion < 10 || !policy) {
        if (
          basis === "PFLBG" &&
          day.legal.rules.adultTraining?.pflbg.examRelease === true &&
          day.workEntries.some((work) => work.start < event.end && event.start < work.end)
        )
          emit(
            "EXAM_RELEASE_OVERLAP",
            "WARNING",
            "Ein Dienst überschneidet sich mit der Prüfung. Sofern § 18 PflBG gilt, ist die Freistellung nicht gewährleistet; Ausnahmen nach § 25 sind gesondert zu prüfen.",
          );
        emit(
          "EXAM_ASSESSMENT_PENDING",
          "INCOMPLETE",
          basis === "PFLBG"
            ? "Die Prüfungsfreistellung nach PflBG ist erfasst; eine BBiG-Anrechnung wird nicht unterstellt."
            : "Für diesen Ausbildungsgang fehlt ein unterstützter Prüfungs-Anrechnungsvertrag.",
        );
        dailyCredits.set(day.date, null);
        if (exam.kind === "EXAM" && exam.finalWritten === true) {
          if (basis === "BBIG" && exam.precedingWorkDate) {
            report(
              byDate.get(exam.precedingWorkDate) ?? day,
              exam.precedingWorkDate,
              "EXAM_PRECEDING_DAY_PENDING",
              "INCOMPLETE",
              "Der vorausgehende Arbeitstag der schriftlichen Abschlussprüfung benötigt eine gesonderte Freistellungsprüfung.",
              section,
              [event.shift.id],
            );
            dailyCredits.set(exam.precedingWorkDate, null);
          } else
            emit(
              basis === "PFLBG"
                ? "EXAM_PFLBG_PRECEDING_DAY_NOT_ASSUMED"
                : "EXAM_PRECEDING_WORKDAY_UNKNOWN",
              "INCOMPLETE",
              "Ein pauschaler freier Tag vor der Prüfung wird für diese Ausbildungsgrundlage nicht angenommen.",
            );
        }
        continue;
      }
      if (
        event.shift.startTime === null ||
        event.shift.endTime === null ||
        event.shift.endTime <= event.shift.startTime
      ) {
        emit(
          "EXAM_CROSS_DAY_UNSUPPORTED",
          "INCOMPLETE",
          "Eine Prüfung über Mitternacht wird ohne tagesgenaue Intervalle nicht angerechnet.",
        );
        dailyCredits.set(day.date, null);
        continue;
      }
      if (exam.requiredByRuleOrContract !== true) {
        emit(
          "EXAM_BASIS_UNCONFIRMED",
          "INCOMPLETE",
          "Die öffentlich-rechtliche oder vertragliche Grundlage der externen Teilnahme ist nicht bestätigt.",
        );
        dailyCredits.set(day.date, null);
      } else if (
        event.pauses === null ||
        exam.participation.length === 0 ||
        exam.travelToWorkMinutes === null ||
        exam.travelFromWorkMinutes === null
      ) {
        emit(
          "EXAM_CREDIT_MISSING",
          "INCOMPLETE",
          "Für die Anrechnung fehlen Teilnahme-, Pausen- oder notwendige Wegezeiten.",
        );
        dailyCredits.set(day.date, null);
      } else if (day.schoolEntries.length) {
        emit(
          "EXAM_SCHOOL_COMBINATION",
          "INCOMPLETE",
          "Prüfung und Berufsschule am selben Tag benötigen eine getrennte Anrechnungsprüfung.",
        );
        dailyCredits.set(day.date, null);
      } else if (day.entries.filter((entry) => entry.exam != null).length > 1) {
        emit(
          "EXAM_MULTIPLE_ENTRIES",
          "INCOMPLETE",
          "Mehrere Prüfungs- oder Ausbildungsmaßnahmen am selben Tag werden nicht doppelt angerechnet.",
        );
        dailyCredits.set(day.date, null);
      } else {
        const covered = unionMinutes([
          ...exam.participation.map((span) => ({
            start: Date.parse(span.start),
            end: Date.parse(span.end),
          })),
          ...event.pauses,
        ]);
        if (covered < (event.end - event.start) / 60000) {
          emit(
            "EXAM_INTERVAL_GAP_UNCLASSIFIED",
            "INCOMPLETE",
            "Zwischen Teilnahme und bestätigten Pausen bleibt eine Zeitspanne ungeklärt.",
          );
          dailyCredits.set(day.date, null);
        }
        if (day.workEntries.some((work) => work.start < event.end && event.start < work.end)) {
          emit(
            "EXAM_RELEASE_OVERLAP",
            "WARNING",
            "Ein Dienst überschneidet sich mit der bestätigten Prüfungsteilnahme.",
          );
          dailyCredits.set(day.date, null);
        } else if (dailyCredits.get(day.date) !== null) {
          const previous = dailyCredits.get(day.date);
          dailyCredits.set(
            day.date,
            (previous ?? 0) + covered + exam.travelToWorkMinutes + exam.travelFromWorkMinutes,
          );
        }
        if (exam.travelToWorkMinutes > 0 || exam.travelFromWorkMinutes > 0)
          emit(
            "EXAM_TRAVEL_POSITION",
            "INCOMPLETE",
            "Notwendige Wegezeit ist angerechnet, aber zeitlich nicht verortet.",
          );
      }
      if (blockWeeklyCredits.has(day.week)) {
        blockWeeklyCredits.set(day.week, null);
        emit(
          "EXAM_BLOCK_COMBINATION",
          "INCOMPLETE",
          "Prüfung und geschützter Schulblock benötigen eine gesonderte Wochenanrechnung.",
        );
      }
      if (exam.kind !== "EXAM" || exam.finalWritten === false) continue;
      if (exam.finalWritten === null || exam.precedingWorkDate === null) {
        emit(
          "EXAM_PRECEDING_WORKDAY_UNKNOWN",
          "INCOMPLETE",
          "Der Arbeitstag vor einer schriftlichen Abschlussprüfung ist nicht bestätigt.",
        );
        continue;
      }
      const prior = byDate.get(exam.precedingWorkDate);
      if (
        !prior?.adult ||
        prior.training.training?.legalBasis !== "BBIG" ||
        prior.legal.engineContractVersion < 10 ||
        !prior.legal.rules.adultTraining?.bbig.exam
      ) {
        emit(
          "EXAM_PRECEDING_DAY_PENDING",
          "INCOMPLETE",
          "Der vorausgehende Arbeitstag liegt außerhalb einer bestätigten volljährigen BBiG-Regelgrundlage.",
        );
        dailyCredits.set(exam.precedingWorkDate, null);
        continue;
      }
      if (prior.workEntries.length)
        report(
          prior,
          prior.date,
          "EXAM_PRECEDING_WORKDAY_NOT_FREE",
          "WARNING",
          "Am bestätigten Arbeitstag vor der schriftlichen Abschlussprüfung ist ein Dienst geplant.",
          section,
          [event.shift.id, ...prior.workEntries.map((work) => work.shift.id)],
        );
      if (prior.schoolEntries.length || prior.entries.some((entry) => entry.exam != null)) {
        report(
          prior,
          prior.date,
          "EXAM_PRECEDING_DAY_COMBINATION",
          "INCOMPLETE",
          "Weitere Ausbildungszeit am vorausgehenden Arbeitstag benötigt eine gesonderte Anrechnungsprüfung.",
          section,
          [event.shift.id],
        );
        dailyCredits.set(prior.date, null);
      } else if (prior.facts?.averageDailyTrainingMinutes == null) {
        report(
          prior,
          prior.date,
          "EXAM_PRECEDING_AVERAGE_MISSING",
          "INCOMPLETE",
          "Die bestätigte durchschnittliche tägliche Ausbildungszeit fehlt.",
          section,
          [event.shift.id],
        );
        dailyCredits.set(prior.date, null);
      } else {
        dailyCredits.set(prior.date, prior.facts.averageDailyTrainingMinutes);
      }
    }
  }
  for (const problem of problems)
    if (days.some((d) => d.adult && d.date === problem.date)) {
      dailyCredits.set(problem.date, null);
      if (blockWeeklyCredits.has(weekStart(problem.date)))
        blockWeeklyCredits.set(weekStart(problem.date), null);
    }
  return {
    findings,
    dailyCredits,
    blockWeeklyCredits,
    assessedDates: days.filter((d) => d.adult && d.date.startsWith(input.month)).map((d) => d.date),
  };
}
