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

async function insertRows(
  db: SQLiteDatabase,
  table: string,
  columns: readonly string[],
  rows: readonly BackupRow[],
): Promise<void> {
  const placeholders = columns.map(() => "?").join(",");
  const sql = `INSERT INTO ${table}(${columns.join(",")}) VALUES(${placeholders})`;
  for (const row of rows) {
    await db.runAsync(sql, ...columns.map((column) => row[column]));
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
    await transaction.runAsync("DELETE FROM shift_entries");
    await transaction.runAsync("DELETE FROM appointments");
    await transaction.runAsync("DELETE FROM monthly_tariff_decisions");
    await transaction.runAsync("DELETE FROM shift_templates");
    await transaction.runAsync("DELETE FROM user_profile");
    const preferencePlaceholders = USER_DATA_PREFERENCE_KEYS.map(() => "?").join(",");
    await transaction.runAsync(
      `DELETE FROM app_preferences WHERE key IN (${preferencePlaceholders})`,
      ...USER_DATA_PREFERENCE_KEYS,
    );

    if (document.data.profile !== null) {
      await insertRows(transaction, "user_profile", PROFILE_COLUMNS, [document.data.profile]);
    }
    await insertRows(transaction, "shift_templates", TEMPLATE_COLUMNS, document.data.templates);
    await insertRows(transaction, "shift_entries", SHIFT_COLUMNS, document.data.shifts);
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
