import Database from "better-sqlite3";
import { createHash } from "node:crypto";
import type { SQLiteDatabase } from "expo-sqlite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { migrateDatabase, LATEST_DATABASE_SCHEMA_VERSION } from "./migrations";
import {
  loadYouthProtectionPreference,
  saveYouthProtectionPreference,
  loadPlanningHintsPreference,
  savePlanningHintsPreference,
  YOUTH_PROTECTION_PREFERENCE_KEY,
} from "./preferences-repository";
import {
  createLocalBackupDocument,
  loadLocalBackupSnapshot,
  LOCAL_BACKUP_VERSION,
} from "./local-backup";
import { validateLocalBackup } from "./local-backup-validation";
import { restoreLocalBackup } from "./local-backup-restore";
class MemoryDatabase {
  readonly raw = new Database(":memory:");
  async execAsync(sql: string) {
    this.raw.exec(sql);
  }
  async runAsync(sql: string, ...params: unknown[]) {
    const result = this.raw.prepare(sql).run(...params);
    return { changes: result.changes, lastInsertRowId: Number(result.lastInsertRowid) };
  }
  async getFirstAsync<T>(sql: string, ...params: unknown[]): Promise<T | null> {
    return (this.raw.prepare(sql).get(...params) as T | undefined) ?? null;
  }
  async getAllAsync<T>(sql: string, ...params: unknown[]): Promise<T[]> {
    return this.raw.prepare(sql).all(...params) as T[];
  }
  get db() {
    return this as unknown as SQLiteDatabase;
  }
}
const sha256 = async (text: string) => createHash("sha256").update(text).digest("hex");
let memory: MemoryDatabase;
beforeEach(async () => {
  memory = new MemoryDatabase();
  await migrateDatabase(memory.db);
});
afterEach(() => memory.raw.close());
async function backup() {
  return createLocalBackupDocument(await loadLocalBackupSnapshot(memory.db), {
    appVersion: "synthetic",
    createdAt: new Date(),
    sha256,
  });
}
async function restore(serialized: string) {
  const document = await validateLocalBackup(serialized, {
    maxDatabaseSchemaVersion: LATEST_DATABASE_SCHEMA_VERSION,
    sha256,
  });
  await restoreLocalBackup(memory.db, document);
}
describe("one youth protection preference", () => {
  it("defaults off and independently persists both switches", async () => {
    expect(await loadYouthProtectionPreference(memory.db)).toBe(false);
    await savePlanningHintsPreference(memory.db, false);
    await saveYouthProtectionPreference(memory.db, true);
    expect(await loadYouthProtectionPreference(memory.db)).toBe(true);
    expect(await loadPlanningHintsPreference(memory.db)).toBe(false);
    await saveYouthProtectionPreference(memory.db, false);
    expect(await loadYouthProtectionPreference(memory.db)).toBe(false);
  });
  it.each([true, false])("roundtrips %s through validated backup 19", async (enabled) => {
    await saveYouthProtectionPreference(memory.db, enabled);
    const file = await backup();
    expect(file.document.version).toBe(LOCAL_BACKUP_VERSION);
    expect(LOCAL_BACKUP_VERSION).toBe(19);
    await saveYouthProtectionPreference(memory.db, !enabled);
    await restore(file.serialized);
    expect(await loadYouthProtectionPreference(memory.db)).toBe(enabled);
  });
  it("restores an older backup without retaining a newer enabled switch", async () => {
    const older = await backup();
    await saveYouthProtectionPreference(memory.db, true);
    await restore(older.serialized);
    expect(await loadYouthProtectionPreference(memory.db)).toBe(false);
  });
  it("rejects unreadable stored values instead of silently disabling legal checks", async () => {
    await memory.db.runAsync(
      "INSERT INTO app_preferences(key,value,updated_at) VALUES(?,?,?)",
      YOUTH_PROTECTION_PREFERENCE_KEY,
      "yes",
      new Date().toISOString(),
    );
    await expect(loadYouthProtectionPreference(memory.db)).rejects.toThrow();
    const invalid = await backup();
    await expect(restore(invalid.serialized)).rejects.toThrow();
  });
  it("rejects a non-boolean without touching the saved selection", async () => {
    await saveYouthProtectionPreference(memory.db, true);
    await expect(
      saveYouthProtectionPreference(memory.db, "false" as unknown as boolean),
    ).rejects.toThrow();
    expect(await loadYouthProtectionPreference(memory.db)).toBe(true);
  });
});
