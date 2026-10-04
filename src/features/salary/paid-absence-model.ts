import { UserFacingError } from "@/domain/errors";
import {
  isCurrentPaidAbsence,
  isOwnPaidAbsence,
  type SavedPaidAbsence,
  type SavePaidAbsenceInput,
} from "@/domain/paid-absence";
import type { CalendarEntry, ShiftEntry } from "@/domain/types";
import { remunerationMonthStart } from "@/engine/remuneration-context";

export function paidAbsenceEntries(
  month: string,
  entries: readonly CalendarEntry[],
): readonly ShiftEntry[] {
  remunerationMonthStart(month);
  return entries
    .filter(
      (entry): entry is ShiftEntry =>
        entry.kind === "SHIFT" &&
        entry.deletedAt === null &&
        entry.date.startsWith(month + "-") &&
        isOwnPaidAbsence(entry),
    )
    .sort(
      (a, b) =>
        a.date.localeCompare(b.date) || a.title.localeCompare(b.title) || a.id.localeCompare(b.id),
    );
}
export function paidTimeText(minutes: number): string {
  return `${Math.floor(minutes / 60)}:${(minutes % 60).toString().padStart(2, "0")}`;
}
export function paidAbsenceField(
  shift: ShiftEntry,
  timeZone: string,
  saved: SavedPaidAbsence | null,
): string {
  return saved && isCurrentPaidAbsence(saved, shift, timeZone)
    ? paidTimeText(saved.paidMinutes!)
    : "";
}
export function preparePaidAbsence(
  shift: ShiftEntry,
  timeZone: string,
  saved: SavedPaidAbsence | null,
  text: string | null,
): SavePaidAbsenceInput {
  if (shift.deletedAt !== null || !isOwnPaidAbsence(shift))
    throw new UserFacingError("Dieser Eintrag ist keine aktive Abwesenheit.");
  if (saved && saved.shiftId !== shift.id)
    throw new UserFacingError("Die Bestätigung gehört zu einem anderen Eintrag. Bitte neu laden.");
  let paidMinutes: number | null = null;
  if (text !== null) {
    const match = /^(\d{1,2}):([0-5]\d)$/u.exec(text.trim());
    if (!match || Number(match[1]) * 60 + Number(match[2]) > 1500)
      throw new UserFacingError(
        "Bitte Stunden:Minuten eingeben, zum Beispiel 7:42. Höchstens 25:00; ohne bezahlte Zeit ausdrücklich 0:00.",
      );
    paidMinutes = Number(match[1]) * 60 + Number(match[2]);
  }
  return {
    shiftId: shift.id,
    expectedShiftRevision: shift.revision,
    expectedShiftDate: shift.date,
    expectedShiftUpdatedAt: shift.updatedAt,
    timeZone,
    expectedRevision: saved?.revision ?? 0,
    paidMinutes,
  };
}
