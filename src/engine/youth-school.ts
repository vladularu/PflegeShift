import type { YouthDay, YouthReport } from "./youth-types";
import { unionMinutes, workSpans } from "./youth-intervals";

export interface YouthCredits {
  readonly daily: ReadonlyMap<string, number | null>;
  readonly blockWeekly: ReadonlyMap<string, number | null>;
}
export type SchoolCreditDay = Pick<
  YouthDay,
  "date" | "week" | "facts" | "schoolEntries" | "workEntries"
> & {
  readonly rules: {
    readonly school: YouthDay["rules"]["school"];
    readonly breaks: Pick<YouthDay["rules"]["breaks"], "minimumSegmentMinutes">;
  };
};
type SchoolReport<D> = (
  day: D,
  date: string,
  code: string,
  severity: Parameters<YouthReport>[3],
  message: string,
  section: string,
  shiftIds?: readonly string[],
) => void;
export function youthSchoolCredits<D extends SchoolCreditDay>(
  days: readonly D[],
  report: SchoolReport<D>,
  month: string,
  section = "§ 9 JArbSchG",
  confirmedBlockActivity: "REVIEW" | "ALLOW" = "REVIEW",
): YouthCredits {
  const daily = new Map<string, number | null>(),
    blockWeekly = new Map<string, number | null>();
  const work = (day: D) =>
    day.workEntries.some((e) => e.pauses === null)
      ? null
      : unionMinutes(
          day.workEntries.flatMap((e) => workSpans(e, day.rules.breaks.minimumSegmentMinutes)),
        );
  for (const day of days) {
    let minutes = work(day);
    for (const e of day.schoolEntries) {
      const school = e.school!;
      if (
        school.travelToWorkMinutes === null ||
        school.travelFromWorkMinutes === null ||
        e.pauses === null
      ) {
        minutes = null;
        report(
          day,
          day.date,
          "SCHOOL_CREDIT_MISSING",
          "INCOMPLETE",
          "Für die Schul-Anrechnung fehlen bestätigte Pausen oder notwendige Wegezeiten.",
          section,
          [e.shift.id],
        );
      } else if (minutes !== null) {
        minutes +=
          unionMinutes([
            ...school.lessons.map((l) => ({ start: Date.parse(l.start), end: Date.parse(l.end) })),
            ...e.pauses.filter((p) => p.start >= e.start && p.end <= e.end),
          ]) +
          school.travelToWorkMinutes +
          school.travelFromWorkMinutes;
      }
    }
    daily.set(day.date, minutes);
  }
  const weeks = new Map<string, D[]>();
  for (const day of days) weeks.set(day.week, [...(weeks.get(day.week) ?? []), day]);
  for (const [week, weekDays] of weeks) {
    const schoolDays = weekDays.filter((d) => d.schoolEntries.length);
    const lessonCount = (day: D) =>
      day.schoolEntries.reduce(
        (count, e) =>
          count +
          e.school!.lessons.filter(
            (l) =>
              (Date.parse(l.end) - Date.parse(l.start)) / 60000 >=
              day.rules.school.minimumLessonMinutes,
          ).length,
        0,
      );
    const blockDays = schoolDays.filter((d) =>
      d.schoolEntries.some((e) => e.school?.block !== null),
    );
    const first = schoolDays[0];
    if (!first) continue;
    const target = weekDays.find((d) => d.date.startsWith(month)) ?? first;
    const isBlock =
      blockDays.length >= first.rules.school.blockDays &&
      blockDays.reduce((n, d) => n + lessonCount(d), 0) >= first.rules.school.blockLessonCount;
    if (isBlock) {
      const weekly = first.facts?.averageWeeklyTrainingMinutes ?? null;
      const actualWork = weekDays.map(work);
      const completeWork = actualWork.every((n) => n !== null);
      const added = completeWork ? actualWork.reduce<number>((sum, n) => sum + n!, 0) : null;
      blockWeekly.set(week, weekly === null || added === null ? null : weekly + added);
      for (const day of blockDays)
        daily.set(
          day.date,
          day.facts?.averageDailyTrainingMinutes == null || work(day) === null
            ? null
            : day.facts.averageDailyTrainingMinutes + work(day)!,
        );
      if (weekly === null || blockDays.some((d) => d.facts?.averageDailyTrainingMinutes == null))
        report(
          target,
          target.date,
          "BLOCK_AVERAGE_MISSING",
          "INCOMPLETE",
          "Für die Anrechnung des Schulblocks fehlen bestätigte durchschnittliche Ausbildungszeiten.",
          section,
        );
      if (blockDays.some((d) => d.facts?.averageWeeklyTrainingMinutes !== weekly)) {
        blockWeekly.set(week, null);
        report(
          target,
          target.date,
          "BLOCK_AVERAGE_CHANGED",
          "INCOMPLETE",
          "Die Ausbildungszeit ändert sich innerhalb der Blockwoche. Die Anrechnungsgrundlage muss geklärt werden.",
          section,
        );
      }
      const extra = weekDays.flatMap((d) => d.workEntries.map((e) => ({ day: d, entry: e })));
      if (extra.length) {
        const allConfirmed = extra.every(
          ({ day, entry }) =>
            entry.blockTrainingBinding !== null &&
            day.facts?.blockTrainingShiftIds.includes(entry.blockTrainingBinding),
        );
        if (!(
          confirmedBlockActivity === "ALLOW" &&
          allConfirmed &&
          added !== null &&
          added <= first.rules.school.additionalTrainingMinutes
        ))
          report(
            target,
            target.date,
            "WORK_IN_SCHOOL_BLOCK",
            allConfirmed && added !== null && added <= first.rules.school.additionalTrainingMinutes
              ? "INCOMPLETE"
              : "WARNING",
            allConfirmed
              ? "Zusätzliche Ausbildungszeit im Schulblock: Grenze und Anrechnung einschließlich tariflicher Ausbildungszeit fachlich prüfen."
              : "Beschäftigung im geschützten Schulblock ist nur als ausdrücklich bestätigte zusätzliche Ausbildungsveranstaltung im gesetzlichen Umfang möglich.",
            section,
            extra.map(({ entry }) => entry.shift.id),
          );
      }
      continue;
    }
    const candidates = schoolDays.filter(
      (d) => lessonCount(d) >= d.rules.school.protectedDayLessonCount,
    );
    const protectedDay = candidates.find((d) => !d.workEntries.length) ?? candidates[0];
    if (protectedDay) {
      const average = protectedDay.facts?.averageDailyTrainingMinutes ?? null,
        actual = work(protectedDay);
      daily.set(protectedDay.date, average === null || actual === null ? null : average + actual);
      if (average === null)
        report(
          protectedDay,
          protectedDay.date,
          "SCHOOL_AVERAGE_MISSING",
          "INCOMPLETE",
          "Die durchschnittliche tägliche Ausbildungszeit für den geschützten Schultag fehlt.",
          section,
        );
      if (protectedDay.workEntries.length)
        report(
          protectedDay,
          protectedDay.date,
          "PROTECTED_SCHOOL_DAY",
          "WARNING",
          "Mindestens einer der langen Berufsschultage dieser Woche muss von zusätzlicher Beschäftigung frei bleiben.",
          section,
          protectedDay.workEntries.map((e) => e.shift.id),
        );
    }
  }
  return { daily, blockWeekly };
}
