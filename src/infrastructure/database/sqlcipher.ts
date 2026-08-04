import { sqlCipherKeyLiteral } from "@/infrastructure/database/database-key";

export interface SqlCipherDatabase {
  execAsync(source: string): Promise<unknown>;
  getFirstAsync(source: string): Promise<unknown>;
  getAllAsync(source: string): Promise<unknown[]>;
}

function readStringColumn(row: unknown, column: string): string | null {
  if (typeof row !== "object" || row === null) return null;
  const value = Reflect.get(row, column);
  return typeof value === "string" ? value : null;
}

function assertSchemaName(schema: string): string {
  if (!/^[a-z][a-z0-9_]*$/i.test(schema)) {
    throw new Error("Ungültiger Datenbankalias.");
  }
  return schema;
}

export async function applyAndVerifySqlCipher(
  database: SqlCipherDatabase,
  key: string,
): Promise<void> {
  await database.execAsync(`PRAGMA key = ${sqlCipherKeyLiteral(key)};`);
  const cipher = await database.getFirstAsync("PRAGMA cipher_version;");
  if (readStringColumn(cipher, "cipher_version") === null) {
    throw new Error("Dieser native Build enthält keine SQLCipher-Unterstützung.");
  }
  await database.getFirstAsync("SELECT count(*) AS count FROM sqlite_master;");
}

export async function assertQuickCheck(
  database: SqlCipherDatabase,
  schema = "main",
): Promise<void> {
  const safeSchema = assertSchemaName(schema);
  const result = await database.getFirstAsync(`PRAGMA ${safeSchema}.quick_check;`);
  if (readStringColumn(result, "quick_check") !== "ok") {
    throw new Error("Die SQLite-Integritätsprüfung ist fehlgeschlagen.");
  }
}

export async function assertCipherIntegrity(
  database: SqlCipherDatabase,
  schema = "main",
): Promise<void> {
  const safeSchema = assertSchemaName(schema);
  const errors = await database.getAllAsync(`PRAGMA ${safeSchema}.cipher_integrity_check;`);
  if (errors.length > 0) {
    throw new Error("Die SQLCipher-Integritätsprüfung ist fehlgeschlagen.");
  }
}
