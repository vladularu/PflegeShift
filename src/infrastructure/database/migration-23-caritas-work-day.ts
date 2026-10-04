import type { SQLiteDatabase } from "expo-sqlite";
import { withImmediateTransaction } from "./transaction";

/** Additive and forward-only; existing services cannot imply a confirmation. */
export async function migrateCaritasWorkDay(db: SQLiteDatabase, appliedAt: string): Promise<void> {
  await withImmediateTransaction(db, async (tx) => {
    if (await tx.getFirstAsync("SELECT version FROM schema_migrations WHERE version=23")) return;
    await tx.execAsync(`
      CREATE TABLE caritas_work_days (
        shift_id TEXT NOT NULL REFERENCES shift_entries(id) ON DELETE CASCADE,
        date TEXT NOT NULL,
        confirmation_json TEXT NOT NULL CHECK (json_valid(confirmation_json)),
        PRIMARY KEY (shift_id,date)
      );
    `);
    await tx.runAsync("INSERT INTO schema_migrations(version,applied_at) VALUES(23,?)", appliedAt);
  });
}
