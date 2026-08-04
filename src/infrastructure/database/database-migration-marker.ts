export type DatabaseMigrationSource = "fresh" | "legacy";

interface MarkerDatabase {
  getFirstAsync<T>(source: string, ...params: unknown[]): Promise<T | null>;
  runAsync(source: string, ...params: unknown[]): Promise<unknown>;
}

interface MarkerRow {
  value: string;
}

interface DatabaseMigrationMarker {
  source: DatabaseMigrationSource;
  version: 1;
}

const MARKER_KEY = "database_encryption_v1";

function parseMarker(value: string): DatabaseMigrationMarker | null {
  try {
    const parsed: unknown = JSON.parse(value);
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      "source" in parsed &&
      "version" in parsed &&
      (parsed.source === "fresh" || parsed.source === "legacy") &&
      parsed.version === 1
    ) {
      return { source: parsed.source, version: 1 };
    }
  } catch {
    // Invalid markers are treated exactly like missing markers.
  }
  return null;
}

export async function writeDatabaseMigrationMarker(
  database: Pick<MarkerDatabase, "runAsync">,
  source: DatabaseMigrationSource,
): Promise<void> {
  const value = JSON.stringify({ source, version: 1 } satisfies DatabaseMigrationMarker);
  await database.runAsync(
    `INSERT INTO app_preferences(key,value,updated_at) VALUES(?,?,datetime('now'))
     ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at`,
    MARKER_KEY,
    value,
  );
}

export async function assertDatabaseMigrationMarker(
  database: Pick<MarkerDatabase, "getFirstAsync">,
  expectedSource?: DatabaseMigrationSource,
): Promise<void> {
  const row = await database.getFirstAsync<MarkerRow>(
    "SELECT value FROM app_preferences WHERE key=?",
    MARKER_KEY,
  );
  const marker = row === null ? null : parseMarker(row.value);
  if (marker === null || (expectedSource !== undefined && marker.source !== expectedSource)) {
    throw new Error("Der sichere Datenbank-Migrationsnachweis fehlt oder ist ungültig.");
  }
}
