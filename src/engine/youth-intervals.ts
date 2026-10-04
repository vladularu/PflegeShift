import { Temporal } from "@js-temporal/polyfill";
import {
  isCurrentShiftTraining,
  requireShiftTrainingParent,
  validateSavedShiftTraining,
} from "@/domain/training-data";
import { youthBlockShiftBinding } from "@/domain/youth-block-binding";
import type { YouthEntry, YouthInput, YouthSpan } from "./youth-types";

export function weekStart(date: string): string {
  const d = Temporal.PlainDate.from(date);
  return d.subtract({ days: d.dayOfWeek - 1 }).toString();
}
export function youthEntries(
  input: YouthInput,
  report: (date: string, code: string, message: string, shiftId: string) => void,
): YouthEntry[] {
  const first = Temporal.PlainDate.from(input.month + "-01")
    .subtract({ days: 14 })
    .toString();
  const last = Temporal.PlainDate.from(input.month + "-01")
    .add({ months: 1, days: 14 })
    .toString();
  return input.shifts
    .filter(
      (s) =>
        s.deletedAt === null &&
        s.date >= first &&
        s.date < last &&
        !["FREE", "VACATION", "SICK"].includes(s.type),
    )
    .flatMap((shift) => {
      if (shift.allDay || !shift.startTime || !shift.endTime) {
        report(
          shift.date,
          "TIMES_MISSING",
          "Für diesen Eintrag fehlen eindeutige Uhrzeiten.",
          shift.id,
        );
        return [];
      }
      try {
        const date = Temporal.PlainDate.from(shift.date),
          endDate = shift.endTime <= shift.startTime ? date.add({ days: 1 }) : date;
        const start = date
          .toPlainDateTime(shift.startTime)
          .toZonedDateTime(input.profile.timeZone, { disambiguation: "reject" }).epochMilliseconds;
        const end = endDate
          .toPlainDateTime(shift.endTime)
          .toZonedDateTime(input.profile.timeZone, { disambiguation: "reject" }).epochMilliseconds;
        const saved = input.details.find((d) => d.shiftId === shift.id);
        const details =
          saved && isCurrentShiftTraining(saved, shift, input.profile.timeZone)
            ? validateSavedShiftTraining(saved)
            : null;
        if (details) requireShiftTrainingParent(details, shift);
        const exam = details?.data.exam ?? null;
        const school = details?.data.school ?? null;
        const activeStart = school
          ? Math.min(...school.lessons.map((l) => Date.parse(l.start)))
          : exam?.participation.length
            ? Math.min(...exam.participation.map((p) => Date.parse(p.start)))
            : start;
        const activeEnd = school
          ? Math.max(...school.lessons.map((l) => Date.parse(l.end)))
          : exam?.participation.length
            ? Math.max(...exam.participation.map((p) => Date.parse(p.end)))
            : end;
        if (
          exam &&
          details?.data.pauses?.some(
            (pause) => Date.parse(pause.start) < activeStart || Date.parse(pause.end) > activeEnd,
          )
        )
          report(
            shift.date,
            "EXAM_PAUSE_OUTSIDE_PARTICIPATION",
            "Eine Prüfungspause liegt außerhalb der bestätigten Teilnahme; die Anrechnung bleibt offen.",
            shift.id,
          );
        const pauses =
          details?.data.pauses
            ?.filter((p) => Date.parse(p.start) >= activeStart && Date.parse(p.end) <= activeEnd)
            .map((p) => ({
              start: Date.parse(p.start),
              end: Date.parse(p.end),
              originalMinutes: (Date.parse(p.end) - Date.parse(p.start)) / 60000,
            })) ?? null;
        return [
          {
            shift,
            start: activeStart,
            end: activeEnd,
            pauses,
            school,
            exam,
            blockTrainingBinding: details
              ? youthBlockShiftBinding(shift, details, input.profile.timeZone)
              : null,
          },
        ];
      } catch {
        report(
          shift.date,
          "TIMES_AMBIGUOUS",
          "Dienstzeiten oder Pausen sind nicht eindeutig. Bitte Datum, Zeitumstellung und gespeicherte Intervalle prüfen.",
          shift.id,
        );
        return [];
      }
    })
    .sort((a, b) => a.start - b.start || a.end - b.end);
}
export function unionMinutes(spans: readonly YouthSpan[]): number {
  const sorted = [...spans].sort((a, b) => a.start - b.start);
  let total = 0,
    end = -Infinity;
  for (const p of sorted) {
    total += Math.max(0, p.end - Math.max(p.start, end));
    end = Math.max(end, p.end);
  }
  return total / 60000;
}
export function workSpans(entry: YouthEntry, minimumPause: number): YouthSpan[] {
  const spans: YouthSpan[] = [];
  let start = entry.start;
  for (const pause of entry.pauses ?? []) {
    if ((pause.originalMinutes ?? (pause.end - pause.start) / 60000) < minimumPause) continue;
    if (pause.start > start) spans.push({ start, end: pause.start });
    start = pause.end;
  }
  if (start < entry.end) spans.push({ start, end: entry.end });
  return spans;
}
export function clockMinutes(instant: number, zone: string): number {
  const z = Temporal.Instant.fromEpochMilliseconds(instant).toZonedDateTimeISO(zone);
  return z.hour * 60 + z.minute;
}
