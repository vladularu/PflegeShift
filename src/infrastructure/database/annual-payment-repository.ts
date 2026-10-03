import type { SQLiteDatabase } from "expo-sqlite";
import { ConcurrencyError, UserFacingError } from "@/domain/errors";
import {
  validateActualOwnAnnualPayments,
  type ActualOwnAnnualPayment,
} from "@/domain/annual-payment";
import {
  ACTUAL_ANNUAL_PAYMENT_TEST_LOCK,
  validateSavedActualOwnAnnualPayment,
  validateSavedActualOwnAnnualPayments,
  type SavedActualOwnAnnualPayment,
  type SaveActualOwnAnnualPaymentInput,
} from "@/domain/saved-annual-payment";
import { withImmediateTransaction } from "./transaction";

export const ANNUAL_PAYMENT_COLUMNS = [
  "payment_id",
  "entitlement_year",
  "payment_json",
  "revoked",
  "updated_at",
] as const;
export interface AnnualPaymentRow {
  readonly payment_id: string;
  readonly entitlement_year: number;
  readonly payment_json: string;
  readonly revoked: number;
  readonly updated_at: string;
}
export function mapAnnualPaymentRow(value: unknown): SavedActualOwnAnnualPayment {
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.keys(value).length !== ANNUAL_PAYMENT_COLUMNS.length ||
    ANNUAL_PAYMENT_COLUMNS.some((key) => !Object.hasOwn(value, key))
  )
    throw new UserFacingError("Ungültiger Sonderzahlungsdatensatz.");
  const row = value as Record<string, unknown>;
  if (typeof row.payment_json !== "string" || (row.revoked !== 0 && row.revoked !== 1))
    throw new UserFacingError("Ungültiger Sonderzahlungsdatensatz.");
  const record = validateSavedActualOwnAnnualPayment({
    payment: JSON.parse(row.payment_json) as unknown,
    revoked: row.revoked === 1,
    updatedAt: row.updated_at,
  });
  if (
    record.payment.paymentId !== row.payment_id ||
    record.payment.entitlementYear !== row.entitlement_year
  )
    throw new UserFacingError("Die Sonderzahlungszuordnung ist ungültig.");
  return record;
}
export async function listActualOwnAnnualPayments(
  db: SQLiteDatabase,
): Promise<readonly SavedActualOwnAnnualPayment[]> {
  const rows = await db.getAllAsync<AnnualPaymentRow>(
    `SELECT ${ANNUAL_PAYMENT_COLUMNS.join(",")} FROM actual_annual_payments ORDER BY entitlement_year,payment_id`,
  );
  return validateSavedActualOwnAnnualPayments(rows.map(mapAnnualPaymentRow));
}

async function writePayment(
  db: SQLiteDatabase,
  payment: ActualOwnAnnualPayment,
  expected: SavedActualOwnAnnualPayment | null,
  revoked: boolean,
): Promise<SavedActualOwnAnnualPayment> {
  return withImmediateTransaction(db, async (tx) => {
    const openTestRun = await tx.getFirstAsync("SELECT month FROM dev_test_backups LIMIT 1");
    if (openTestRun !== null) throw new UserFacingError(ACTUAL_ANNUAL_PAYMENT_TEST_LOCK);
    const row = await tx.getFirstAsync<AnnualPaymentRow>(
      `SELECT ${ANNUAL_PAYMENT_COLUMNS.join(",")} FROM actual_annual_payments WHERE payment_id=? AND entitlement_year=?`,
      payment.paymentId,
      payment.entitlementYear,
    );
    const previous = row === null ? null : mapAnnualPaymentRow(row);
    if (JSON.stringify(previous) !== JSON.stringify(expected))
      throw new ConcurrencyError("Die Sonderzahlung wurde inzwischen geändert. Bitte neu laden.");
    if ((await tx.getFirstAsync("SELECT id FROM user_profile WHERE id='singleton'")) === null)
      throw new UserFacingError("Bitte zuerst ein Arbeitsprofil einrichten.");
    if (previous === null) {
      const count = await tx.getFirstAsync<{ n: number }>(
        "SELECT COUNT(*) AS n FROM actual_annual_payments",
      );
      if (!count || count.n >= 4096)
        throw new UserFacingError(
          "Die maximale Anzahl gespeicherter Sonderzahlungen wurde erreicht.",
        );
    }
    const saved = validateSavedActualOwnAnnualPayment({
      payment,
      revoked,
      updatedAt: new Date(
        Math.max(Date.now(), previous ? Date.parse(previous.updatedAt) + 1 : 0),
      ).toISOString(),
    });
    await tx.runAsync(
      `INSERT INTO actual_annual_payments(${ANNUAL_PAYMENT_COLUMNS.join(",")}) VALUES(?,?,?,?,?)
      ON CONFLICT(payment_id,entitlement_year) DO UPDATE SET payment_json=excluded.payment_json,revoked=excluded.revoked,updated_at=excluded.updated_at`,
      payment.paymentId,
      payment.entitlementYear,
      JSON.stringify(payment),
      revoked ? 1 : 0,
      saved.updatedAt,
    );
    return saved;
  });
}

export async function saveActualOwnAnnualPayment(
  db: SQLiteDatabase,
  input: SaveActualOwnAnnualPaymentInput,
): Promise<SavedActualOwnAnnualPayment> {
  // Validate/copy all caller-owned data before entering the asynchronous transaction queue.
  const expected =
    input.expected === null ? null : validateSavedActualOwnAnnualPayment(input.expected);
  const keys = ["paymentId", "entitlementYear", "payoutMonth", "title", "grossCents"];
  if (
    !input.payment ||
    Object.keys(input.payment).length !== keys.length ||
    keys.some((key) => !Object.hasOwn(input.payment, key))
  )
    throw new UserFacingError("Ungültige Sonderzahlungseingabe.");
  const payment = validateActualOwnAnnualPayments([
    { ...input.payment, version: 1, revision: (expected?.payment.revision ?? 0) + 1 },
  ])[0];
  if (
    expected &&
    (payment.paymentId !== expected.payment.paymentId ||
      payment.entitlementYear !== expected.payment.entitlementYear)
  )
    throw new UserFacingError(
      "Die Zuordnung einer bestehenden Sonderzahlung darf nicht geändert werden.",
    );
  return writePayment(db, payment, expected, false);
}

export async function revokeActualOwnAnnualPayment(
  db: SQLiteDatabase,
  expectedInput: SavedActualOwnAnnualPayment,
): Promise<SavedActualOwnAnnualPayment> {
  const expected = validateSavedActualOwnAnnualPayment(expectedInput);
  const payment = validateActualOwnAnnualPayments([
    { ...expected.payment, revision: expected.payment.revision + 1 },
  ])[0];
  return writePayment(db, payment, expected, true);
}
