import type { SQLiteDatabase } from "expo-sqlite";
import { withImmediateTransaction } from "./transaction";

/** Additive and forward-only. Existing overtime allocations do not imply AVR entitlement. */
export async function migrateCaritasOvertime(db: SQLiteDatabase, appliedAt: string): Promise<void> {
  await withImmediateTransaction(db, async (tx) => {
    if (await tx.getFirstAsync("SELECT version FROM schema_migrations WHERE version=25")) return;
    await tx.execAsync(`
      CREATE TABLE caritas_overtime (
        shift_id TEXT PRIMARY KEY NOT NULL REFERENCES shift_entries(id) ON DELETE CASCADE,
        confirmation_json TEXT NOT NULL CHECK (json_valid(confirmation_json))
      );
    `);
    await tx.runAsync("INSERT INTO schema_migrations(version,applied_at) VALUES(25,?)", appliedAt);
  });
}
