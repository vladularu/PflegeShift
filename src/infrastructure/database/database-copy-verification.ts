interface QueryDatabase {
  getAllAsync<T>(source: string): Promise<T[]>;
  getFirstAsync<T>(source: string): Promise<T | null>;
}

interface SchemaObjectRow {
  name: string;
  sql: string | null;
  tbl_name: string;
  type: "index" | "table" | "trigger" | "view";
}

interface CountRow {
  count: number;
}

interface DifferenceRow {
  has_difference: number;
}

interface CheckpointRow {
  busy: number;
  checkpointed: number;
  log: number;
}

function quoteIdentifier(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}

function assertSchemaName(value: string): string {
  if (!/^[a-z][a-z0-9_]*$/i.test(value)) {
    throw new Error("Ungültiger Datenbankalias.");
  }
  return value;
}

function assertNonNegativeInteger(value: unknown, message: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    throw new Error(message);
  }
  return value as number;
}

function assertCheckpointInteger(value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number) < -1) {
    throw new Error("Der WAL-Checkpoint konnte nicht geprüft werden.");
  }
  return value as number;
}

async function readSchemaObjects(
  database: QueryDatabase,
  schema: string,
): Promise<SchemaObjectRow[]> {
  const safeSchema = assertSchemaName(schema);
  return database.getAllAsync<SchemaObjectRow>(
    `SELECT type, name, tbl_name, sql FROM ${safeSchema}.sqlite_master
     WHERE type IN ('table','index','view','trigger')
       AND (name NOT LIKE 'sqlite_%' OR name = 'sqlite_sequence')
     ORDER BY type, name`,
  );
}

async function readTableCount(
  database: QueryDatabase,
  schema: string,
  table: string,
): Promise<number> {
  const safeSchema = assertSchemaName(schema);
  const result = await database.getFirstAsync<CountRow>(
    `SELECT count(*) AS count FROM ${safeSchema}.${quoteIdentifier(table)}`,
  );
  return assertNonNegativeInteger(result?.count, "Die Datenbankzählung ist fehlgeschlagen.");
}

async function hasSetDifference(
  database: QueryDatabase,
  sourceSchema: string,
  targetSchema: string,
  table: string,
): Promise<boolean> {
  const safeSource = assertSchemaName(sourceSchema);
  const safeTarget = assertSchemaName(targetSchema);
  const quotedTable = quoteIdentifier(table);
  const result = await database.getFirstAsync<DifferenceRow>(
    `SELECT EXISTS(
       SELECT * FROM ${safeSource}.${quotedTable}
       EXCEPT
       SELECT * FROM ${safeTarget}.${quotedTable}
     ) AS has_difference`,
  );
  if (result?.has_difference !== 0 && result?.has_difference !== 1) {
    throw new Error("Die Datenkopie konnte nicht verifiziert werden.");
  }
  return result.has_difference === 1;
}

export async function assertAttachedDatabaseCopy(database: QueryDatabase): Promise<void> {
  const sourceObjects = await readSchemaObjects(database, "main");
  const targetObjects = await readSchemaObjects(database, "encrypted");
  if (JSON.stringify(sourceObjects) !== JSON.stringify(targetObjects)) {
    throw new Error("Das verschlüsselte Datenbankschema ist unvollständig.");
  }

  const tables = sourceObjects.filter((item) => item.type === "table").map((item) => item.name);
  for (const table of tables) {
    const sourceCount = await readTableCount(database, "main", table);
    const targetCount = await readTableCount(database, "encrypted", table);
    if (sourceCount !== targetCount) {
      throw new Error("Die verschlüsselte Datenkopie ist unvollständig.");
    }
    if (
      (await hasSetDifference(database, "main", "encrypted", table)) ||
      (await hasSetDifference(database, "encrypted", "main", table))
    ) {
      throw new Error("Die verschlüsselte Datenkopie enthält abweichende Daten.");
    }
  }
}

export async function checkpointWal(database: Pick<QueryDatabase, "getFirstAsync">): Promise<void> {
  const result = await database.getFirstAsync<CheckpointRow>("PRAGMA wal_checkpoint(TRUNCATE);");
  const busy = assertNonNegativeInteger(
    result?.busy,
    "Der WAL-Checkpoint konnte nicht geprüft werden.",
  );
  assertCheckpointInteger(result?.log);
  assertCheckpointInteger(result?.checkpointed);
  if (busy !== 0) {
    throw new Error("Die Datenbank ist während des WAL-Checkpoints belegt.");
  }
}
