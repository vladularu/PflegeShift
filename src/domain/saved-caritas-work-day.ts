import { Temporal } from "@js-temporal/polyfill";
import type { ShiftEntry } from "./types";
import { requireInstant } from "./validation";
import { requireRemunerationDate } from "./remuneration-profile";

/** A user-confirmed fact, never inferred from the shift template or a tariff default. */
export interface SavedCaritasWorkDay {
  readonly shiftId: string;
  readonly date: string;
  readonly shiftRevision: number;
  readonly shiftDate: string;
  readonly shiftUpdatedAt: string;
  readonly timeZone: string;
  readonly origin: "confirmed";
  readonly holidayTimeOff: boolean | null;
  readonly shiftWork: boolean | null;
  readonly revision: number;
  readonly confirmedAt: string;
  readonly updatedAt: string;
}

export interface SaveCaritasWorkDayInput {
  readonly shiftId: string;
  readonly date: string;
  readonly expectedShiftRevision: number;
  readonly expectedShiftUpdatedAt: string;
  readonly timeZone: string;
  readonly holidayTimeOff: boolean | null;
  readonly shiftWork: boolean | null;
  readonly expectedRevision: number;
}

const KEYS = [
  "shiftId",
  "date",
  "shiftRevision",
  "shiftDate",
  "shiftUpdatedAt",
  "timeZone",
  "origin",
  "holidayTimeOff",
  "shiftWork",
  "revision",
  "confirmedAt",
  "updatedAt",
] as const;

export function validateSavedCaritasWorkDay(value: unknown): SavedCaritasWorkDay {
  if (value === null || typeof value !== "object" || Array.isArray(value))
    throw new Error("Ungültige Caritas-Dienstbestätigung.");
  const row = value as Record<string, unknown>;
  if (Object.keys(row).length !== KEYS.length || KEYS.some((key) => !Object.hasOwn(row, key)))
    throw new Error("Unbekanntes Format der Caritas-Dienstbestätigung.");
  if (typeof row.shiftId !== "string" || !row.shiftId.trim() || row.shiftId.length > 200)
    throw new Error("Ungültige Dienstzuordnung.");
  for (const revision of [row.shiftRevision, row.revision])
    if (!Number.isSafeInteger(revision) || (revision as number) < 1)
      throw new Error("Ungültige Bestätigungsrevision.");
  if (
    row.origin !== "confirmed" ||
    ![true, false, null].includes(row.holidayTimeOff as boolean | null) ||
    ![true, false, null].includes(row.shiftWork as boolean | null)
  )
    throw new Error("Ungültige Caritas-Bestätigung.");
  if (typeof row.timeZone !== "string" || !row.timeZone || /^[+-]/u.test(row.timeZone))
    throw new Error("Ungültige Zeitzone.");
  Temporal.Instant.fromEpochMilliseconds(0).toZonedDateTimeISO(row.timeZone);
  const confirmedAt = requireInstant(row.confirmedAt, "Bestätigung");
  const updatedAt = requireInstant(row.updatedAt, "Aktualisierung");
  if (Date.parse(confirmedAt) > Date.parse(updatedAt))
    throw new Error("Ungültiger Bestätigungszeitpunkt.");
  return Object.freeze({
    shiftId: row.shiftId,
    date: requireRemunerationDate(row.date),
    shiftRevision: row.shiftRevision as number,
    shiftDate: requireRemunerationDate(row.shiftDate),
    shiftUpdatedAt: requireInstant(row.shiftUpdatedAt, "Dienständerung"),
    timeZone: row.timeZone,
    origin: "confirmed",
    holidayTimeOff: row.holidayTimeOff as boolean | null,
    shiftWork: row.shiftWork as boolean | null,
    revision: row.revision as number,
    confirmedAt,
    updatedAt,
  });
}

/** Shift edits, deletion or timezone changes require reconfirmation without erasing history. */
export function isCurrentCaritasWorkDay(
  value: SavedCaritasWorkDay,
  shift: ShiftEntry,
  timeZone: string,
): boolean {
  return (
    value.shiftId === shift.id &&
    value.shiftRevision === shift.revision &&
    value.shiftDate === shift.date &&
    value.shiftUpdatedAt === shift.updatedAt &&
    value.timeZone === timeZone &&
    shift.deletedAt === null &&
    !shift.allDay &&
    shift.startTime !== null &&
    shift.endTime !== null &&
    !["VACATION", "SICK", "FREE"].includes(shift.type)
  );
}
