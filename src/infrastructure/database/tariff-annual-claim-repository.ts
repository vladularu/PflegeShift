import type { SQLiteDatabase } from "expo-sqlite";
import { ConcurrencyError, UserFacingError } from "@/domain/errors";
import {
  TARIFF_ANNUAL_CLAIM_LIMIT,
  TARIFF_ANNUAL_CLAIM_TEST_LOCK,
  validateSavedTariffAnnualClaim,
  validateSavedTariffAnnualClaims,
  type SavedTariffAnnualClaim,
  type SaveTariffAnnualClaimInput,
} from "@/domain/saved-tariff-annual-claim";
import { withImmediateTransaction } from "./transaction";

export const TARIFF_ANNUAL_CLAIM_COLUMNS = [
  "claim_id",
  "entitlement_year",
  "claim_json",
  "actual_payment_json",
  "revoked",
  "revision",
  "updated_at",
] as const;
export function mapTariffAnnualClaimRow(value: unknown): SavedTariffAnnualClaim {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.keys(value).length !== TARIFF_ANNUAL_CLAIM_COLUMNS.length ||
    TARIFF_ANNUAL_CLAIM_COLUMNS.some((key) => !Object.hasOwn(value, key))
  )
    throw new UserFacingError("Ungültiger Tarif-Jahresdatensatz.");
  const row = value as Record<string, unknown>;
  if (
    typeof row.claim_json !== "string" ||
    (row.actual_payment_json !== null && typeof row.actual_payment_json !== "string") ||
    (row.revoked !== 0 && row.revoked !== 1)
  )
    throw new UserFacingError("Ungültiger Tarif-Jahresdatensatz.");
  let claim: unknown, actualPayment: unknown;
  try {
    claim = JSON.parse(row.claim_json);
    actualPayment = row.actual_payment_json === null ? null : JSON.parse(row.actual_payment_json);
  } catch {
    throw new UserFacingError("Der Tarif-Jahresdatensatz ist beschädigt.");
  }
  const saved = validateSavedTariffAnnualClaim({
    claim,
    actualPayment,
    revoked: row.revoked === 1,
    revision: row.revision,
    updatedAt: row.updated_at,
  });
  if (saved.claim.version === 3)
    throw new UserFacingError(
      "Die Caritas-Jahresbestätigung ist in diesem Speicherformat noch nicht verfügbar.",
    );
  if (saved.claim.id !== row.claim_id || saved.claim.year !== row.entitlement_year)
    throw new UserFacingError("Die Tarif-Jahreszuordnung ist ungültig.");
  return saved;
}
export async function listTariffAnnualClaims(
  db: SQLiteDatabase,
): Promise<readonly SavedTariffAnnualClaim[]> {
  const rows = await db.getAllAsync(
    `SELECT ${TARIFF_ANNUAL_CLAIM_COLUMNS.join(",")} FROM tariff_annual_claims ORDER BY entitlement_year,claim_id`,
  );
  return validateSavedTariffAnnualClaims(rows.map(mapTariffAnnualClaimRow));
}
async function writeClaim(
  db: SQLiteDatabase,
  next: SavedTariffAnnualClaim,
  expected: SavedTariffAnnualClaim | null,
): Promise<SavedTariffAnnualClaim> {
  if (next.claim.version === 3)
    throw new UserFacingError(
      "Die Caritas-Jahresbestätigung ist in diesem Speicherformat noch nicht verfügbar.",
    );
  return withImmediateTransaction(db, async (tx) => {
    if (await tx.getFirstAsync("SELECT month FROM dev_test_backups LIMIT 1"))
      throw new UserFacingError(TARIFF_ANNUAL_CLAIM_TEST_LOCK);
    const row = await tx.getFirstAsync(
      `SELECT ${TARIFF_ANNUAL_CLAIM_COLUMNS.join(",")} FROM tariff_annual_claims WHERE claim_id=? AND entitlement_year=?`,
      next.claim.id,
      next.claim.year,
    );
    const previous = row === null ? null : mapTariffAnnualClaimRow(row);
    if (JSON.stringify(previous) !== JSON.stringify(expected))
      throw new ConcurrencyError(
        "Der Tarif-Jahresanspruch wurde inzwischen geändert. Bitte neu laden.",
      );
    if ((await tx.getFirstAsync("SELECT id FROM user_profile WHERE id='singleton'")) === null)
      throw new UserFacingError("Bitte zuerst ein Arbeitsprofil einrichten.");
    if (previous === null) {
      const count = await tx.getFirstAsync<{ n: number }>(
        "SELECT COUNT(*) AS n FROM tariff_annual_claims",
      );
      if (!count || count.n >= TARIFF_ANNUAL_CLAIM_LIMIT)
        throw new UserFacingError(
          "Die maximale Anzahl gespeicherter Tarif-Jahresansprüche wurde erreicht.",
        );
    }
    const saved = validateSavedTariffAnnualClaim({
      ...next,
      updatedAt: new Date(
        Math.max(Date.now(), previous ? Date.parse(previous.updatedAt) + 1 : 0),
      ).toISOString(),
    });
    await tx.runAsync(
      `INSERT INTO tariff_annual_claims(${TARIFF_ANNUAL_CLAIM_COLUMNS.join(",")}) VALUES(?,?,?,?,?,?,?)
      ON CONFLICT(claim_id,entitlement_year) DO UPDATE SET
        claim_json=excluded.claim_json, actual_payment_json=excluded.actual_payment_json,
        revoked=excluded.revoked, revision=excluded.revision, updated_at=excluded.updated_at`,
      saved.claim.id,
      saved.claim.year,
      JSON.stringify(saved.claim),
      saved.actualPayment === null ? null : JSON.stringify(saved.actualPayment),
      saved.revoked ? 1 : 0,
      saved.revision,
      saved.updatedAt,
    );
    return saved;
  });
}
export async function saveTariffAnnualClaim(
  db: SQLiteDatabase,
  input: SaveTariffAnnualClaimInput,
): Promise<SavedTariffAnnualClaim> {
  // Copy/validate synchronously before joining the transaction queue.
  const expected = input.expected === null ? null : validateSavedTariffAnnualClaim(input.expected);
  const next = validateSavedTariffAnnualClaim({
    claim: input.claim,
    actualPayment: input.actualPayment,
    revoked: false,
    revision: (expected?.revision ?? 0) + 1,
    updatedAt: new Date().toISOString(),
  });
  if (expected && (next.claim.id !== expected.claim.id || next.claim.year !== expected.claim.year))
    throw new UserFacingError(
      "Die Kennung und das Jahr eines bestehenden Anspruchs dürfen nicht geändert werden.",
    );
  return writeClaim(db, next, expected);
}
export async function revokeTariffAnnualClaim(
  db: SQLiteDatabase,
  value: SavedTariffAnnualClaim,
): Promise<SavedTariffAnnualClaim> {
  const expected = validateSavedTariffAnnualClaim(value);
  const next = validateSavedTariffAnnualClaim({
    ...expected,
    revoked: true,
    revision: expected.revision + 1,
  });
  return writeClaim(db, next, expected);
}
