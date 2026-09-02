import type {
  LocalBackupPreview,
  ValidatedLocalBackup,
} from "@/infrastructure/database/local-backup-validation";
import {
  LocalBackupValidationError,
  MAX_LOCAL_BACKUP_CHARACTERS,
  validateLocalBackup,
} from "@/infrastructure/database/local-backup-validation";
import {
  LocalBackupReloadRequiredError,
  LocalBackupRestoreRecoveryError,
  LocalBackupSelectionError,
} from "@/features/data-backup/local-backup-restore-errors";

const JSON_MIME_TYPES = new Set([
  "application/json",
  "application/octet-stream",
  "text/json",
  "text/plain",
]);

export interface LocalBackupFileSelection {
  readonly name: string;
  readonly size: number | null;
  readonly mimeType: string | null;
}

export interface LocalBackupRestoreCandidate {
  readonly fileName: string;
  readonly backup: ValidatedLocalBackup;
  readonly preview: LocalBackupPreview;
}

function validateFileSelection(selection: LocalBackupFileSelection): string {
  const fileName = selection.name.trim();
  if (
    fileName.length === 0 ||
    fileName.length > 255 ||
    fileName !== selection.name ||
    !fileName.toLocaleLowerCase("de-DE").endsWith(".json")
  ) {
    throw new LocalBackupSelectionError("Wähle eine gültige JSON-Backup-Datei aus.");
  }
  if (
    selection.size !== null &&
    (!Number.isSafeInteger(selection.size) ||
      selection.size < 1 ||
      selection.size > MAX_LOCAL_BACKUP_CHARACTERS)
  ) {
    throw new LocalBackupSelectionError("Die Backup-Datei ist leer oder zu groß.");
  }
  if (
    selection.mimeType !== null &&
    !JSON_MIME_TYPES.has(selection.mimeType.trim().toLocaleLowerCase("en-US"))
  ) {
    throw new LocalBackupSelectionError("Wähle eine gültige JSON-Backup-Datei aus.");
  }
  return fileName;
}

export async function loadLocalBackupRestoreCandidate(input: {
  readonly selection: LocalBackupFileSelection;
  readonly maxDatabaseSchemaVersion: number;
  readonly readText: () => Promise<string>;
  readonly sha256: (value: string) => Promise<string>;
}): Promise<LocalBackupRestoreCandidate> {
  const fileName = validateFileSelection(input.selection);
  const serialized = await input.readText();
  let backup: ValidatedLocalBackup;
  try {
    backup = await validateLocalBackup(serialized, {
      maxDatabaseSchemaVersion: input.maxDatabaseSchemaVersion,
      sha256: input.sha256,
    });
  } catch (error) {
    if (error instanceof LocalBackupValidationError) {
      throw new LocalBackupSelectionError(error.message);
    }
    throw error;
  }
  return Object.freeze({ fileName, backup, preview: backup.preview });
}

export async function performLocalBackupRestore(input: {
  readonly candidate: LocalBackupRestoreCandidate;
  readonly cancelCurrentNotifications: () => Promise<void>;
  readonly restore: (backup: ValidatedLocalBackup) => Promise<void>;
  readonly recoverCurrentNotifications: () => Promise<void>;
  readonly reloadApp: () => Promise<void>;
}): Promise<void> {
  try {
    await input.cancelCurrentNotifications();
    await input.restore(input.candidate.backup);
  } catch (error) {
    try {
      await input.recoverCurrentNotifications();
    } catch {
      throw new LocalBackupRestoreRecoveryError();
    }
    throw error;
  }

  try {
    await input.reloadApp();
  } catch {
    throw new LocalBackupReloadRequiredError();
  }
}
