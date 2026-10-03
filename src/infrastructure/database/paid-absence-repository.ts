import type { SQLiteDatabase } from "expo-sqlite";
import { ConcurrencyError } from "@/domain/errors";
import {
  isOwnPaidAbsence,
  validatePaidAbsence,
  type SavedPaidAbsence,
  type SavePaidAbsenceInput,
} from "@/domain/paid-absence";
import type { ShiftEntry } from "@/domain/types";
import { mapShift } from "./calendar-entry-repository";
import { loadProfile } from "./profile-repository";
import { withImmediateTransaction } from "./transaction";

export const PAID_ABSENCE_COLUMNS = [
  "shift_id",
  "shift_revision",
  "shift_date",
  "shift_updated_at",
  "time_zone",
  "paid_minutes",
  "revision",
  "confirmed_at",
  "updated_at",
] as const;
export interface PaidAbsenceRow {
  readonly shift_id: string;
  readonly shift_revision: number;
  readonly shift_date: string;
  readonly shift_updated_at: string;
  readonly time_zone: string;
  readonly paid_minutes: number | null;
  readonly revision: number;
  readonly confirmed_at: string;
  readonly updated_at: string;
}
export function mapPaidAbsenceRow(row: PaidAbsenceRow): SavedPaidAbsence {
  return validatePaidAbsence({
    shiftId: row.shift_id,
    shiftRevision: row.shift_revision,
    shiftDate: row.shift_date,
    shiftUpdatedAt: row.shift_updated_at,
    timeZone: row.time_zone,
    paidMinutes: row.paid_minutes,
    revision: row.revision,
    confirmedAt: row.confirmed_at,
    updatedAt: row.updated_at,
  });
}
export async function listPaidAbsences(db: SQLiteDatabase): Promise<readonly SavedPaidAbsence[]> {
  const rows = await db.getAllAsync<PaidAbsenceRow>(
    `SELECT ${PAID_ABSENCE_COLUMNS.join(",")} FROM paid_absences ORDER BY shift_id`,
  );
  return Object.freeze(rows.map(mapPaidAbsenceRow));
}
export async function loadPaidAbsence(
  db: SQLiteDatabase,
  shiftId: string,
): Promise<SavedPaidAbsence | null> {
  const row = await db.getFirstAsync<PaidAbsenceRow>(
    `SELECT ${PAID_ABSENCE_COLUMNS.join(",")} FROM paid_absences WHERE shift_id=?`,
    shiftId,
  );
  return row === null ? null : mapPaidAbsenceRow(row);
}

/** Import permits inert stale records but never a future or unrelated parent. */
export function requirePaidAbsenceParent(value: SavedPaidAbsence, shift: ShiftEntry): void {
  if (
    value.shiftId !== shift.id ||
    value.shiftRevision > shift.revision ||
    Date.parse(value.shiftUpdatedAt) > Date.parse(shift.updatedAt)
  )
    throw new Error("Ungültige Eintragszuordnung der Abwesenheitsbestätigung.");
  if (
    value.paidMinutes !== null &&
    value.shiftRevision === shift.revision &&
    value.shiftDate === shift.date &&
    value.shiftUpdatedAt === shift.updatedAt &&
    !isOwnPaidAbsence(shift)
  )
    throw new Error("Der Eintrag ist keine bestätigbare Abwesenheit.");
}

export async function savePaidAbsence(
  db: SQLiteDatabase,
  input: SavePaidAbsenceInput,
): Promise<SavedPaidAbsence> {
  if (
    !Number.isSafeInteger(input.expectedRevision) ||
    input.expectedRevision < 0 ||
    input.expectedRevision >= Number.MAX_SAFE_INTEGER
  )
    throw new Error("Ungültige Abwesenheitsrevision.");
  // Copy and validate all caller-owned scalars before the first await.
  const now = new Date(
    Math.max(Date.now(), Date.parse(input.expectedShiftUpdatedAt)),
  ).toISOString();
  const candidate = validatePaidAbsence({
    shiftId: input.shiftId,
    shiftRevision: input.expectedShiftRevision,
    shiftDate: input.expectedShiftDate,
    shiftUpdatedAt: input.expectedShiftUpdatedAt,
    timeZone: input.timeZone,
    paidMinutes: input.paidMinutes,
    revision: input.expectedRevision + 1,
    confirmedAt: now,
    updatedAt: now,
  });
  return withImmediateTransaction(db, async (tx) => {
    const prior = await loadPaidAbsence(tx, candidate.shiftId);
    if ((prior?.revision ?? 0) !== candidate.revision - 1)
      throw new ConcurrencyError(
        "Die Abwesenheitsbestätigung wurde inzwischen geändert. Bitte neu laden.",
      );
    const row = await tx.getFirstAsync<Parameters<typeof mapShift>[0]>(
      "SELECT * FROM shift_entries WHERE id=? AND deleted_at IS NULL",
      candidate.shiftId,
    );
    if (!row) throw new ConcurrencyError("Der Eintrag ist nicht mehr verfügbar.");
    const shift = mapShift(row);
    const profile = await loadProfile(tx);
    if (
      shift.revision !== candidate.shiftRevision ||
      shift.date !== candidate.shiftDate ||
      shift.updatedAt !== candidate.shiftUpdatedAt ||
      profile?.timeZone !== candidate.timeZone
    )
      throw new ConcurrencyError(
        "Eintrag oder Zeitzone wurden inzwischen geändert. Bitte neu laden.",
      );
    requirePaidAbsenceParent(candidate, shift);
    const stamp = new Date(
      Math.max(
        Date.now(),
        Date.parse(candidate.confirmedAt),
        prior ? Date.parse(prior.updatedAt) : 0,
      ),
    ).toISOString();
    const saved = validatePaidAbsence({ ...candidate, confirmedAt: stamp, updatedAt: stamp });
    await tx.runAsync(
      `INSERT INTO paid_absences(${PAID_ABSENCE_COLUMNS.join(",")}) VALUES(?,?,?,?,?,?,?,?,?)
      ON CONFLICT(shift_id) DO UPDATE SET shift_revision=excluded.shift_revision,shift_date=excluded.shift_date,shift_updated_at=excluded.shift_updated_at,time_zone=excluded.time_zone,paid_minutes=excluded.paid_minutes,revision=excluded.revision,confirmed_at=excluded.confirmed_at,updated_at=excluded.updated_at`,
      saved.shiftId,
      saved.shiftRevision,
      saved.shiftDate,
      saved.shiftUpdatedAt,
      saved.timeZone,
      saved.paidMinutes,
      saved.revision,
      saved.confirmedAt,
      saved.updatedAt,
    );
    return saved;
  });
}
