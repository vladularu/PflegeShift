import type { SQLiteDatabase } from "expo-sqlite";

import { parseDevBackupPayload } from "@/infrastructure/database/dev-backup-payload";
import { withImmediateTransaction } from "@/infrastructure/database/transaction";

export const TOMBSTONE_RETENTION_DAYS = 90;

export interface TombstonePurgeResult {
  readonly appointments: number;
  readonly shifts: number;
  readonly templates: number;
}

function retentionCutoff(now: Date): string {
  const timestamp = now.getTime();
  if (!Number.isFinite(timestamp)) {
    throw new Error("Der Zeitpunkt für die Tombstone-Bereinigung ist ungültig.");
  }
  return new Date(timestamp - TOMBSTONE_RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();
}

export async function purgeExpiredTombstones(
  db: SQLiteDatabase,
  now = new Date(),
): Promise<TombstonePurgeResult> {
  const cutoff = retentionCutoff(now);
  let result: TombstonePurgeResult = {
    appointments: 0,
    shifts: 0,
    templates: 0,
  };

  await withImmediateTransaction(db, async (transaction) => {
    // Dependent entries are removed before templates so foreign keys remain valid.
    const shifts = await transaction.runAsync(
      `DELETE FROM shift_entries
       WHERE deleted_at IS NOT NULL AND deleted_at < ?
         AND NOT EXISTS (
           SELECT 1 FROM dev_test_backups
           WHERE dev_test_backups.month=substr(shift_entries.date,1,7)
         )`,
      cutoff,
    );
    const appointments = await transaction.runAsync(
      `DELETE FROM appointments
       WHERE deleted_at IS NOT NULL AND deleted_at < ?
         AND NOT EXISTS (
           SELECT 1 FROM dev_test_backups
           WHERE dev_test_backups.month=substr(appointments.date,1,7)
         )`,
      cutoff,
    );
    const backupRows = await transaction.getAllAsync<{ month: string; payload: string }>(
      "SELECT month,payload FROM dev_test_backups",
    );
    const protectedTemplateIds = new Set<string>();
    let backupIntegrityUnknown = false;
    for (const backup of backupRows) {
      try {
        const payload = parseDevBackupPayload(backup.payload, backup.month);
        payload.shifts.forEach((shift) => {
          if (shift.template_id !== null) protectedTemplateIds.add(shift.template_id);
        });
      } catch {
        // A damaged backup may still reference any template. Retain all template
        // tombstones until the backup can be inspected or explicitly removed.
        backupIntegrityUnknown = true;
        break;
      }
    }

    let purgedTemplates = 0;
    if (!backupIntegrityUnknown) {
      const candidates = await transaction.getAllAsync<{ id: string }>(
        `SELECT id FROM shift_templates
         WHERE deleted_at IS NOT NULL AND deleted_at < ?
           AND id NOT LIKE 'default-%'
           AND NOT EXISTS (
             SELECT 1 FROM shift_entries
             WHERE shift_entries.template_id=shift_templates.id
           )`,
        cutoff,
      );
      for (const candidate of candidates) {
        if (protectedTemplateIds.has(candidate.id)) continue;
        const deleted = await transaction.runAsync(
          "DELETE FROM shift_templates WHERE id=? AND deleted_at IS NOT NULL AND deleted_at < ?",
          candidate.id,
          cutoff,
        );
        purgedTemplates += deleted.changes;
      }
    }
    result = {
      appointments: appointments.changes,
      shifts: shifts.changes,
      templates: purgedTemplates,
    };
  });

  return Object.freeze(result);
}
