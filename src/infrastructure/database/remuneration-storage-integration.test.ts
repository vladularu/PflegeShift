import {
  LOCAL_BACKUP_VERSION,
  createLocalBackupDocument,
  loadLocalBackupSnapshot,
} from "./local-backup";
import { createHash } from "node:crypto";
import Database from "better-sqlite3";
import canonicalize from "canonicalize";
import type { SQLiteDatabase } from "expo-sqlite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { migrateDatabase, LATEST_DATABASE_SCHEMA_VERSION } from "./migrations";
import { loadProfile, saveProfile } from "./profile-repository";
import { validateLocalBackup } from "./local-backup-validation";
import { restoreLocalBackup } from "./local-backup-restore";
import {
  listRemunerationProfiles,
  saveDatedRemunerationProfile,
  RemunerationProfileConflictError,
} from "./remuneration-profile-repository";

class MemoryDatabase {
  readonly raw = new Database(":memory:");
  failInsert: string | null = null;
  failMigration: number | null = null;
  async execAsync(sql: string) {
    this.raw.exec(sql);
  }
  async runAsync(sql: string, ...params: unknown[]) {
    if (
      (this.failInsert !== null && sql.includes(this.failInsert)) ||
      (this.failMigration !== null &&
        sql.includes("INSERT INTO schema_migrations") &&
        params[0] === this.failMigration)
    )
      throw new Error("injected storage failure");
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
const legacy = {
  federalState: "NW" as const,
  weeklyMinutes: 1155,
  timeZone: "Europe/Berlin",
  manualMonthlyGrossCents: 200000,
};
const data = {
  version: 1 as const,
  weeklyMinutes: 1155,
  selection: { kind: "own-monthly" as const, monthlyGrossCents: 210000 },
};
const sha256 = async (value: string) => createHash("sha256").update(value).digest("hex");
const input = (expectedRevision = 0) => ({ effectiveFrom: "2026-10-01", data, expectedRevision });
const validate = (serialized: string) =>
  validateLocalBackup(serialized, {
    maxDatabaseSchemaVersion: LATEST_DATABASE_SCHEMA_VERSION,
    sha256,
  });
async function exportBackup(db: SQLiteDatabase) {
  return createLocalBackupDocument(await loadLocalBackupSnapshot(db), {
    appVersion: "synthetic",
    createdAt: new Date("2026-10-03T00:00:00Z"),
    sha256,
  });
}
async function resign(serialized: string, change: (root: Record<string, unknown>) => void) {
  const root = JSON.parse(serialized) as Record<string, unknown>;
  delete root.integrity;
  change(root);
  return JSON.stringify({
    ...root,
    integrity: {
      algorithm: "SHA-256",
      canonicalization: "RFC8785",
      scope: "document-without-integrity",
      value: await sha256(canonicalize(root)!),
    },
  });
}

describe("dated profile storage and backup compatibility", () => {
  let source: MemoryDatabase, destination: MemoryDatabase;
  beforeEach(async () => {
    source = new MemoryDatabase();
    destination = new MemoryDatabase();
    await migrateDatabase(source.db);
    await migrateDatabase(destination.db);
    await saveProfile(source.db, legacy);
  });
  afterEach(() => {
    source.raw.close();
    destination.raw.close();
  });
  function downgradeTo13() {
    source.raw.exec(
      "DROP TABLE overtime_allocations; DROP TABLE scoped_allowance_decisions; DROP TABLE remuneration_profiles; DELETE FROM schema_migrations WHERE version>=14",
    );
  }
  it("keeps an unknown historical beginning null during the frozen legacy migration", async () => {
    const before = await loadProfile(source.db);
    downgradeTo13();
    await migrateDatabase(source.db);
    await migrateDatabase(source.db);
    expect(await loadProfile(source.db)).toEqual(before);
    expect(await listRemunerationProfiles(source.db)).toMatchObject([
      {
        effectiveFrom: null,
        revision: 1,
        data: { version: 1, selection: { kind: "own-monthly", monthlyGrossCents: 200000 } },
      },
    ]);
    expect(source.raw.prepare("SELECT COUNT(*) AS count FROM schema_migrations").get()).toEqual({
      count: LATEST_DATABASE_SCHEMA_VERSION,
    });
  });
  it.each([14, 15])(
    "rolls back failed migration %i and resumes without duplicated history",
    async (version) => {
      downgradeTo13();
      const before = await loadProfile(source.db);
      source.failMigration = version;
      await expect(migrateDatabase(source.db)).rejects.toThrow("injected");
      expect(await loadProfile(source.db)).toEqual(before);
      expect(
        source.raw.prepare("SELECT version FROM schema_migrations WHERE version=?").get(version),
      ).toBeUndefined();
      if (version === 14)
        expect(
          source.raw
            .prepare("SELECT name FROM sqlite_master WHERE name='remuneration_profiles'")
            .get(),
        ).toBeUndefined();
      else
        expect(
          source.raw.prepare("SELECT COUNT(*) AS count FROM remuneration_profiles").get(),
        ).toEqual({ count: 0 });
      source.failMigration = null;
      await migrateDatabase(source.db);
      expect(await listRemunerationProfiles(source.db)).toHaveLength(1);
    },
  );
  it("saves exact dated data and rejects stale revisions without overwriting", async () => {
    const first = await saveDatedRemunerationProfile(source.db, input());
    expect(first).toMatchObject({ effectiveFrom: "2026-10-01", revision: 1, data });
    await expect(saveDatedRemunerationProfile(source.db, input())).rejects.toBeInstanceOf(
      RemunerationProfileConflictError,
    );
    const second = await saveDatedRemunerationProfile(source.db, {
      ...input(1),
      data: { ...data, selection: { kind: "own-monthly", monthlyGrossCents: 220000 } },
    });
    expect(second.revision).toBe(2);
    expect(second.createdAt).toBe(first.createdAt);
    expect((await listRemunerationProfiles(source.db)).map((row) => row.effectiveFrom)).toEqual([
      null,
      "2026-10-01",
    ]);
  });
  it("rejects malformed dates and data before modifying existing rows", async () => {
    await saveDatedRemunerationProfile(source.db, input());
    const before = await loadLocalBackupSnapshot(source.db);
    await expect(
      saveDatedRemunerationProfile(source.db, { ...input(1), effectiveFrom: "2026-02-30" }),
    ).rejects.toThrow();
    await expect(
      saveDatedRemunerationProfile(source.db, {
        ...input(1),
        data: { ...data, version: 99 } as unknown as typeof data,
      }),
    ).rejects.toThrow();
    expect(await loadLocalBackupSnapshot(source.db)).toEqual(before);
  });
  it("does not overwrite an unreadable future-format row through an older editor", async () => {
    await saveDatedRemunerationProfile(source.db, input());
    const future = JSON.stringify({ ...data, version: 99 });
    source.raw
      .prepare("UPDATE remuneration_profiles SET data_json=? WHERE effective_from=?")
      .run(future, "2026-10-01");
    await expect(saveDatedRemunerationProfile(source.db, input(1))).rejects.toThrow();
    expect(
      source.raw
        .prepare("SELECT data_json,revision FROM remuneration_profiles WHERE effective_from=?")
        .get("2026-10-01"),
    ).toEqual({ data_json: future, revision: 1 });
    await expect(listRemunerationProfiles(source.db)).rejects.toThrow();
  });
  it("round-trips v2 profile JSON bytes and revisions with the rest of user data", async () => {
    await saveDatedRemunerationProfile(source.db, input());
    source.raw
      .prepare("UPDATE remuneration_profiles SET data_json=? WHERE effective_from=?")
      .run(JSON.stringify(data, null, 2), "2026-10-01");
    const file = await exportBackup(source.db);
    expect(file.document.version).toBe(LOCAL_BACKUP_VERSION);
    const checked = await validate(file.serialized);
    await restoreLocalBackup(destination.db, checked);
    expect(await loadLocalBackupSnapshot(destination.db)).toEqual(
      await loadLocalBackupSnapshot(source.db),
    );
    expect(await listRemunerationProfiles(destination.db)).toEqual(
      await listRemunerationProfiles(source.db),
    );
  });
  it("checks the original profile JSON bytes before accepting a modified payload", async () => {
    await saveDatedRemunerationProfile(source.db, input());
    const file = await exportBackup(source.db);
    const root = JSON.parse(file.serialized);
    root.data.remunerationProfiles[1].data_json += " ";
    await expect(validate(JSON.stringify(root))).rejects.toThrow("Prüfwert");
  });
  it.each(["duplicate", "orphan", "future", "identity", "date"] as const)(
    "rejects a re-signed %s profile payload before restoring",
    async (kind) => {
      await saveDatedRemunerationProfile(source.db, input());
      const file = await exportBackup(source.db);
      const changed = await resign(file.serialized, (root) => {
        const values = root.data as {
          profile: unknown;
          remunerationProfiles: Record<string, unknown>[];
        };
        if (kind === "duplicate") values.remunerationProfiles.push(values.remunerationProfiles[1]);
        if (kind === "orphan") values.profile = null;
        if (kind === "future")
          values.remunerationProfiles[1].data_json = JSON.stringify({ ...data, version: 99 });
        if (kind === "identity") values.remunerationProfiles[1].id = "different-row";
        if (kind === "date") values.remunerationProfiles[1].effective_from = "2026-02-30";
      });
      const before = await loadLocalBackupSnapshot(destination.db);
      await expect(validate(changed)).rejects.toThrow();
      expect(await loadLocalBackupSnapshot(destination.db)).toEqual(before);
    },
  );
  it("restores v1 and builds only an undated legacy profile from its original work data", async () => {
    await saveDatedRemunerationProfile(source.db, input());
    const file = await exportBackup(source.db);
    const v1 = await resign(file.serialized, (root) => {
      root.version = 1;
      root.databaseSchemaVersion = 13;
      delete (root.data as Record<string, unknown>).remunerationProfiles;
      delete (root.data as Record<string, unknown>).allowanceDecisions;
      delete (root.data as Record<string, unknown>).overtimeAllocations;
    });
    await saveProfile(destination.db, { ...legacy, manualMonthlyGrossCents: 999000 });
    await saveDatedRemunerationProfile(destination.db, input());
    await restoreLocalBackup(destination.db, await validate(v1));
    expect(await listRemunerationProfiles(destination.db)).toMatchObject([
      {
        effectiveFrom: null,
        revision: 1,
        data: { selection: { kind: "own-monthly", monthlyGrossCents: 200000 } },
      },
    ]);
    expect(await listRemunerationProfiles(destination.db)).toHaveLength(1);
  });
  it("requires the profile schema for v2 and rejects extra profile fields in v1", async () => {
    const file = await exportBackup(source.db);
    await expect(
      validate(
        await resign(file.serialized, (root) => {
          root.databaseSchemaVersion = 13;
        }),
      ),
    ).rejects.toThrow();
    await expect(
      validate(
        await resign(file.serialized, (root) => {
          root.version = 1;
        }),
      ),
    ).rejects.toThrow();
  });
  it("rolls the full restore back when a late profile insert fails", async () => {
    await saveDatedRemunerationProfile(source.db, input());
    await saveProfile(destination.db, { ...legacy, manualMonthlyGrossCents: 999000 });
    await saveDatedRemunerationProfile(destination.db, { ...input(), effectiveFrom: "2026-09-01" });
    const before = await loadLocalBackupSnapshot(destination.db);
    const file = await exportBackup(source.db);
    destination.failInsert = "INSERT INTO remuneration_profiles";
    await expect(
      restoreLocalBackup(destination.db, await validate(file.serialized)),
    ).rejects.toThrow("injected");
    expect(await loadLocalBackupSnapshot(destination.db)).toEqual(before);
  });
});
