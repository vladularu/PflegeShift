import type { SQLiteDatabase } from "expo-sqlite";
import { ConcurrencyError } from "@/domain/errors";
import {
  isCurrentCaritasWorkDay,
  validateSavedCaritasWorkDay,
  type SavedCaritasWorkDay,
  type SaveCaritasWorkDayInput,
} from "@/domain/saved-caritas-work-day";
import type { ShiftEntry } from "@/domain/types";
import { remunerationShiftDays } from "@/engine/remuneration-shift-days";
import { isPayWorkShift } from "@/engine/tvoed-pattern";
import { mapShift } from "./calendar-entry-repository";
import { loadProfile } from "./profile-repository";
import { withImmediateTransaction } from "./transaction";

export const CARITAS_WORK_DAY_COLUMNS = ["shift_id", "date", "confirmation_json"] as const;
export interface CaritasWorkDayRow {
  readonly shift_id: string;
  readonly date: string;
  readonly confirmation_json: string;
}

export function mapCaritasWorkDayRow(value: unknown): SavedCaritasWorkDay {
  if (value === null || typeof value !== "object" || Array.isArray(value))
    throw new Error("Ungültige Caritas-Dienstbestätigung.");
  const row = value as Record<string, unknown>;
  if (
    Object.keys(row).length !== CARITAS_WORK_DAY_COLUMNS.length ||
    CARITAS_WORK_DAY_COLUMNS.some((key) => !Object.hasOwn(row, key)) ||
    typeof row.confirmation_json !== "string"
  )
    throw new Error("Ungültige Caritas-Dienstbestätigung.");
  const parsed = validateSavedCaritasWorkDay(JSON.parse(row.confirmation_json));
  if (row.shift_id !== parsed.shiftId || row.date !== parsed.date)
    throw new Error("Widersprüchliche Caritas-Dienstzuordnung.");
  return parsed;
}

export async function listCaritasWorkDays(
  db: SQLiteDatabase,
): Promise<readonly SavedCaritasWorkDay[]> {
  const rows = await db.getAllAsync<CaritasWorkDayRow>(
    "SELECT shift_id,date,confirmation_json FROM caritas_work_days ORDER BY shift_id,date",
  );
  return Object.freeze(rows.map(mapCaritasWorkDayRow));
}

/** Backup imports may preserve stale facts, but never future revisions or missing shifts. */
export function requireCaritasWorkDayParent(
  value: SavedCaritasWorkDay,
  shift: ShiftEntry | undefined,
): void {
  if (!shift || shift.id !== value.shiftId || value.shiftRevision > shift.revision)
    throw new Error("Ungültige Dienstreferenz der Caritas-Bestätigung.");
  if (
    isCurrentCaritasWorkDay(value, shift, value.timeZone) &&
    !remunerationShiftDays(shift, value.timeZone).some((day) => day.date === value.date)
  )
    throw new Error("Die Caritas-Bestätigung gehört nicht zu diesem Diensttag.");
}

export async function saveCaritasWorkDay(
  db: SQLiteDatabase,
  input: SaveCaritasWorkDayInput,
): Promise<SavedCaritasWorkDay> {
  for (const revision of [input.expectedRevision, input.expectedShiftRevision])
    if (!Number.isSafeInteger(revision) || revision < 0 || revision >= Number.MAX_SAFE_INTEGER)
      throw new Error("Ungültige Bestätigungsrevision.");
  return withImmediateTransaction(db, async (tx) => {
    const row = await tx.getFirstAsync<Parameters<typeof mapShift>[0]>(
      "SELECT * FROM shift_entries WHERE id=? AND deleted_at IS NULL",
      input.shiftId,
    );
    if (!row) throw new ConcurrencyError("Der Dienst ist nicht mehr verfügbar.");
    const shift = mapShift(row);
    const profile = await loadProfile(tx);
    if (
      !isPayWorkShift(shift) ||
      shift.revision !== input.expectedShiftRevision ||
      shift.updatedAt !== input.expectedShiftUpdatedAt ||
      profile?.timeZone !== input.timeZone
    )
      throw new ConcurrencyError("Dienst oder Zeitzone wurden geändert. Bitte neu laden.");
    if (!remunerationShiftDays(shift, input.timeZone).some((day) => day.date === input.date))
      throw new Error("Der bestätigte Kalendertag gehört nicht zum Dienst.");
    const priorRow = await tx.getFirstAsync<CaritasWorkDayRow>(
      "SELECT shift_id,date,confirmation_json FROM caritas_work_days WHERE shift_id=? AND date=?",
      input.shiftId,
      input.date,
    );
    const prior = priorRow === null ? null : mapCaritasWorkDayRow(priorRow);
    if ((prior?.revision ?? 0) !== input.expectedRevision)
      throw new ConcurrencyError(
        "Die Dienstbestätigung wurde inzwischen geändert. Bitte neu laden.",
      );
    const stamp = new Date(
      Math.max(Date.now(), prior ? Date.parse(prior.updatedAt) : 0),
    ).toISOString();
    const saved = validateSavedCaritasWorkDay({
      shiftId: shift.id,
      date: input.date,
      shiftRevision: shift.revision,
      shiftDate: shift.date,
      shiftUpdatedAt: shift.updatedAt,
      timeZone: input.timeZone,
      origin: "confirmed",
      holidayTimeOff: input.holidayTimeOff,
      shiftWork: input.shiftWork,
      revision: input.expectedRevision + 1,
      confirmedAt: stamp,
      updatedAt: stamp,
    });
    await tx.runAsync(
      `INSERT INTO caritas_work_days(shift_id,date,confirmation_json) VALUES(?,?,?)
      ON CONFLICT(shift_id,date) DO UPDATE SET confirmation_json=excluded.confirmation_json`,
      saved.shiftId,
      saved.date,
      JSON.stringify(saved),
    );
    return saved;
  });
}
