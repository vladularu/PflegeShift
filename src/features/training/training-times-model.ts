import { Temporal } from "@js-temporal/polyfill";
import type { CalendarEntry, ShiftEntry } from "@/domain/types";
import {
  requireShiftTrainingParent,
  validateShiftTrainingData,
  type ShiftTrainingData,
  type TrainingInterval,
} from "@/domain/training-data";
import {
  formatRemunerationDate,
  parseRemunerationDateInput,
} from "@/features/settings/remuneration-editor-values";

export type Occurrence = "unknown" | "earlier" | "later";
export interface IntervalDraft {
  readonly start: string;
  readonly end: string;
  readonly startNextDay: boolean;
  readonly endNextDay: boolean;
  readonly startOccurrence: Occurrence;
  readonly endOccurrence: Occurrence;
}
export interface TrainingTimesDraft {
  readonly pauseMode: "unknown" | "none" | "intervals";
  readonly pauses: readonly IntervalDraft[];
  readonly school: boolean;
  readonly lessons: readonly IntervalDraft[];
  readonly travelToWork: string;
  readonly travelFromWork: string;
  readonly travelToWorkInterval: IntervalDraft | null;
  readonly travelFromWorkInterval: IntervalDraft | null;
  readonly block: boolean;
  readonly blockStart: string;
  readonly blockEnd: string;
  readonly examKind: "none" | "EXAM" | "EXTERNAL_TRAINING";
  readonly examRequired: "unknown" | "yes" | "no";
  readonly examFinalWritten: "unknown" | "yes" | "no";
  readonly examPrecedingWorkDate: string;
  readonly examParticipation: readonly IntervalDraft[];
  readonly examTravelToWork: string;
  readonly examTravelFromWork: string;
  readonly examTravelToWorkInterval: IntervalDraft | null;
  readonly examTravelFromWorkInterval: IntervalDraft | null;
}
export function emptyInterval(): IntervalDraft {
  return {
    start: "",
    end: "",
    startNextDay: false,
    endNextDay: false,
    startOccurrence: "unknown",
    endOccurrence: "unknown",
  };
}
function localTime(date: string, time: string, nextDay: boolean) {
  if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time))
    throw new Error("Uhrzeit bitte als HH:MM eingeben.");
  return Temporal.PlainDate.from(date)
    .add({ days: nextDay ? 1 : 0 })
    .toPlainDateTime(time);
}
export function isAmbiguousTime(
  date: string,
  time: string,
  nextDay: boolean,
  timeZone: string,
): boolean {
  try {
    const local = localTime(date, time, nextDay);
    const earlier = local.toZonedDateTime(timeZone, { disambiguation: "earlier" });
    const later = local.toZonedDateTime(timeZone, { disambiguation: "later" });
    return (
      earlier.toPlainDateTime().equals(local) &&
      later.toPlainDateTime().equals(local) &&
      earlier.epochMilliseconds !== later.epochMilliseconds
    );
  } catch {
    return false;
  }
}
function instant(
  date: string,
  time: string,
  nextDay: boolean,
  occurrence: Occurrence,
  timeZone: string,
): string {
  const local = localTime(date, time, nextDay);
  const earlier = local.toZonedDateTime(timeZone, { disambiguation: "earlier" });
  const later = local.toZonedDateTime(timeZone, { disambiguation: "later" });
  if (!earlier.toPlainDateTime().equals(local) || !later.toPlainDateTime().equals(local))
    throw new Error("Diese Uhrzeit existiert wegen der Zeitumstellung nicht.");
  if (earlier.epochMilliseconds !== later.epochMilliseconds && occurrence === "unknown")
    throw new Error("Diese Uhrzeit kommt zweimal vor. Bitte erstes oder zweites Vorkommen wählen.");
  return (occurrence === "later" ? later : earlier).toInstant().toString();
}
function intervalsFromDraft(
  values: readonly IntervalDraft[],
  shift: ShiftEntry,
  timeZone: string,
): TrainingInterval[] {
  return values.map((v) => ({
    start: instant(shift.date, v.start, v.startNextDay, v.startOccurrence, timeZone),
    end: instant(shift.date, v.end, v.endNextDay, v.endOccurrence, timeZone),
  }));
}
function draftInterval(
  value: TrainingInterval,
  shiftDate: string,
  timeZone: string,
): IntervalDraft {
  const start = Temporal.Instant.from(value.start).toZonedDateTimeISO(timeZone);
  const end = Temporal.Instant.from(value.end).toZonedDateTimeISO(timeZone);
  function occurrence(z: Temporal.ZonedDateTime): Occurrence {
    if (
      !isAmbiguousTime(
        z.toPlainDate().toString(),
        z.toPlainTime().toString({ smallestUnit: "minute" }),
        false,
        timeZone,
      )
    )
      return "unknown";
    return z.toPlainDateTime().toZonedDateTime(timeZone, { disambiguation: "earlier" })
      .epochMilliseconds === z.epochMilliseconds
      ? "earlier"
      : "later";
  }
  return {
    start: start.toPlainTime().toString({ smallestUnit: "minute" }),
    end: end.toPlainTime().toString({ smallestUnit: "minute" }),
    startNextDay: start.toPlainDate().toString() !== shiftDate,
    endNextDay: end.toPlainDate().toString() !== shiftDate,
    startOccurrence: occurrence(start),
    endOccurrence: occurrence(end),
  };
}
export function trainingTimesDraft(
  data: ShiftTrainingData | null,
  shift: ShiftEntry,
  timeZone: string,
): TrainingTimesDraft {
  return {
    pauseMode: data?.pauses == null ? "unknown" : data.pauses.length === 0 ? "none" : "intervals",
    pauses: data?.pauses?.map((p) => draftInterval(p, shift.date, timeZone)) ?? [],
    school: data?.school != null,
    lessons: data?.school?.lessons.map((p) => draftInterval(p, shift.date, timeZone)) ?? [],
    travelToWork: data?.school?.travelToWorkMinutes?.toString() ?? "",
    travelFromWork: data?.school?.travelFromWorkMinutes?.toString() ?? "",
    travelToWorkInterval: data?.school?.travelToWorkInterval
      ? draftInterval(data.school.travelToWorkInterval, shift.date, timeZone)
      : null,
    travelFromWorkInterval: data?.school?.travelFromWorkInterval
      ? draftInterval(data.school.travelFromWorkInterval, shift.date, timeZone)
      : null,
    block: data?.school?.block != null,
    blockStart: data?.school?.block ? formatRemunerationDate(data.school.block.startDate) : "",
    blockEnd: data?.school?.block ? formatRemunerationDate(data.school.block.endDate) : "",
    examKind: data?.exam?.kind ?? "none",
    examRequired:
      data?.exam?.requiredByRuleOrContract == null
        ? "unknown"
        : data.exam.requiredByRuleOrContract
          ? "yes"
          : "no",
    examFinalWritten:
      data?.exam?.finalWritten == null ? "unknown" : data.exam.finalWritten ? "yes" : "no",
    examPrecedingWorkDate: data?.exam?.precedingWorkDate
      ? formatRemunerationDate(data.exam.precedingWorkDate)
      : "",
    examParticipation:
      data?.exam?.participation.map((p) => draftInterval(p, shift.date, timeZone)) ?? [],
    examTravelToWork: data?.exam?.travelToWorkMinutes?.toString() ?? "",
    examTravelFromWork: data?.exam?.travelFromWorkMinutes?.toString() ?? "",
    examTravelToWorkInterval: data?.exam?.travelToWorkInterval
      ? draftInterval(data.exam.travelToWorkInterval, shift.date, timeZone)
      : null,
    examTravelFromWorkInterval: data?.exam?.travelFromWorkInterval
      ? draftInterval(data.exam.travelFromWorkInterval, shift.date, timeZone)
      : null,
  };
}
function minutes(value: string): number | null {
  if (!value.trim()) return null;
  if (!/^\d{1,3}$/.test(value.trim()) || Number(value) > 720)
    throw new Error("Wegezeit bitte in ganzen Minuten von 0 bis 720 eingeben.");
  return Number(value);
}
function inputDate(value: string, label: string): string {
  const parsed = parseRemunerationDateInput(value);
  if (parsed === null) throw new Error(`${label} bitte als TT.MM.JJJJ eingeben.`);
  return parsed;
}
export function trainingTimesFromDraft(
  values: TrainingTimesDraft,
  shift: ShiftEntry,
  timeZone: string,
): ShiftTrainingData {
  if (values.pauseMode === "intervals" && values.pauses.length === 0)
    throw new Error("Bitte eine Pause ergänzen oder ausdrücklich keine Pause bestätigen.");
  const locatedSchoolTravel =
    values.school &&
    (values.travelToWorkInterval !== null || values.travelFromWorkInterval !== null);
  const locatedExamTravel =
    values.examKind !== "none" &&
    (values.examTravelToWorkInterval !== null || values.examTravelFromWorkInterval !== null);
  const data = validateShiftTrainingData({
    version: locatedSchoolTravel || locatedExamTravel ? 3 : values.examKind === "none" ? 1 : 2,
    pauses:
      values.pauseMode === "unknown"
        ? null
        : values.pauseMode === "none"
          ? []
          : intervalsFromDraft(values.pauses, shift, timeZone),
    school: !values.school
      ? null
      : {
          lessons: intervalsFromDraft(values.lessons, shift, timeZone),
          travelToWorkMinutes: minutes(values.travelToWork),
          travelFromWorkMinutes: minutes(values.travelFromWork),
          ...(locatedSchoolTravel
            ? {
                travelToWorkInterval: values.travelToWorkInterval
                  ? intervalsFromDraft([values.travelToWorkInterval], shift, timeZone)[0]
                  : null,
                travelFromWorkInterval: values.travelFromWorkInterval
                  ? intervalsFromDraft([values.travelFromWorkInterval], shift, timeZone)[0]
                  : null,
              }
            : {}),
          block: values.block
            ? {
                startDate: inputDate(values.blockStart, "Blockbeginn"),
                endDate: inputDate(values.blockEnd, "Blockende"),
              }
            : null,
        },
    ...(values.examKind === "none"
      ? locatedSchoolTravel
        ? { exam: null }
        : {}
      : {
          exam: {
            kind: values.examKind,
            requiredByRuleOrContract:
              values.examRequired === "unknown" ? null : values.examRequired === "yes",
            finalWritten:
              values.examKind !== "EXAM" || values.examFinalWritten === "unknown"
                ? null
                : values.examFinalWritten === "yes",
            precedingWorkDate:
              values.examKind === "EXAM" &&
              values.examFinalWritten === "yes" &&
              values.examPrecedingWorkDate.trim()
                ? inputDate(values.examPrecedingWorkDate, "Vorherigen Arbeitstag")
                : null,
            participation: intervalsFromDraft(values.examParticipation, shift, timeZone),
            travelToWorkMinutes: minutes(values.examTravelToWork),
            travelFromWorkMinutes: minutes(values.examTravelFromWork),
            ...(locatedExamTravel
              ? {
                  travelToWorkInterval: values.examTravelToWorkInterval
                    ? intervalsFromDraft([values.examTravelToWorkInterval], shift, timeZone)[0]
                    : null,
                  travelFromWorkInterval: values.examTravelFromWorkInterval
                    ? intervalsFromDraft([values.examTravelFromWorkInterval], shift, timeZone)[0]
                    : null,
                }
              : {}),
          },
        }),
  });
  requireShiftTrainingParent(
    {
      shiftId: shift.id,
      shiftRevision: shift.revision,
      shiftDate: shift.date,
      shiftUpdatedAt: shift.updatedAt,
      timeZone,
      revision: 1,
      updatedAt: shift.updatedAt,
      data,
    },
    { ...shift, breakMinutes: pauseTotal(data) ?? shift.breakMinutes },
  );
  return data;
}
export function pauseTotal(data: ShiftTrainingData): number | null {
  return data.pauses === null
    ? null
    : data.pauses.reduce((sum, p) => sum + (Date.parse(p.end) - Date.parse(p.start)) / 60000, 0);
}
export function trainingTimeEntries(
  entries: readonly CalendarEntry[],
  month: string,
): ShiftEntry[] {
  return entries
    .filter(
      (e): e is ShiftEntry =>
        e.kind === "SHIFT" &&
        e.deletedAt === null &&
        !e.allDay &&
        e.startTime !== null &&
        e.endTime !== null &&
        e.date.startsWith(month + "-"),
    )
    .sort(
      (a, b) =>
        a.date.localeCompare(b.date) ||
        a.startTime!.localeCompare(b.startTime!) ||
        a.id.localeCompare(b.id),
    );
}
