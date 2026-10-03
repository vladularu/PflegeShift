import type { SQLiteDatabase } from "expo-sqlite";
import { ConcurrencyError } from "@/domain/errors";
import { requireInstant } from "@/domain/validation";
import {
  exactTrainingRecord,
  trainingRevision,
  validateTrainingProfile,
  validateSavedShiftTraining,
  requireShiftTrainingParent,
  type TrainingProfileData,
  type SavedTrainingProfile,
  type SavedShiftTraining,
  type SaveShiftTrainingInput,
  type TrainingSnapshot,
} from "@/domain/training-data";
import { mapShift } from "./calendar-entry-repository";
import { loadProfile } from "./profile-repository";
import { withImmediateTransaction } from "./transaction";

export const TRAINING_PROFILE_COLUMNS = [
  "effective_from",
  "data_json",
  "revision",
  "updated_at",
] as const;
export const SHIFT_TRAINING_COLUMNS = [
  "shift_id",
  "shift_revision",
  "shift_date",
  "shift_updated_at",
  "time_zone",
  "data_json",
  "revision",
  "updated_at",
] as const;
export interface TrainingProfileRow {
  readonly effective_from: string;
  readonly data_json: string;
  readonly revision: number;
  readonly updated_at: string;
}
export interface ShiftTrainingRow {
  readonly shift_id: string;
  readonly shift_revision: number;
  readonly shift_date: string;
  readonly shift_updated_at: string;
  readonly time_zone: string;
  readonly data_json: string;
  readonly revision: number;
  readonly updated_at: string;
}

export function mapTrainingProfileRow(value: unknown): SavedTrainingProfile {
  const row = exactTrainingRecord(value, TRAINING_PROFILE_COLUMNS);
  if (typeof row.data_json !== "string") throw new Error("Ungültiges Ausbildungsprofil.");
  const data = validateTrainingProfile(JSON.parse(row.data_json));
  if (row.effective_from !== data.effectiveFrom) throw new Error("Ungültige Profilgültigkeit.");
  return Object.freeze({
    data,
    revision: trainingRevision(row.revision),
    updatedAt: requireInstant(row.updated_at, "Profilaktualisierung"),
  });
}

export function mapShiftTrainingRow(value: unknown): SavedShiftTraining {
  const row = exactTrainingRecord(value, SHIFT_TRAINING_COLUMNS);
  if (typeof row.data_json !== "string") throw new Error("Ungültige Schul-/Pausendaten.");
  return validateSavedShiftTraining({
    shiftId: row.shift_id,
    shiftRevision: row.shift_revision,
    shiftDate: row.shift_date,
    shiftUpdatedAt: row.shift_updated_at,
    timeZone: row.time_zone,
    data: JSON.parse(row.data_json),
    revision: row.revision,
    updatedAt: row.updated_at,
  });
}

export async function listTrainingProfiles(
  db: SQLiteDatabase,
): Promise<readonly SavedTrainingProfile[]> {
  const rows = await db.getAllAsync<TrainingProfileRow>(
    `SELECT ${TRAINING_PROFILE_COLUMNS.join(",")} FROM training_profiles ORDER BY effective_from`,
  );
  return Object.freeze(rows.map(mapTrainingProfileRow));
}

export async function listShiftTraining(
  db: SQLiteDatabase,
): Promise<readonly SavedShiftTraining[]> {
  const rows = await db.getAllAsync<ShiftTrainingRow>(
    `SELECT ${SHIFT_TRAINING_COLUMNS.join(",")} FROM shift_training_details ORDER BY shift_id`,
  );
  return Object.freeze(rows.map(mapShiftTrainingRow));
}

function nextRevision(expected: number): number {
  if (!Number.isSafeInteger(expected) || expected < 0 || expected >= Number.MAX_SAFE_INTEGER)
    throw new Error("Ungültige erwartete Revision.");
  return expected + 1;
}

export async function saveTrainingProfile(
  db: SQLiteDatabase,
  input: { readonly data: TrainingProfileData; readonly expectedRevision: number },
): Promise<SavedTrainingProfile> {
  const data = validateTrainingProfile(input.data);
  const revision = nextRevision(input.expectedRevision);
  return withImmediateTransaction(db, async (tx) => {
    if ((await loadProfile(tx)) === null) throw new Error("Arbeitszeitprofil fehlt.");
    const prior = await tx.getFirstAsync<TrainingProfileRow>(
      `SELECT ${TRAINING_PROFILE_COLUMNS.join(",")} FROM training_profiles WHERE effective_from=?`,
      data.effectiveFrom,
    );
    if ((prior === null ? 0 : mapTrainingProfileRow(prior).revision) !== revision - 1)
      throw new ConcurrencyError(
        "Das Ausbildungsprofil wurde inzwischen geändert. Bitte neu laden.",
      );
    const updatedAt = new Date(
      Math.max(Date.now(), prior ? Date.parse(prior.updated_at) : 0),
    ).toISOString();
    await tx.runAsync(
      `INSERT INTO training_profiles(${TRAINING_PROFILE_COLUMNS.join(",")}) VALUES(?,?,?,?)
      ON CONFLICT(effective_from) DO UPDATE SET data_json=excluded.data_json,revision=excluded.revision,updated_at=excluded.updated_at`,
      data.effectiveFrom,
      JSON.stringify(data),
      revision,
      updatedAt,
    );
    return Object.freeze({ data, revision, updatedAt });
  });
}

export type { SaveShiftTrainingInput } from "@/domain/training-data";

export async function loadTrainingSnapshot(db: SQLiteDatabase): Promise<TrainingSnapshot> {
  return withImmediateTransaction(db, async (tx) =>
    Object.freeze({
      profiles: await listTrainingProfiles(tx),
      shifts: await listShiftTraining(tx),
    }),
  );
}

export async function saveShiftTraining(
  db: SQLiteDatabase,
  input: SaveShiftTrainingInput,
): Promise<SavedShiftTraining> {
  if (
    input.synchronizeBreakMinutes !== undefined &&
    typeof input.synchronizeBreakMinutes !== "boolean"
  )
    throw new Error("Ungültige Pausenübernahme.");
  const synchronizeBreakMinutes = input.synchronizeBreakMinutes === true;
  const candidate = validateSavedShiftTraining({
    shiftId: input.shiftId,
    shiftRevision: input.expectedShiftRevision,
    shiftDate: input.expectedShiftDate,
    shiftUpdatedAt: input.expectedShiftUpdatedAt,
    timeZone: input.timeZone,
    data: input.data,
    revision: nextRevision(input.expectedRevision),
    updatedAt: new Date(
      Math.max(Date.now(), Date.parse(input.expectedShiftUpdatedAt)),
    ).toISOString(),
  });
  return withImmediateTransaction(db, async (tx) => {
    const prior = await tx.getFirstAsync<ShiftTrainingRow>(
      `SELECT ${SHIFT_TRAINING_COLUMNS.join(",")} FROM shift_training_details WHERE shift_id=?`,
      candidate.shiftId,
    );
    if ((prior === null ? 0 : mapShiftTrainingRow(prior).revision) !== candidate.revision - 1)
      throw new ConcurrencyError("Schul-/Pausendaten wurden inzwischen geändert. Bitte neu laden.");
    const row = await tx.getFirstAsync<Parameters<typeof mapShift>[0]>(
      "SELECT * FROM shift_entries WHERE id=? AND deleted_at IS NULL",
      candidate.shiftId,
    );
    if (row === null) throw new ConcurrencyError("Der Eintrag ist nicht mehr verfügbar.");
    let shift = mapShift(row);
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
    let binding = candidate;
    if (synchronizeBreakMinutes && candidate.data.pauses !== null) {
      const breakMinutes = candidate.data.pauses.reduce(
        (sum, p) => sum + (Date.parse(p.end) - Date.parse(p.start)) / 60000,
        0,
      );
      if (breakMinutes !== shift.breakMinutes) {
        const updatedAt = new Date(
          Math.max(Date.now(), Date.parse(shift.updatedAt) + 1),
        ).toISOString();
        shift = mapShift({
          ...row,
          break_minutes: breakMinutes,
          revision: nextRevision(shift.revision),
          updated_at: updatedAt,
        });
        binding = validateSavedShiftTraining({
          ...candidate,
          shiftRevision: shift.revision,
          shiftUpdatedAt: updatedAt,
          updatedAt,
        });
        requireShiftTrainingParent(binding, shift);
        const result = await tx.runAsync(
          "UPDATE shift_entries SET break_minutes=?,revision=?,updated_at=? WHERE id=? AND revision=? AND deleted_at IS NULL",
          breakMinutes,
          shift.revision,
          updatedAt,
          shift.id,
          candidate.shiftRevision,
        );
        if (result.changes !== 1)
          throw new ConcurrencyError("Der Eintrag wurde inzwischen geändert. Bitte neu laden.");
      }
    }
    requireShiftTrainingParent(binding, shift);
    const saved = validateSavedShiftTraining({
      ...binding,
      updatedAt: new Date(
        Math.max(Date.parse(binding.updatedAt), prior ? Date.parse(prior.updated_at) : 0),
      ).toISOString(),
    });
    await tx.runAsync(
      `INSERT INTO shift_training_details(${SHIFT_TRAINING_COLUMNS.join(",")}) VALUES(?,?,?,?,?,?,?,?)
      ON CONFLICT(shift_id) DO UPDATE SET shift_revision=excluded.shift_revision,shift_date=excluded.shift_date,shift_updated_at=excluded.shift_updated_at,time_zone=excluded.time_zone,data_json=excluded.data_json,revision=excluded.revision,updated_at=excluded.updated_at`,
      saved.shiftId,
      saved.shiftRevision,
      saved.shiftDate,
      saved.shiftUpdatedAt,
      saved.timeZone,
      JSON.stringify(saved.data),
      saved.revision,
      saved.updatedAt,
    );
    return saved;
  });
}
