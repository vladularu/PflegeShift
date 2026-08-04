import Database from "better-sqlite3";
import type { SQLiteDatabase } from "expo-sqlite";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  acceptTestRun,
  generateTestRun,
  isDeveloperModeEnabled,
  listTestBackups,
  previewTestRun,
  restoreTestBackup,
  setDeveloperMode,
} from "@/infrastructure/database/dev-tools-repository";
import { migrateDatabase } from "@/infrastructure/database/migrations";
import { loadProfile, saveProfile } from "@/infrastructure/database/repository";
import { listTestBackupMonths } from "@/infrastructure/database/test-backup-status-repository";

class TestDatabase {
  readonly database = new Database(":memory:");
  allQueryCount = 0;
  firstQueryCount = 0;
  async execAsync(source: string) {
    this.database.exec(source);
  }
  async runAsync(source: string, ...params: unknown[]) {
    const result = this.database.prepare(source).run(...params);
    return { changes: result.changes, lastInsertRowId: Number(result.lastInsertRowid) };
  }
  async getFirstAsync<T>(source: string, ...params: unknown[]): Promise<T | null> {
    this.firstQueryCount += 1;
    return (this.database.prepare(source).get(...params) as T | undefined) ?? null;
  }
  async getAllAsync<T>(source: string, ...params: unknown[]): Promise<T[]> {
    this.allQueryCount += 1;
    return this.database.prepare(source).all(...params) as T[];
  }
  async prepareAsync(source: string) {
    const statement = this.database.prepare(source);
    return {
      async executeAsync(params: unknown[]) {
        return statement.run(...params);
      },
      async finalizeAsync() {},
    };
  }
  async withExclusiveTransactionAsync(task: (db: SQLiteDatabase) => Promise<void>) {
    this.database.exec("BEGIN IMMEDIATE");
    try {
      await task(this as unknown as SQLiteDatabase);
      this.database.exec("COMMIT");
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    }
  }
  async withTransactionAsync(task: () => Promise<void>) {
    this.database.exec("BEGIN");
    try {
      await task();
      this.database.exec("COMMIT");
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    }
  }
}

describe("test lab repository", () => {
  let adapter: TestDatabase;
  let db: SQLiteDatabase;

  beforeEach(async () => {
    adapter = new TestDatabase();
    db = adapter as unknown as SQLiteDatabase;
    await migrateDatabase(db);
    await saveProfile(db, {
      federalState: "NW",
      weeklyMinutes: 2_310,
      timeZone: "Europe/Berlin",
      tariff: null,
    });
  });
  afterEach(() => adapter.database.close());

  it("blocks every test-lab entry point in production before database access", async () => {
    const profile = await loadProfile(db);
    if (!profile) throw new Error("missing profile");
    await setDeveloperMode(db, true);
    adapter.allQueryCount = 0;
    adapter.firstQueryCount = 0;
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("EXPO_PUBLIC_ENABLE_DEV_TOOLS", "0");
    try {
      await expect(isDeveloperModeEnabled(db)).resolves.toBe(false);
      const blockedOperations = [
        () => setDeveloperMode(db, true),
        () =>
          previewTestRun(
            db,
            { startMonth: "2026-08", range: 1, scenario: "NORMAL_ROTATION" },
            profile,
          ),
        () =>
          generateTestRun(
            db,
            { startMonth: "2026-08", range: 1, scenario: "NORMAL_ROTATION" },
            profile,
          ),
        () => listTestBackups(db),
        () => restoreTestBackup(db, ["2026-08"]),
        () => acceptTestRun(db, ["2026-08"]),
      ];
      for (const operation of blockedOperations) {
        await expect(operation()).rejects.toThrow("Entwicklungs-Builds");
      }
      expect(adapter.allQueryCount).toBe(0);
      expect(adapter.firstQueryCount).toBe(0);
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("requires the currently enabled developer mode for every data operation", async () => {
    const profile = await loadProfile(db);
    if (!profile) throw new Error("missing profile");
    const before = adapter.database.prepare("SELECT total_changes() changes").get();
    const blockedOperations = [
      () =>
        previewTestRun(
          db,
          { startMonth: "2026-08", range: 1, scenario: "NORMAL_ROTATION" },
          profile,
        ),
      () =>
        generateTestRun(
          db,
          { startMonth: "2026-08", range: 1, scenario: "NORMAL_ROTATION" },
          profile,
        ),
      () => listTestBackups(db),
      () => restoreTestBackup(db, ["2026-08"]),
      () => acceptTestRun(db, ["2026-08"]),
    ];

    for (const operation of blockedOperations) {
      await expect(operation()).rejects.toThrow("aktiviert");
    }
    expect(adapter.database.prepare("SELECT total_changes() changes").get()).toEqual(before);
  });

  it("persists developer mode", async () => {
    expect(await isDeveloperModeEnabled(db)).toBe(false);
    await setDeveloperMode(db, true);
    expect(await isDeveloperModeEnabled(db)).toBe(true);
  });

  it("loads only test month identifiers for the startup path", async () => {
    let query = "";
    const startupDb = {
      async getAllAsync(source: string) {
        query = source;
        return [{ month: "2026-05" }, { month: "2026-08" }];
      },
    } as unknown as SQLiteDatabase;

    expect(await listTestBackupMonths(startupDb)).toEqual(["2026-05", "2026-08"]);
    expect(query).toBe("SELECT month FROM dev_test_backups ORDER BY month");
    expect(query).not.toContain("payload");
  });

  it("previews without writing", async () => {
    await setDeveloperMode(db, true);
    const profile = await loadProfile(db);
    if (!profile) throw new Error("missing profile");
    const before = adapter.database.prepare("SELECT total_changes() changes").get();
    const preview = await previewTestRun(
      db,
      { startMonth: "2026-05", range: 3, scenario: "PREMIUM_MONTH" },
      profile,
    );
    const after = adapter.database.prepare("SELECT total_changes() changes").get();
    expect(preview.months).toEqual(["2026-05", "2026-06", "2026-07"]);
    expect(after).toEqual(before);
  });

  it("restores active rows, tombstones and tariff decisions exactly", async () => {
    await setDeveloperMode(db, true);
    const profile = await loadProfile(db);
    if (!profile) throw new Error("missing profile");
    adapter.database.exec(`
      INSERT INTO shift_entries(
        id,date,template_id,title,type,start_time,end_time,break_minutes,color,symbol,note,
        overtime_minutes,holiday_premium_mode,revision,created_at,updated_at,deleted_at,test_run_id
      ) VALUES
        ('old-active','2026-05-04',NULL,'Alt','DAY','08:00','16:12',30,'#2F80ED','T',NULL,0,'WITH_TIME_OFF',2,'a','b',NULL,NULL),
        ('old-deleted','2026-05-05',NULL,'Gelöscht','DAY','08:00','16:12',30,'#2F80ED','T',NULL,0,'WITH_TIME_OFF',3,'a','c','c',NULL);
      INSERT INTO monthly_tariff_decisions VALUES('2026-05','SHIFT_HOURLY',4,'a','b');
    `);
    const original = adapter.database
      .prepare("SELECT * FROM shift_entries WHERE substr(date,1,7)='2026-05' ORDER BY id")
      .all();

    await generateTestRun(
      db,
      { startMonth: "2026-05", range: 1, scenario: "NORMAL_ROTATION" },
      profile,
    );
    expect(await listTestBackupMonths(db)).toEqual(["2026-05"]);
    adapter.allQueryCount = 0;
    adapter.firstQueryCount = 0;
    const backups = await listTestBackups(db);
    expect(backups).toHaveLength(1);
    expect(adapter.allQueryCount).toBe(1);
    expect(adapter.firstQueryCount).toBe(1);
    expect(backups[0]?.currentEntryCount).toBe(
      (
        adapter.database
          .prepare(
            `SELECT (
            (SELECT COUNT(*) FROM shift_entries WHERE deleted_at IS NULL)
            + (SELECT COUNT(*) FROM appointments WHERE deleted_at IS NULL)
          ) count`,
          )
          .get() as { count: number }
      ).count,
    );
    expect(
      adapter.database
        .prepare("SELECT COUNT(*) count FROM shift_entries WHERE test_run_id IS NOT NULL")
        .get(),
    ).toMatchObject({ count: 31 });
    expect(
      adapter.database
        .prepare("SELECT COUNT(*) count FROM monthly_tariff_decisions WHERE month='2026-05'")
        .get(),
    ).toEqual({ count: 0 });

    await restoreTestBackup(db, ["2026-05"]);
    expect(await listTestBackupMonths(db)).toEqual([]);
    expect(
      adapter.database
        .prepare("SELECT * FROM shift_entries WHERE substr(date,1,7)='2026-05' ORDER BY id")
        .all(),
    ).toEqual(original);
    expect(
      adapter.database
        .prepare("SELECT * FROM monthly_tariff_decisions WHERE month='2026-05'")
        .get(),
    ).toMatchObject({
      allowance_status: "SHIFT_HOURLY",
      revision: 4,
    });
    expect(await listTestBackups(db)).toHaveLength(0);
  });

  it("keeps the first backup across repeated test runs and can accept generated data", async () => {
    await setDeveloperMode(db, true);
    const profile = await loadProfile(db);
    if (!profile) throw new Error("missing profile");
    adapter.database.exec(`
      INSERT INTO appointments(
        id,date,title,all_day,start_time,end_time,color,note,revision,created_at,updated_at,deleted_at,test_run_id
      ) VALUES('original','2026-08-02','Original',1,NULL,NULL,'#0891B2',NULL,1,'a','a',NULL,NULL)
    `);
    await generateTestRun(
      db,
      { startMonth: "2026-08", range: 1, scenario: "NORMAL_ROTATION" },
      profile,
    );
    const firstBackup = adapter.database
      .prepare("SELECT payload FROM dev_test_backups WHERE month='2026-08'")
      .get() as { payload: string };
    expect(JSON.parse(firstBackup.payload)).toMatchObject({
      version: 1,
      month: "2026-08",
      counts: { appointments: 1, decisions: 0 },
    });
    await generateTestRun(db, { startMonth: "2026-08", range: 1, scenario: "UI_STRESS" }, profile);
    expect(
      adapter.database.prepare("SELECT payload FROM dev_test_backups WHERE month='2026-08'").get(),
    ).toEqual(firstBackup);

    await acceptTestRun(db, ["2026-08"]);
    expect(await listTestBackups(db)).toHaveLength(0);
    expect(
      adapter.database
        .prepare("SELECT COUNT(*) count FROM appointments WHERE test_run_id IS NOT NULL")
        .get(),
    ).toEqual({ count: 0 });
    expect(adapter.database.prepare("SELECT COUNT(*) count FROM appointments").get()).toEqual({
      count: 62,
    });
  });

  it("rejects a corrupt backup before deleting current test data", async () => {
    await setDeveloperMode(db, true);
    const profile = await loadProfile(db);
    if (!profile) throw new Error("missing profile");
    await generateTestRun(
      db,
      { startMonth: "2026-08", range: 1, scenario: "NORMAL_ROTATION" },
      profile,
    );
    const before = adapter.database
      .prepare("SELECT id FROM shift_entries WHERE substr(date,1,7)='2026-08' ORDER BY id")
      .all();
    adapter.database
      .prepare("UPDATE dev_test_backups SET payload=? WHERE month='2026-08'")
      .run(JSON.stringify({ appointments: [], decision: null, shifts: [{ id: "broken" }] }));

    await expect(restoreTestBackup(db, ["2026-08"])).rejects.toThrow("Backup");

    expect(
      adapter.database
        .prepare("SELECT id FROM shift_entries WHERE substr(date,1,7)='2026-08' ORDER BY id")
        .all(),
    ).toEqual(before);
    expect(await listTestBackupMonths(db)).toEqual(["2026-08"]);
  });
});
