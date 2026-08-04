import Constants, { ExecutionEnvironment } from "expo-constants";
import { getRandomBytesAsync } from "expo-crypto";
import { File, Paths } from "expo-file-system";
import * as SecureStore from "expo-secure-store";
import { defaultDatabaseDirectory, openDatabaseAsync, type SQLiteDatabase } from "expo-sqlite";

import {
  createSingleFlight,
  databaseArtifactNames,
  decideDatabaseBootstrap,
} from "@/infrastructure/database/database-bootstrap";
import {
  assertAttachedDatabaseCopy,
  checkpointWal,
} from "@/infrastructure/database/database-copy-verification";
import {
  createDatabaseKey,
  readDatabaseKey,
  sqlCipherKeyLiteral,
  sqliteStringLiteral,
  type DatabaseKeyStore,
} from "@/infrastructure/database/database-key";
import {
  assertDatabaseMigrationMarker,
  type DatabaseMigrationSource,
  writeDatabaseMigrationMarker,
} from "@/infrastructure/database/database-migration-marker";
import { promoteDatabaseCopy } from "@/infrastructure/database/database-promotion";
import { DatabaseSecurityError } from "@/infrastructure/database/database-security-error";
import { migrateDatabase } from "@/infrastructure/database/migrations";
import {
  applyAndVerifySqlCipher,
  assertCipherIntegrity,
  assertQuickCheck,
} from "@/infrastructure/database/sqlcipher";
import { purgeExpiredTombstones } from "@/infrastructure/database/tombstone-retention";
import { recordDiagnostic } from "@/infrastructure/diagnostics";

export const SECURE_DATABASE_NAME = "medishift-secure-v1.db";

const LEGACY_DATABASE_NAME = "medishift.db";
const TEMPORARY_DATABASE_NAME = "medishift-secure-v1.tmp.db";
const DATABASE_KEY_NAME = "medishift.sqlcipher.key.v1";
const DATABASE_KEY_SERVICE = "com.medishift.database.v1";
const MIGRATION_FREE_SPACE_RESERVE = 5 * 1024 * 1024;

const keyOptions: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  keychainService: DATABASE_KEY_SERVICE,
};

const keyStore: DatabaseKeyStore = {
  get: () => SecureStore.getItemAsync(DATABASE_KEY_NAME, keyOptions),
  set: (value) => SecureStore.setItemAsync(DATABASE_KEY_NAME, value, keyOptions),
};

interface UserVersionRow {
  user_version: number;
}

function databaseFile(name: string): File {
  return new File(defaultDatabaseDirectory, name);
}

function deleteIfPresent(file: File): void {
  if (file.exists) file.delete();
}

function deleteDatabaseArtifacts(name: string): void {
  for (const artifact of databaseArtifactNames(name)) {
    deleteIfPresent(databaseFile(artifact));
  }
}

async function verifyEncryptedDatabase(
  name: string,
  key: string,
  expectedSource?: DatabaseMigrationSource,
): Promise<void> {
  const database = await openDatabaseAsync(name);
  try {
    await applyAndVerifySqlCipher(database, key);
    await assertQuickCheck(database);
    await assertCipherIntegrity(database);
    await assertDatabaseMigrationMarker(database, expectedSource);
  } finally {
    await database.closeAsync();
  }
}

function assertMigrationDiskSpace(): void {
  const legacyFile = databaseFile(LEGACY_DATABASE_NAME);
  const sourceSize = legacyFile.size ?? 0;
  const required = sourceSize * 2 + MIGRATION_FREE_SPACE_RESERVE;
  if (Paths.availableDiskSpace > 0 && Paths.availableDiskSpace < required) {
    throw new Error(
      "Für die sichere Datenbankmigration ist nicht genügend freier Speicher vorhanden.",
    );
  }
}

async function exportLegacyDatabase(key: string): Promise<void> {
  const legacyDatabase = await openDatabaseAsync(LEGACY_DATABASE_NAME);
  let encryptedAttached = false;
  try {
    // The plaintext source is never schema-migrated. Only a completed WAL is
    // folded into its main file before the exact encrypted export is created.
    await assertQuickCheck(legacyDatabase);
    await checkpointWal(legacyDatabase);

    const temporaryPath = databaseFile(TEMPORARY_DATABASE_NAME).uri;
    await legacyDatabase.execAsync(
      `ATTACH DATABASE ${sqliteStringLiteral(temporaryPath)} AS encrypted KEY ${sqlCipherKeyLiteral(key)};`,
    );
    encryptedAttached = true;

    await legacyDatabase.execAsync("SELECT sqlcipher_export('encrypted');");
    const version = await legacyDatabase.getFirstAsync<UserVersionRow>("PRAGMA main.user_version;");
    const userVersion = version?.user_version ?? 0;
    if (!Number.isSafeInteger(userVersion) || userVersion < 0) {
      throw new Error("Die Datenbankversion ist ungültig.");
    }
    await legacyDatabase.execAsync(`PRAGMA encrypted.user_version = ${userVersion};`);

    await assertQuickCheck(legacyDatabase, "encrypted");
    await assertCipherIntegrity(legacyDatabase, "encrypted");
    await assertAttachedDatabaseCopy(legacyDatabase);
    await legacyDatabase.execAsync("DETACH DATABASE encrypted;");
    encryptedAttached = false;
  } finally {
    if (encryptedAttached) {
      try {
        await legacyDatabase.execAsync("DETACH DATABASE encrypted;");
      } catch {
        // Closing the connection below releases the attached temporary copy.
      }
    }
    await legacyDatabase.closeAsync();
  }
}

async function commitTemporaryDatabase(
  key: string,
  source: DatabaseMigrationSource,
): Promise<void> {
  const temporaryDatabase = await openDatabaseAsync(TEMPORARY_DATABASE_NAME);
  try {
    await applyAndVerifySqlCipher(temporaryDatabase, key);
    await assertQuickCheck(temporaryDatabase);
    await assertCipherIntegrity(temporaryDatabase);

    // Only the encrypted copy is upgraded to the current application schema.
    await migrateDatabase(temporaryDatabase);
    await writeDatabaseMigrationMarker(temporaryDatabase, source);
    await checkpointWal(temporaryDatabase);
    await assertQuickCheck(temporaryDatabase);
    await assertCipherIntegrity(temporaryDatabase);
    await assertDatabaseMigrationMarker(temporaryDatabase, source);
  } finally {
    await temporaryDatabase.closeAsync();
  }
  await verifyEncryptedDatabase(TEMPORARY_DATABASE_NAME, key, source);
}

async function migrateLegacyDatabase(key: string): Promise<void> {
  assertMigrationDiskSpace();
  await promoteDatabaseCopy({
    cleanupLegacy: () => deleteDatabaseArtifacts(LEGACY_DATABASE_NAME),
    cleanupTemporary: () => deleteDatabaseArtifacts(TEMPORARY_DATABASE_NAME),
    moveTemporary: () =>
      databaseFile(TEMPORARY_DATABASE_NAME).move(databaseFile(SECURE_DATABASE_NAME)),
    prepareTemporary: async () => {
      deleteDatabaseArtifacts(TEMPORARY_DATABASE_NAME);
      await exportLegacyDatabase(key);
      await commitTemporaryDatabase(key, "legacy");
    },
    // Keep a pre-existing target until its fully verified replacement is ready.
    removeCurrent: () => deleteDatabaseArtifacts(SECURE_DATABASE_NAME),
    verifyCurrent: () => verifyEncryptedDatabase(SECURE_DATABASE_NAME, key, "legacy"),
  });
}

async function createFreshDatabase(key: string): Promise<void> {
  await promoteDatabaseCopy({
    cleanupLegacy: () => undefined,
    cleanupTemporary: () => deleteDatabaseArtifacts(TEMPORARY_DATABASE_NAME),
    moveTemporary: () =>
      databaseFile(TEMPORARY_DATABASE_NAME).move(databaseFile(SECURE_DATABASE_NAME)),
    prepareTemporary: async () => {
      deleteDatabaseArtifacts(TEMPORARY_DATABASE_NAME);
      await commitTemporaryDatabase(key, "fresh");
    },
    removeCurrent: () => deleteDatabaseArtifacts(SECURE_DATABASE_NAME),
    verifyCurrent: () => verifyEncryptedDatabase(SECURE_DATABASE_NAME, key, "fresh"),
  });
}

async function prepareSecureDatabaseInternal(): Promise<void> {
  if (Constants.executionEnvironment === ExecutionEnvironment.StoreClient) {
    throw new DatabaseSecurityError(
      "expo-go-unsupported",
      "Die verschlüsselte MediShift-Datenbank benötigt einen Development- oder Production-Build und funktioniert nicht in Expo Go.",
    );
  }

  const legacyExists = databaseFile(LEGACY_DATABASE_NAME).exists;
  const secureExists = databaseFile(SECURE_DATABASE_NAME).exists;
  const temporaryExists = databaseFile(TEMPORARY_DATABASE_NAME).exists;
  let key = await readDatabaseKey(keyStore);
  const action = decideDatabaseBootstrap({
    keyExists: key !== null,
    legacyExists,
    secureExists,
    temporaryExists,
  });

  if (action === "block-missing-key") {
    throw new DatabaseSecurityError(
      "missing-key",
      "Der Schlüssel der verschlüsselten MediShift-Datenbank fehlt. Die Datenbank wurde nicht verändert.",
    );
  }

  if (action === "validate-secure-and-clean") {
    if (key === null) {
      throw new DatabaseSecurityError("missing-key", "Der Datenbankschlüssel fehlt.");
    }
    try {
      await verifyEncryptedDatabase(SECURE_DATABASE_NAME, key, legacyExists ? "legacy" : undefined);
    } catch (error) {
      if (!legacyExists) throw error;
      await migrateLegacyDatabase(key);
      return;
    }

    // Never include cleanup in the validation catch above. If it fails, retry
    // later while retaining the verified encrypted database.
    deleteDatabaseArtifacts(TEMPORARY_DATABASE_NAME);
    if (legacyExists) deleteDatabaseArtifacts(LEGACY_DATABASE_NAME);
    return;
  }

  if (action === "rotate-key-and-create") {
    key = await createDatabaseKey(keyStore, getRandomBytesAsync);
    await createFreshDatabase(key);
    return;
  }

  if (action === "create-secure" || action === "create-key-and-migrate") {
    key = await createDatabaseKey(keyStore, getRandomBytesAsync);
  }

  if (action === "create-secure") {
    if (key === null) {
      throw new Error("Der Datenbankschlüssel konnte nicht bereitgestellt werden.");
    }
    await createFreshDatabase(key);
    return;
  }

  if (key === null) {
    throw new Error("Der Datenbankschlüssel konnte nicht bereitgestellt werden.");
  }
  await migrateLegacyDatabase(key);
}

async function prepareSecureDatabaseSafely(): Promise<void> {
  try {
    await prepareSecureDatabaseInternal();
  } catch (error) {
    recordDiagnostic("database", "DATABASE_BOOTSTRAP_FAILED", error);
    if (error instanceof DatabaseSecurityError) throw error;
    throw new DatabaseSecurityError(
      "migration-failed",
      "Die verschlüsselte Datenbank konnte nicht sicher vorbereitet werden. Deine vorhandenen Daten wurden nicht gelöscht.",
    );
  }
}

type DatabaseBootstrapRuntime = typeof globalThis & {
  __medishiftPrepareSecureDatabaseV1?: () => Promise<void>;
};

const bootstrapRuntime = globalThis as DatabaseBootstrapRuntime;
const prepareSingleFlight =
  bootstrapRuntime.__medishiftPrepareSecureDatabaseV1 ??
  createSingleFlight(prepareSecureDatabaseSafely);
bootstrapRuntime.__medishiftPrepareSecureDatabaseV1 = prepareSingleFlight;

export function prepareSecureDatabase(): Promise<void> {
  return prepareSingleFlight();
}

export async function initializeSecureDatabase(database: SQLiteDatabase): Promise<void> {
  try {
    const key = await readDatabaseKey(keyStore);
    if (key === null) {
      throw new DatabaseSecurityError(
        "missing-key",
        "Der Schlüssel der verschlüsselten MediShift-Datenbank fehlt.",
      );
    }
    await applyAndVerifySqlCipher(database, key);
    await migrateDatabase(database);
    await purgeExpiredTombstones(database);
    await assertDatabaseMigrationMarker(database);
    await checkpointWal(database);
    await assertQuickCheck(database);
    await assertCipherIntegrity(database);
    await assertDatabaseMigrationMarker(database);
  } catch (error) {
    try {
      await database.closeAsync();
    } catch {
      // The original initialization error remains the actionable failure.
    }
    if (error instanceof DatabaseSecurityError) throw error;
    throw new DatabaseSecurityError(
      "migration-failed",
      "Die verschlüsselte Datenbank konnte nicht geöffnet werden.",
    );
  }
}
