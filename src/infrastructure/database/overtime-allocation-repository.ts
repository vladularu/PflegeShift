import type { SQLiteDatabase } from "expo-sqlite";
import { ConcurrencyError } from "@/domain/errors";
import {
  validateOvertimeAllocation,
  type SavedOvertimeAllocation,
  type SaveOvertimeAllocationInput,
} from "@/domain/overtime-allocation";
import { remunerationShiftDays } from "@/engine/remuneration-shift-days";
import { isPayWorkShift } from "@/engine/tvoed-pattern";
import type { ShiftEntry } from "@/domain/types";
import { mapShift } from "./calendar-entry-repository";
import { loadProfile } from "./profile-repository";
import { withImmediateTransaction } from "./transaction";

export const OVERTIME_ALLOCATION_COLUMNS = [
  "shift_id",
  "shift_revision",
  "time_zone",
  "allocations_json",
  "revision",
  "confirmed_at",
  "updated_at",
] as const;
export interface OvertimeAllocationRow {
  readonly shift_id: string;
  readonly shift_revision: number;
  readonly time_zone: string;
  readonly allocations_json: string;
  readonly revision: number;
  readonly confirmed_at: string;
  readonly updated_at: string;
}
export function mapOvertimeAllocationRow(row: OvertimeAllocationRow): SavedOvertimeAllocation {
  return validateOvertimeAllocation({
    shiftId: row.shift_id,
    shiftRevision: row.shift_revision,
    timeZone: row.time_zone,
    allocations: JSON.parse(row.allocations_json) as unknown,
    revision: row.revision,
    confirmedAt: row.confirmed_at,
    updatedAt: row.updated_at,
  });
}
export async function listOvertimeAllocations(
  db: SQLiteDatabase,
): Promise<readonly SavedOvertimeAllocation[]> {
  const rows = await db.getAllAsync<OvertimeAllocationRow>(
    `SELECT ${OVERTIME_ALLOCATION_COLUMNS.join(",")} FROM overtime_allocations ORDER BY shift_id`,
  );
  return Object.freeze(rows.map(mapOvertimeAllocationRow));
}
export async function loadOvertimeAllocation(
  db: SQLiteDatabase,
  shiftId: string,
): Promise<SavedOvertimeAllocation | null> {
  const row = await db.getFirstAsync<OvertimeAllocationRow>(
    `SELECT ${OVERTIME_ALLOCATION_COLUMNS.join(",")} FROM overtime_allocations WHERE shift_id=?`,
    shiftId,
  );
  return row === null ? null : mapOvertimeAllocationRow(row);
}

/** Shared by writes and verified backup imports; stale records remain inert history. */
export function requireOvertimeAllocationMatchesShift(
  candidate: SavedOvertimeAllocation,
  shift: ShiftEntry,
): void {
  if (candidate.allocations === null) return;
  if (
    candidate.shiftId !== shift.id ||
    candidate.shiftRevision !== shift.revision ||
    shift.deletedAt !== null ||
    !isPayWorkShift(shift) ||
    !shift.tariffOvertimeConfirmed ||
    shift.overtimeMinutes <= 0
  )
    throw new Error("Bitte zunächst die auszahlbaren Überstunden ausdrücklich bestätigen.");
  const days = remunerationShiftDays(shift, candidate.timeZone);
  if (
    shift.overtimeMinutes > days.reduce((sum, day) => sum + day.netMinutes, 0) ||
    candidate.allocations.reduce((sum, day) => sum + day.minutes, 0) !== shift.overtimeMinutes ||
    candidate.allocations.some((item) => {
      const day = days.find((d) => d.date === item.date);
      return !day || item.minutes > day.until - day.from;
    })
  )
    throw new Error(
      "Die Aufteilung muss alle bestätigten Überstunden innerhalb der Diensttage zuordnen.",
    );
}

export async function saveOvertimeAllocation(
  db: SQLiteDatabase,
  input: SaveOvertimeAllocationInput,
): Promise<SavedOvertimeAllocation> {
  if (
    !Number.isSafeInteger(input.expectedRevision) ||
    input.expectedRevision < 0 ||
    input.expectedRevision >= Number.MAX_SAFE_INTEGER
  )
    throw new Error("Ungültige Überstundenrevision.");
  const now = new Date().toISOString();
  // Own the input before awaiting; callers cannot mutate a pending write.
  const candidate = validateOvertimeAllocation({
    shiftId: input.shiftId,
    shiftRevision: input.expectedShiftRevision,
    timeZone: input.timeZone,
    allocations: input.allocations,
    revision: input.expectedRevision + 1,
    confirmedAt: now,
    updatedAt: now,
  });
  return withImmediateTransaction(db, async (tx) => {
    const prior = await loadOvertimeAllocation(tx, candidate.shiftId);
    if ((prior?.revision ?? 0) !== candidate.revision - 1)
      throw new ConcurrencyError(
        "Die Überstundenaufteilung wurde inzwischen geändert. Bitte neu laden.",
      );
    const row = await tx.getFirstAsync<Parameters<typeof mapShift>[0]>(
      "SELECT * FROM shift_entries WHERE id=? AND deleted_at IS NULL",
      candidate.shiftId,
    );
    if (!row) throw new ConcurrencyError("Der Dienst ist nicht mehr verfügbar.");
    const shift = mapShift(row);
    const profile = await loadProfile(tx);
    if (
      !shift ||
      shift.kind !== "SHIFT" ||
      shift.revision !== candidate.shiftRevision ||
      profile?.timeZone !== candidate.timeZone
    )
      throw new ConcurrencyError(
        "Dienst oder Zeitzone wurden inzwischen geändert. Bitte neu laden.",
      );
    requireOvertimeAllocationMatchesShift(candidate, shift);
    const stamp = new Date(
      Math.max(Date.now(), prior ? Date.parse(prior.updatedAt) : 0),
    ).toISOString();
    const saved = validateOvertimeAllocation({
      ...candidate,
      confirmedAt: stamp,
      updatedAt: stamp,
    });
    await tx.runAsync(
      `INSERT INTO overtime_allocations(${OVERTIME_ALLOCATION_COLUMNS.join(",")}) VALUES(?,?,?,?,?,?,?)
      ON CONFLICT(shift_id) DO UPDATE SET shift_revision=excluded.shift_revision,time_zone=excluded.time_zone,
      allocations_json=excluded.allocations_json,revision=excluded.revision,confirmed_at=excluded.confirmed_at,updated_at=excluded.updated_at`,
      saved.shiftId,
      saved.shiftRevision,
      saved.timeZone,
      JSON.stringify(saved.allocations),
      saved.revision,
      saved.confirmedAt,
      saved.updatedAt,
    );
    return saved;
  });
}
