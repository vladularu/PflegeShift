export class BackupTempCleanupError extends Error {
  readonly code = "BACKUP_TEMP_CLEANUP_FAILED";

  constructor(
    readonly operationFailed: boolean,
    cause: unknown,
  ) {
    super("Die temporäre Backup-Kopie konnte nicht entfernt werden.", { cause });
    this.name = "BackupTempCleanupError";
  }
}

// Only current-operation files are eligible. Never enumerate or delete a directory.
export function assertBackupTempUri(cacheUri: string, uri: string, kind: "export" | "import") {
  const root = cacheUri.endsWith("/") ? cacheUri : `${cacheUri}/`;
  if (!root.startsWith("file:///") || !uri.startsWith(root)) {
    throw new Error("Backup temporary file is outside the app cache");
  }
  const relative = uri.slice(root.length);
  const allowed =
    kind === "export"
      ? /^LUNA-Shift-Backup-[0-9T-]+-[a-f0-9-]{36}\.json$/i
      : /^DocumentPicker\/[a-z0-9-]+\.[a-z0-9]+$/i;
  if (!allowed.test(relative)) throw new Error("Unexpected backup temporary file path");
}

export async function withBackupTempFile<T>(input: {
  readonly cacheUri: string;
  readonly uri: string;
  readonly kind: "export" | "import";
  readonly run: () => Promise<T>;
  readonly remove: () => void;
}): Promise<T> {
  assertBackupTempUri(input.cacheUri, input.uri, input.kind);
  let operationFailed = false;
  let operationError: unknown;
  try {
    return await input.run();
  } catch (error) {
    operationFailed = true;
    operationError = error;
    throw error;
  } finally {
    try {
      input.remove();
    } catch (cleanupError) {
      throw new BackupTempCleanupError(
        operationFailed,
        operationFailed ? new AggregateError([operationError, cleanupError]) : cleanupError,
      );
    }
  }
}
