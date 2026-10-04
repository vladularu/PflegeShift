import type { SQLiteDatabase } from "expo-sqlite";
import { withImmediateTransaction } from "./transaction";

/** Forward-only. The draft facts are separate from the existing base-pay answers. */
export async function migrateTvoedAnnexAPremiumFacts(
  db: SQLiteDatabase,
  appliedAt: string,
): Promise<void> {
  await withImmediateTransaction(db, async (tx) => {
    if (await tx.getFirstAsync("SELECT version FROM schema_migrations WHERE version=29")) return;
    await tx.execAsync(`
      CREATE TABLE tvoed_annex_a_premium_facts (
        month TEXT PRIMARY KEY NOT NULL,
        facts_json TEXT NOT NULL CHECK (json_valid(facts_json))
      );
    `);
    await tx.runAsync("INSERT INTO schema_migrations(version,applied_at) VALUES(29,?)", appliedAt);
  });
}
