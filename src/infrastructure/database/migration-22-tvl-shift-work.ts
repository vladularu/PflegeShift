import type { SQLiteDatabase } from "expo-sqlite";
import { withImmediateTransaction } from "./transaction";

/** Additive and forward-only; never infer confirmations from existing shifts. */
export async function migrateTvlShiftWork(db: SQLiteDatabase, appliedAt: string): Promise<void> {
  await withImmediateTransaction(db, async (tx) => {
    if (await tx.getFirstAsync("SELECT version FROM schema_migrations WHERE version=22")) return;
    await tx.execAsync(`
      CREATE TABLE tvl_shift_work (
        shift_id TEXT NOT NULL REFERENCES shift_entries(id) ON DELETE CASCADE,
        profile_effective_from TEXT NOT NULL,
        confirmation_json TEXT NOT NULL CHECK (json_valid(confirmation_json)),
        PRIMARY KEY (shift_id,profile_effective_from)
      );
    `);
    await tx.runAsync("INSERT INTO schema_migrations(version,applied_at) VALUES(22,?)", appliedAt);
  });
}
