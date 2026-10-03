import { Temporal } from "@js-temporal/polyfill";
import type { ShiftEntry } from "./types";
import { requireRemunerationDate } from "./remuneration-profile";
import { requireInstant } from "./validation";

export interface SavedPaidAbsence {
  readonly shiftId: string;
  readonly shiftRevision: number;
  readonly shiftDate: string;
  readonly shiftUpdatedAt: string;
  readonly timeZone: string;
  /** null revokes confirmation; zero explicitly confirms no paid time. */
  readonly paidMinutes: number | null;
  readonly revision: number;
  readonly confirmedAt: string;
  readonly updatedAt: string;
}

export interface SavePaidAbsenceInput {
  readonly shiftId: string;
  readonly expectedShiftRevision: number;
  readonly expectedShiftDate: string;
  readonly expectedShiftUpdatedAt: string;
  readonly timeZone: string;
  readonly expectedRevision: number;
  readonly paidMinutes: number | null;
}

export function validatePaidAbsence(value: unknown): SavedPaidAbsence {
  const keys = [
    "shiftId",
    "shiftRevision",
    "shiftDate",
    "shiftUpdatedAt",
    "timeZone",
    "paidMinutes",
    "revision",
    "confirmedAt",
    "updatedAt",
  ];
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Ungültige Abwesenheitsbestätigung.");
  const raw = value as Record<string, unknown>;
  if (Object.keys(raw).length !== keys.length || keys.some((key) => !Object.hasOwn(raw, key)))
    throw new Error("Unbekanntes Format der Abwesenheitsbestätigung.");
  if (typeof raw.shiftId !== "string" || !raw.shiftId.trim() || raw.shiftId.length > 200)
    throw new Error("Ungültige Eintragszuordnung.");
  for (const revision of [raw.shiftRevision, raw.revision])
    if (!Number.isSafeInteger(revision) || (revision as number) < 1)
      throw new Error("Ungültige Abwesenheitsrevision.");
  if (
    raw.paidMinutes !== null &&
    (!Number.isSafeInteger(raw.paidMinutes) ||
      (raw.paidMinutes as number) < 0 ||
      (raw.paidMinutes as number) > 1500)
  )
    throw new Error("Ungültige bezahlte Abwesenheitszeit.");
  if (typeof raw.timeZone !== "string" || !raw.timeZone || /^[+-]/u.test(raw.timeZone))
    throw new Error("Ungültige Zeitzone.");
  Temporal.Instant.fromEpochMilliseconds(0).toZonedDateTimeISO(raw.timeZone);
  const shiftDate = requireRemunerationDate(raw.shiftDate);
  const shiftUpdatedAt = requireInstant(raw.shiftUpdatedAt, "Eintragsaktualisierung");
  const confirmedAt = requireInstant(raw.confirmedAt, "Bestätigung");
  const updatedAt = requireInstant(raw.updatedAt, "Aktualisierung");
  if (
    Date.parse(confirmedAt) > Date.parse(updatedAt) ||
    Date.parse(shiftUpdatedAt) > Date.parse(confirmedAt)
  )
    throw new Error("Ungültiger Bestätigungszeitpunkt.");
  return Object.freeze({
    shiftId: raw.shiftId,
    shiftRevision: raw.shiftRevision as number,
    shiftDate,
    shiftUpdatedAt,
    timeZone: raw.timeZone,
    paidMinutes: raw.paidMinutes as number | null,
    revision: raw.revision as number,
    confirmedAt,
    updatedAt,
  });
}

export function isOwnPaidAbsence(shift: ShiftEntry): boolean {
  return shift.allDay === true || ["VACATION", "SICK", "FREE", "TRAINING"].includes(shift.type);
}

export function isCurrentPaidAbsence(
  value: SavedPaidAbsence,
  shift: ShiftEntry,
  timeZone: string,
): boolean {
  return (
    value.paidMinutes !== null &&
    value.shiftId === shift.id &&
    value.shiftRevision === shift.revision &&
    value.shiftDate === shift.date &&
    value.shiftUpdatedAt === shift.updatedAt &&
    value.timeZone === timeZone &&
    shift.deletedAt === null &&
    isOwnPaidAbsence(shift)
  );
}
