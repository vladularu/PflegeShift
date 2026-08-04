export type DatabaseSecurityErrorCode = "expo-go-unsupported" | "migration-failed" | "missing-key";

const GENERIC_DATABASE_SECURITY_MESSAGE =
  "Die verschlüsselte Datenbank konnte nicht sicher vorbereitet werden. Deine vorhandenen Daten wurden nicht gelöscht.";

export class DatabaseSecurityError extends Error {
  readonly code: DatabaseSecurityErrorCode;

  constructor(code: DatabaseSecurityErrorCode, message: string) {
    super(message);
    this.name = "DatabaseSecurityError";
    this.code = code;
  }
}

export function databaseSecurityMessage(error: unknown): string {
  return error instanceof DatabaseSecurityError ? error.message : GENERIC_DATABASE_SECURITY_MESSAGE;
}
