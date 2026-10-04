import type { SQLiteDatabase } from "expo-sqlite";
import { withImmediateTransaction } from "./transaction";

/** Additive, forward-only table. Reverting behavior must not erase personal answers. */
export async function migrateDrkTrainingMonthConfirmations(
  db: SQLiteDatabase,
  appliedAt: string,
): Promise<void> {
  await withImmediateTransaction(db, async (tx) => {
    if (await tx.getFirstAsync("SELECT version FROM schema_migrations WHERE version=31")) return;
    await tx.execAsync(`
      CREATE TABLE drk_training_month_confirmations (
        month TEXT PRIMARY KEY NOT NULL,
        confirmation_json TEXT NOT NULL CHECK (json_valid(confirmation_json))
      );
    `);
    await tx.runAsync("INSERT INTO schema_migrations(version,applied_at) VALUES(31,?)", appliedAt);
  });
}
