import type { SQLiteDatabase } from "expo-sqlite";
import { withImmediateTransaction } from "./transaction";

/** Immutable additive migration. Intentionally no destructive down operation. */
export async function migrateTariffAnnualClaims(
  db: SQLiteDatabase,
  appliedAt: string,
): Promise<void> {
  await withImmediateTransaction(db, async (tx) => {
    if (await tx.getFirstAsync("SELECT version FROM schema_migrations WHERE version=21")) return;
    await tx.execAsync(`
      CREATE TABLE tariff_annual_claims (
        claim_id TEXT NOT NULL,
        entitlement_year INTEGER NOT NULL CHECK (typeof(entitlement_year)='integer' AND entitlement_year BETWEEN 1900 AND 4099),
        claim_json TEXT NOT NULL CHECK (json_valid(claim_json)),
        actual_payment_json TEXT CHECK (actual_payment_json IS NULL OR json_valid(actual_payment_json)),
        revoked INTEGER NOT NULL CHECK (revoked IN (0,1)),
        revision INTEGER NOT NULL CHECK (typeof(revision)='integer' AND revision >= 1),
        updated_at TEXT NOT NULL,
        PRIMARY KEY(claim_id,entitlement_year)
      );
    `);
    await tx.runAsync("INSERT INTO schema_migrations(version,applied_at) VALUES(21,?)", appliedAt);
  });
}
