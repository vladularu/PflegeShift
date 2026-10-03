import { ANNUAL_PAYMENT_COLUMNS } from "./annual-payment-repository";
import { TRAINING_PROFILE_COLUMNS, SHIFT_TRAINING_COLUMNS } from "./training-repository";
import { PAID_ABSENCE_COLUMNS } from "./paid-absence-repository";
import { ALLOWANCE_DECISION_COLUMNS } from "./allowance-decision-repository";
import { OVERTIME_ALLOCATION_COLUMNS } from "./overtime-allocation-repository";
import type { SQLiteDatabase } from "expo-sqlite";

import {
  APPOINTMENT_COLUMNS,
  type BackupRow,
  loadCurrentDatabaseSchemaVersion,
  LocalBackupValidationError,
  PREFERENCE_COLUMNS,
  PROFILE_COLUMNS,
  requireValidatedLocalBackupDocument,
  SHIFT_COLUMNS,
  TARIFF_DECISION_COLUMNS,
  TEMPLATE_COLUMNS,
  type ValidatedLocalBackup,
} from "@/infrastructure/database/local-backup-validation";
import { LocalBackupBlockedError } from "@/infrastructure/database/local-backup";
import { USER_DATA_PREFERENCE_KEYS } from "@/infrastructure/database/preferences-repository";
import { withImmediateTransaction } from "@/infrastructure/database/transaction";
import {
  REMUNERATION_PROFILE_COLUMNS,
  initializeLegacyRemunerationProfile,
} from "./remuneration-profile-repository";

async function insertRows(
  db: SQLiteDatabase,
  table: string,
  columns: readonly string[],
  rows: readonly BackupRow[],
): Promise<void> {
  const placeholders = columns.map(() => "?").join(",");
  const sql = `INSERT INTO ${table}(${columns.join(",")}) VALUES(${placeholders})`;
  for (const row of rows) {
    await db.runAsync(sql, ...columns.map((column) => row[column] ?? null));
  }
}

/**
 * Replaces the exported user-data allowlist on the already-keyed SQLCipher
 * connection. The native caller must cancel the notification ids currently
 * registered in scheduled_entry_notifications before invoking this function;
 * the registry itself is cleared atomically with the user-data replacement.
 */
export async function restoreLocalBackup(
  db: SQLiteDatabase,
  backup: ValidatedLocalBackup,
): Promise<void> {
  const document = requireValidatedLocalBackupDocument(backup);
  await withImmediateTransaction(db, async (transaction) => {
    const openTestRun = await transaction.getFirstAsync<{ readonly month: string }>(
      "SELECT month FROM dev_test_backups ORDER BY month LIMIT 1",
    );
    if (openTestRun !== null) throw new LocalBackupBlockedError();
    const currentSchemaVersion = await loadCurrentDatabaseSchemaVersion(transaction);
    if (document.databaseSchemaVersion > currentSchemaVersion) {
      throw new LocalBackupValidationError(
        "Das Backup stammt aus einer neueren LUNA-Shift-Version.",
      );
    }

    await transaction.runAsync("DELETE FROM scheduled_entry_notifications");
    await transaction.runAsync("DELETE FROM actual_annual_payments");
    await transaction.runAsync("DELETE FROM shift_training_details");
    await transaction.runAsync("DELETE FROM training_profiles");
    await transaction.runAsync("DELETE FROM paid_absences");
    await transaction.runAsync("DELETE FROM overtime_allocations");
    await transaction.runAsync("DELETE FROM scoped_allowance_decisions");
    await transaction.runAsync("DELETE FROM shift_entries");
    await transaction.runAsync("DELETE FROM appointments");
    await transaction.runAsync("DELETE FROM monthly_tariff_decisions");
    await transaction.runAsync("DELETE FROM shift_templates");
    await transaction.runAsync("DELETE FROM remuneration_profiles");
    await transaction.runAsync("DELETE FROM user_profile");
    const preferencePlaceholders = USER_DATA_PREFERENCE_KEYS.map(() => "?").join(",");
    await transaction.runAsync(
      `DELETE FROM app_preferences WHERE key IN (${preferencePlaceholders})`,
      ...USER_DATA_PREFERENCE_KEYS,
    );

    if (document.data.profile !== null) {
      await insertRows(transaction, "user_profile", PROFILE_COLUMNS, [document.data.profile]);
    }
    if (document.version === 1) await initializeLegacyRemunerationProfile(transaction);
    else
      await insertRows(
        transaction,
        "remuneration_profiles",
        REMUNERATION_PROFILE_COLUMNS,
        document.data.remunerationProfiles,
      );
    await insertRows(transaction, "shift_templates", TEMPLATE_COLUMNS, document.data.templates);
    await insertRows(transaction, "shift_entries", SHIFT_COLUMNS, document.data.shifts);
    await insertRows(
      transaction,
      "scoped_allowance_decisions",
      ALLOWANCE_DECISION_COLUMNS,
      document.data.allowanceDecisions,
    );
    await insertRows(
      transaction,
      "overtime_allocations",
      OVERTIME_ALLOCATION_COLUMNS,
      document.data.overtimeAllocations,
    );
    await insertRows(
      transaction,
      "paid_absences",
      PAID_ABSENCE_COLUMNS,
      document.data.paidAbsences,
    );
    await insertRows(
      transaction,
      "training_profiles",
      TRAINING_PROFILE_COLUMNS,
      document.data.trainingProfiles,
    );
    await insertRows(
      transaction,
      "shift_training_details",
      SHIFT_TRAINING_COLUMNS,
      document.data.shiftTrainingDetails,
    );
    await insertRows(
      transaction,
      "actual_annual_payments",
      ANNUAL_PAYMENT_COLUMNS,
      document.data.actualAnnualPayments,
    );
    await insertRows(transaction, "appointments", APPOINTMENT_COLUMNS, document.data.appointments);
    await insertRows(
      transaction,
      "monthly_tariff_decisions",
      TARIFF_DECISION_COLUMNS,
      document.data.monthlyTariffDecisions,
    );
    await insertRows(transaction, "app_preferences", PREFERENCE_COLUMNS, document.data.preferences);

    const foreignKeyErrors = await transaction.getAllAsync<{ readonly table: string }>(
      "PRAGMA foreign_key_check",
    );
    if (foreignKeyErrors.length > 0) {
      throw new LocalBackupValidationError("Das Backup enthält ungültige Datenverknüpfungen.");
    }
  });
}
