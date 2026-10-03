import type { SQLiteDatabase } from "expo-sqlite";
import { requireShiftTrainingParent } from "@/domain/training-data";
import { mapShift } from "./calendar-entry-repository";
import type { RawShiftRow } from "./dev-backup-payload";
import {
  SHIFT_TRAINING_COLUMNS,
  mapShiftTrainingRow,
  type ShiftTrainingRow,
} from "./training-repository";

export function validateDevTraining(
  value: unknown,
  shifts: readonly RawShiftRow[],
): readonly ShiftTrainingRow[] {
  if (!Array.isArray(value)) throw new Error("Schul-/Pausendaten fehlen im Testlabor-Backup.");
  const byId = new Map(shifts.map((s) => [s.id, s]));
  const seen = new Set<string>();
  return Object.freeze(
    value.map((row: unknown) => {
      const parsed = mapShiftTrainingRow(row);
      const shift = byId.get(parsed.shiftId);
      if (!shift || seen.has(parsed.shiftId))
        throw new Error("Ungültige Schul-/Pausenzuordnung im Testlabor-Backup.");
      requireShiftTrainingParent(parsed, mapShift(shift as Parameters<typeof mapShift>[0]));
      seen.add(parsed.shiftId);
      return Object.freeze({ ...(row as ShiftTrainingRow) });
    }),
  );
}

export async function snapshotDevTraining(
  db: SQLiteDatabase,
  month: string,
): Promise<readonly ShiftTrainingRow[]> {
  return db.getAllAsync<ShiftTrainingRow>(
    `SELECT ${SHIFT_TRAINING_COLUMNS.map((key) => "t." + key).join(",")}
    FROM shift_training_details t JOIN shift_entries s ON s.id=t.shift_id WHERE substr(s.date,1,7)=? ORDER BY t.shift_id`,
    month,
  );
}

/** Parent deletion cascades; restore the original details after restoring original shifts. */
export async function restoreDevTraining(
  db: SQLiteDatabase,
  rows: readonly ShiftTrainingRow[],
): Promise<void> {
  for (const row of rows)
    await db.runAsync(
      `INSERT INTO shift_training_details(${SHIFT_TRAINING_COLUMNS.join(",")}) VALUES(?,?,?,?,?,?,?,?)`,
      ...SHIFT_TRAINING_COLUMNS.map((key) => row[key]),
    );
}
