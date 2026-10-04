import type { SQLiteDatabase } from "expo-sqlite";
import { withImmediateTransaction } from "./transaction";

/** Additive and forward-only; existing profiles receive no inferred confirmations. */
export async function migrateTvoedSueMonthConfirmations(
  db: SQLiteDatabase,
  appliedAt: string,
): Promise<void> {
  await withImmediateTransaction(db, async (tx) => {
    if (await tx.getFirstAsync("SELECT version FROM schema_migrations WHERE version=27")) return;
    await tx.execAsync(`
      CREATE TABLE tvoed_sue_month_confirmations (
        month TEXT PRIMARY KEY NOT NULL,
        confirmation_json TEXT NOT NULL CHECK (json_valid(confirmation_json))
      );
    `);
    await tx.runAsync("INSERT INTO schema_migrations(version,applied_at) VALUES(27,?)", appliedAt);
  });
}
