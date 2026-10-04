import { Temporal } from "@js-temporal/polyfill";
import { trainingProfileForDate } from "@/domain/training-data";
import { validateYouthContext } from "@/domain/youth-context";
import { requireRemunerationDate } from "@/domain/remuneration-profile";
import type {
  TrainingTimeDay,
  YouthDay,
  YouthFinding,
  YouthInput,
  YouthReport,
  YouthResult,
} from "./youth-types";
import { youthEntries, weekStart, clockMinutes } from "./youth-intervals";
import { youthSchoolCredits } from "./youth-school";
import { checkYouthDay } from "./youth-daily";
import { checkYouthWeeks } from "./youth-weekly";
import { calculateAdultTraining } from "./adult-training";
import { trainingActivityBounds } from "./youth-school-travel";
import { assessYouthExams } from "./youth-exam";

function validateFacts(input: YouthInput): boolean {
  const seen = new Set<string>();
  try {
    for (const facts of input.facts) {
      requireRemunerationDate(facts.effectiveFrom);
      if (seen.has(facts.effectiveFrom)) return false;
      seen.add(facts.effectiveFrom);
      const { effectiveFrom: _effectiveFrom, ...context } = facts;
      validateYouthContext(context);
    }
    return true;
  } catch {
    return false;
  }
}
export function calculateYouthCompliance(input: YouthInput): YouthResult {
  const first = Temporal.PlainDate.from(input.month + "-01"),
    last = first.add({ months: 1 });
  const findings: YouthFinding[] = [],
    keys = new Set<string>(),
    days: YouthDay[] = [];
  const report: YouthReport = (day, date, code, severity, message, section, shiftIds = []) => {
    if (!date.startsWith(input.month)) return;
    const key = `${date}|${code}`;
    if (keys.has(key)) return;
    keys.add(key);
    findings.push({
      date,
      code,
      severity:
        severity === "WARNING" && day && day.facts?.otherExceptions !== false
          ? "INCOMPLETE"
          : severity,
      message,
      section,
      shiftIds,
      packageId: day?.legal.packageId ?? null,
      versionId: day?.legal.versionId ?? null,
      sourceIds:
        code.startsWith("EXAM") && day?.rules.exam
          ? day.rules.exam.sourceIds
          : (day?.rules.sourceIds ?? []),
    });
  };
  if (!validateFacts(input)) {
    report(
      null,
      first.toString(),
      "INVALID_FACTS",
      "INCOMPLETE",
      "Die bestätigten Prüfungsangaben sind ungültig. Bitte neu prüfen.",
      "JArbSchG",
    );
    return { status: "INCOMPLETE", findings, assessedDates: [], trainingTimeDays: [] };
  }
  const preparationIssues: { date: string; code: string; message: string; id: string }[] = [];
  const entries = youthEntries(input, (date, code, message, id) =>
    preparationIssues.push({ date, code, message, id }),
  );
  for (
    let d = first.subtract({ days: 14 });
    Temporal.PlainDate.compare(d, last.add({ days: 14 })) < 0;
    d = d.add({ days: 1 })
  ) {
    const date = d.toString(),
      saved = trainingProfileForDate(input.profiles, date);
    if (!saved?.data.birthDate) {
      report(
        null,
        date,
        "BIRTH_DATE_MISSING",
        "INCOMPLETE",
        "Ein bestätigtes Geburtsdatum mit passendem Gültigkeitszeitraum fehlt.",
        "§ 2 JArbSchG",
      );
      continue;
    }
    const resolved = input.ruleResolver.resolveLegal(date);
    if (
      !resolved.ok ||
      resolved.value.rules.youthProtection === undefined ||
      resolved.value.engineContractVersion < 9
    ) {
      report(
        null,
        date,
        "YOUTH_RULES_MISSING",
        "INCOMPLETE",
        "Für diesen Tag ist kein unterstütztes Jugendregelpaket im aktiven Katalog verfügbar.",
        "JArbSchG",
      );
      continue;
    }
    const legal = resolved.value,
      rules = legal.rules.youthProtection!;
    const age = Temporal.PlainDate.from(saved.data.birthDate).until(d, {
      largestUnit: "years",
    }).years;
    if (age >= rules.adultAge) {
      continue;
    }
    const facts =
      [...input.facts]
        .filter((f) => f.effectiveFrom <= date)
        .sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom))[0] ?? null;
    const start = d.toZonedDateTime(input.profile.timeZone).epochMilliseconds,
      end = d.add({ days: 1 }).toZonedDateTime(input.profile.timeZone).epochMilliseconds;
    const current = entries
      .filter((e) => e.start < end && e.end > start)
      .map((e) => ({
        ...e,
        start: Math.max(start, e.start),
        end: Math.min(end, e.end),
        pauses:
          e.pauses === null
            ? null
            : e.pauses
                .filter((p) => p.start < end && p.end > start)
                .map((p) => ({ ...p, start: Math.max(start, p.start), end: Math.min(end, p.end) })),
      }));
    const day: YouthDay = {
      date,
      age,
      facts,
      rules,
      legal,
      entries: current,
      workEntries: current.filter((e) => e.school === null && e.exam == null),
      schoolEntries: current.filter((e) => e.school !== null),
      week: weekStart(date),
    };
    if (age < rules.minimumAge || saved.data.fullTimeCompulsorySchooling !== false) {
      report(
        day,
        date,
        "SPECIAL_AGE_OR_SCHOOL_DUTY",
        "INCOMPLETE",
        "Unter 15 Jahren, bei Vollzeitschulpflicht oder ungeklärter Schulpflicht ist keine vereinfachte Jugend-Standardprüfung möglich.",
        "§§ 2, 5–7 JArbSchG",
      );
      continue;
    }
    days.push(day);
    for (const issue of preparationIssues.filter((i) => i.date === date))
      report(day, date, issue.code, "INCOMPLETE", issue.message, "§§ 4, 11 JArbSchG", [issue.id]);
  }
  const schoolCredits = youthSchoolCredits(days, report, input.month);
  const dailyCredits = assessYouthExams(days, schoolCredits.daily, report),
    blockCredits = new Map(schoolCredits.blockWeekly);
  // Invalid/missing service times must not disappear as zero hours, including at a month boundary.
  for (const issue of preparationIssues) {
    dailyCredits.set(issue.date, null);
    if (blockCredits.has(weekStart(issue.date))) blockCredits.set(weekStart(issue.date), null);
  }
  const credits = { daily: dailyCredits, blockWeekly: blockCredits },
    byDate = new Map(days.map((d) => [d.date, d]));
  for (const day of days) {
    const nextDate = Temporal.PlainDate.from(day.date).add({ days: 1 }).toString();
    // Early school remains relevant on the next day even when that day is the 18th birthday.
    const nextEarlySchool = entries.some(
      (e) =>
        e.school !== null &&
        e.shift.date === nextDate &&
        clockMinutes(e.start, input.profile.timeZone) < day.rules.school.earlyStartMinute,
    );
    const shortened =
      day.facts?.shortenedWorkingDays.filter((date) => {
        const other = byDate.get(date),
          minutes = credits.daily.get(date);
        return (
          other !== undefined &&
          other.workEntries.length > 0 &&
          minutes !== null &&
          minutes !== undefined &&
          minutes < day.rules.workingTime.dailyMinutes
        );
      }) ?? [];
    checkYouthDay(
      { ...day, facts: day.facts ? { ...day.facts, shortenedWorkingDays: shortened } : null },
      input,
      report,
      credits.daily.get(day.date) ?? null,
      nextEarlySchool,
    );
  }
  // An overnight service is one occupation period, not two shifts separated by a fictitious zero-hour rest.
  const periodDates = [...new Set(entries.map((e) => e.shift.date))].sort();
  for (let i = 1; i < periodDates.length; i++) {
    const before = entries.filter((e) => e.shift.date === periodDates[i - 1]),
      after = entries.filter((e) => e.shift.date === periodDates[i]);
    const target = byDate.get(periodDates[i]);
    if (!target) continue;
    const beforeBounds = before.map((e) => trainingActivityBounds(e, entries));
    const afterBounds = after.map((e) => trainingActivityBounds(e, entries));
    const rest =
      (Math.min(...afterBounds.map((e) => e.start)) - Math.max(...beforeBounds.map((e) => e.end))) /
      60000;
    if (rest < target.rules.restMinutes)
      report(
        target,
        target.date,
        "DAILY_REST",
        "WARNING",
        `Zwischen den Beschäftigungstagen liegen weniger als ${target.rules.restMinutes} Minuten ununterbrochene Freizeit.`,
        "§ 13 JArbSchG",
        [...before, ...after].map((e) => e.shift.id),
      );
  }
  checkYouthWeeks(days, credits, input, report);
  const adultTraining = calculateAdultTraining(input, entries, preparationIssues);
  findings.push(...adultTraining.findings);
  const activityDates = new Set<string>();
  for (const entry of entries) {
    if (entry.school !== null || entry.exam != null) activityDates.add(entry.shift.date);
    if (
      entry.exam?.kind === "EXAM" &&
      entry.exam.finalWritten === true &&
      entry.exam.precedingWorkDate
    ) {
      const training = trainingProfileForDate(input.profiles, entry.shift.date)?.data;
      const age = training?.birthDate
        ? Temporal.PlainDate.from(training.birthDate).until(entry.shift.date, {
            largestUnit: "years",
          }).years
        : null;
      if (age !== null && (age < 18 || training?.training?.legalBasis === "BBIG"))
        activityDates.add(entry.exam.precedingWorkDate);
    }
  }
  const trainingTimeDays = [...activityDates]
    .filter((date) => date.startsWith(input.month))
    .sort()
    .map((date) => {
      const saved = trainingProfileForDate(input.profiles, date)?.data;
      const age = saved?.birthDate
        ? Temporal.PlainDate.from(saved.birthDate).until(date, { largestUnit: "years" }).years
        : null;
      const basis: TrainingTimeDay["basis"] =
        age !== null && age < 18
          ? "JARBSCHG"
          : age !== null && saved?.status === "training" && saved.training?.legalBasis === "BBIG"
            ? "BBIG"
            : age !== null && saved?.status === "training" && saved.training?.legalBasis === "PFLBG"
              ? "PFLBG"
              : "UNKNOWN";
      return {
        date,
        basis,
        minutes:
          basis === "JARBSCHG"
            ? (credits.daily.get(date) ?? null)
            : basis === "UNKNOWN"
              ? null
              : (adultTraining.dailyCredits.get(date) ?? null),
      };
    });
  const assessedDates = [
    ...days.filter((d) => d.date.startsWith(input.month)).map((d) => d.date),
    ...adultTraining.assessedDates,
  ].sort();
  return {
    status: findings.some((f) => f.severity === "INCOMPLETE")
      ? "INCOMPLETE"
      : findings.some((f) => f.severity === "WARNING")
        ? "FINDINGS"
        : assessedDates.length
          ? "NO_FINDINGS"
          : "NOT_APPLICABLE",
    findings: findings.sort((a, b) => a.date.localeCompare(b.date) || a.code.localeCompare(b.code)),
    assessedDates,
    trainingTimeDays,
  };
}
