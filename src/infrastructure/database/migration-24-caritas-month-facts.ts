import type { SQLiteDatabase } from "expo-sqlite";
import { withImmediateTransaction } from "./transaction";

/** Additive, forward-only and without an inferred entitlement backfill. */
export async function migrateCaritasMonthFacts(
  db: SQLiteDatabase,
  appliedAt: string,
): Promise<void> {
  await withImmediateTransaction(db, async (tx) => {
    if (await tx.getFirstAsync("SELECT version FROM schema_migrations WHERE version=24")) return;
    await tx.execAsync(`
      CREATE TABLE caritas_month_facts (
        month TEXT PRIMARY KEY NOT NULL,
        facts_json TEXT NOT NULL CHECK (json_valid(facts_json))
      );
    `);
    await tx.runAsync("INSERT INTO schema_migrations(version,applied_at) VALUES(24,?)", appliedAt);
  });
}
