import { Temporal } from "@js-temporal/polyfill";
import type { OvertimeDayAllocation } from "./remuneration-supplement";
import type { ShiftEntry } from "./types";
import { requireRemunerationDate } from "./remuneration-profile";
import { requireInstant } from "./validation";

export interface SavedOvertimeAllocation {
  readonly shiftId: string;
  readonly shiftRevision: number;
  readonly timeZone: string;
  readonly allocations: readonly OvertimeDayAllocation[] | null;
  readonly revision: number;
  readonly confirmedAt: string;
  readonly updatedAt: string;
}

export interface SaveOvertimeAllocationInput {
  readonly shiftId: string;
  readonly expectedShiftRevision: number;
  readonly timeZone: string;
  /** Null explicitly clears the allocation; an empty list is not a confirmation. */
  readonly allocations: readonly OvertimeDayAllocation[] | null;
  readonly expectedRevision: number;
}

function exact(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value))
    throw new Error("Ungültige Überstundenaufteilung.");
  const row = value as Record<string, unknown>;
  if (Object.keys(row).length !== keys.length || keys.some((key) => !Object.hasOwn(row, key)))
    throw new Error("Unbekanntes Format der Überstundenaufteilung.");
  return row;
}

export function validateOvertimeAllocation(value: unknown): SavedOvertimeAllocation {
  const row = exact(value, [
    "shiftId",
    "shiftRevision",
    "timeZone",
    "allocations",
    "revision",
    "confirmedAt",
    "updatedAt",
  ]);
  if (typeof row.shiftId !== "string" || !row.shiftId.trim() || row.shiftId.length > 200)
    throw new Error("Ungültige Dienstzuordnung.");
  for (const value of [row.shiftRevision, row.revision]) {
    if (!Number.isSafeInteger(value) || (value as number) < 1)
      throw new Error("Ungültige Überstundenrevision.");
  }
  if (typeof row.timeZone !== "string" || !row.timeZone || /^[+-]/u.test(row.timeZone))
    throw new Error("Ungültige Zeitzone.");
  Temporal.Instant.fromEpochMilliseconds(0).toZonedDateTimeISO(row.timeZone);
  const confirmedAt = requireInstant(row.confirmedAt, "Bestätigung");
  const updatedAt = requireInstant(row.updatedAt, "Aktualisierung");
  if (Date.parse(confirmedAt) > Date.parse(updatedAt))
    throw new Error("Ungültiger Bestätigungszeitpunkt.");
  let allocations: readonly OvertimeDayAllocation[] | null = null;
  if (row.allocations !== null) {
    if (!Array.isArray(row.allocations) || row.allocations.length < 1 || row.allocations.length > 2)
      throw new Error("Überstunden benötigen eine eindeutige Tagesaufteilung.");
    const days = row.allocations
      .map((item) => {
        const day = exact(item, ["date", "minutes"]);
        const date = requireRemunerationDate(day.date);
        if (
          !Number.isSafeInteger(day.minutes) ||
          (day.minutes as number) < 0 ||
          (day.minutes as number) > 1500
        )
          throw new Error("Ungültige Überstundenminuten.");
        return Object.freeze({ date, minutes: day.minutes as number });
      })
      .sort((a, b) => a.date.localeCompare(b.date));
    if (
      new Set(days.map((day) => day.date)).size !== days.length ||
      !days.some((day) => day.minutes > 0)
    )
      throw new Error("Überstunden müssen eindeutig zugeordnet sein.");
    allocations = Object.freeze(days);
  }
  return Object.freeze({
    shiftId: row.shiftId,
    shiftRevision: row.shiftRevision as number,
    timeZone: row.timeZone,
    allocations,
    revision: row.revision as number,
    confirmedAt,
    updatedAt,
  });
}

/** A changed/deleted shift or changed timezone requires explicit reconfirmation. */
export function isCurrentOvertimeAllocation(
  value: SavedOvertimeAllocation,
  shift: ShiftEntry,
  timeZone: string,
): boolean {
  return (
    value.allocations !== null &&
    value.shiftId === shift.id &&
    value.shiftRevision === shift.revision &&
    value.timeZone === timeZone &&
    shift.deletedAt === null &&
    shift.tariffOvertimeConfirmed === true &&
    shift.overtimeMinutes > 0
  );
}
