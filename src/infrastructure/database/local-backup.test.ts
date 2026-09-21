import Database from "better-sqlite3";
import type { SQLiteDatabase } from "expo-sqlite";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  LOCAL_BACKUP_FORMAT,
  LOCAL_BACKUP_VERSION,
  LocalBackupBlockedError,
  createLocalBackupDocument,
  loadLocalBackupSnapshot,
  type LocalBackupSnapshot,
} from "@/infrastructure/database/local-backup";
import { migrateDatabase } from "@/infrastructure/database/migrations";
import { exportLocalBackup } from "@/features/data-backup/local-backup-export";

class TestDatabase {
  readonly database = new Database(":memory:");

  async execAsync(source: string): Promise<void> {
    this.database.exec(source);
  }

  async runAsync(source: string, ...params: unknown[]) {
    const result = this.database.prepare(source).run(...params);
    return {
      changes: result.changes,
      lastInsertRowId: Number(result.lastInsertRowid),
    };
  }

  async getFirstAsync<T>(source: string, ...params: unknown[]): Promise<T | null> {
    return (this.database.prepare(source).get(...params) as T | undefined) ?? null;
  }

  async getAllAsync<T>(source: string, ...params: unknown[]): Promise<T[]> {
    return this.database.prepare(source).all(...params) as T[];
  }
}

describe("local backup", () => {
  let testDb: TestDatabase;
  let db: SQLiteDatabase;

  beforeEach(async () => {
    testDb = new TestDatabase();
    db = testDb as unknown as SQLiteDatabase;
    await migrateDatabase(db);
    testDb.database.exec(`
      INSERT INTO user_profile(
        id,federal_state,weekly_minutes,time_zone,industry,manual_monthly_gross_cents,
        created_at,updated_at
      ) VALUES (
        'singleton','NW',2310,'Europe/Berlin','HEALTHCARE',345000,
        '2026-09-01T10:00:00.000Z','2026-09-01T10:00:00.000Z'
      );
      INSERT INTO shift_entries(
        id,date,template_id,title,type,start_time,end_time,break_minutes,color,symbol,note,
        revision,created_at,updated_at,deleted_at
      ) VALUES (
        'shift-1','2026-09-02','default-early','Frühdienst','EARLY','06:00','14:12',30,
        '#4FCB68','rise','Übergabe',1,'2026-09-01T10:00:00.000Z',
        '2026-09-01T10:00:00.000Z',NULL
      );
      INSERT INTO appointments(
        id,date,title,all_day,start_time,end_time,color,note,revision,created_at,updated_at,deleted_at
      ) VALUES (
        'appointment-1','2026-09-03','Arzttermin',0,'10:00','10:30','#31A7C3',NULL,1,
        '2026-09-01T10:00:00.000Z','2026-09-01T10:00:00.000Z',NULL
      );
      INSERT INTO monthly_tariff_decisions(
        month,allowance_status,revision,confirmed_at,updated_at
      ) VALUES (
        '2026-09','SHIFT_MONTHLY',1,'2026-09-01T10:00:00.000Z',
        '2026-09-01T10:00:00.000Z'
      );
      INSERT INTO app_preferences(key,value,updated_at) VALUES
        ('calendar_show_shifts','false','2026-09-01T10:00:00.000Z'),
        ('tvoed_assignment','PERMANENT','2026-09-01T10:00:00.000Z'),
        ('developer_mode','true','2026-09-01T10:00:00.000Z');
      INSERT INTO scheduled_entry_notifications(
        entry_kind,entry_id,occurrence_date,notification_id
      ) VALUES ('SHIFT','shift-1','2026-09-02','native-notification-1');
    `);
  });

  afterEach(() => {
    testDb.database.close();
  });

  it("reads the complete user-data allowlist without changing the database", async () => {
    const changesBefore = testDb.database.prepare("SELECT total_changes() count").get();

    const snapshot = await loadLocalBackupSnapshot(db);

    const changesAfter = testDb.database.prepare("SELECT total_changes() count").get();
    expect(changesAfter).toEqual(changesBefore);
    expect(snapshot.databaseSchemaVersion).toBe(13);
    expect(snapshot.profile).toMatchObject({
      id: "singleton",
      industry: "HEALTHCARE",
      manual_monthly_gross_cents: 345000,
    });
    expect(snapshot.templates).toHaveLength(7);
    expect(snapshot.shifts).toEqual([expect.objectContaining({ id: "shift-1", note: "Übergabe" })]);
    expect(snapshot.shifts[0]).not.toHaveProperty("test_run_id");
    expect(snapshot.appointments).toEqual([
      expect.objectContaining({ id: "appointment-1", title: "Arzttermin" }),
    ]);
    expect(snapshot.monthlyTariffDecisions).toEqual([
      expect.objectContaining({ month: "2026-09", allowance_status: "SHIFT_MONTHLY" }),
    ]);
    expect(snapshot.preferences.map((preference) => preference.key)).toEqual([
      "calendar_show_shifts",
      "tvoed_assignment",
    ]);
    expect(JSON.stringify(snapshot)).not.toContain("native-notification-1");
    expect(JSON.stringify(snapshot)).not.toContain("developer_mode");
  });

  it("blocks an export while the test laboratory holds the original month", async () => {
    testDb.database
      .prepare(
        `INSERT INTO dev_test_backups(month,payload,run_id,created_at)
         VALUES ('2026-09','{}','run-1','2026-09-02T10:00:00.000Z')`,
      )
      .run();

    await expect(loadLocalBackupSnapshot(db)).rejects.toBeInstanceOf(LocalBackupBlockedError);
  });

  it("creates deterministic versioned JSON with a checksum over the unsigned document", async () => {
    const snapshot: LocalBackupSnapshot = {
      databaseSchemaVersion: 12,
      profile: null,
      templates: [],
      shifts: [],
      appointments: [],
      monthlyTariffDecisions: [],
      preferences: [],
    };
    const sha256 = vi.fn(async (_value: string) => "A".repeat(64));

    const backup = await createLocalBackupDocument(snapshot, {
      appVersion: "1.0.0",
      createdAt: new Date("2026-09-02T08:09:10.123Z"),
      sha256,
    });

    expect(backup.fileName).toBe("LUNA-Shift-Backup-2026-09-02T08-09-10Z.json");
    expect(backup.document).toMatchObject({
      format: LOCAL_BACKUP_FORMAT,
      version: LOCAL_BACKUP_VERSION,
      createdAt: "2026-09-02T08:09:10.123Z",
      appVersion: "1.0.0",
      databaseSchemaVersion: 12,
      integrity: {
        algorithm: "SHA-256",
        canonicalization: "RFC8785",
        scope: "document-without-integrity",
        value: "a".repeat(64),
      },
    });
    expect(sha256).toHaveBeenCalledTimes(1);
    expect(sha256.mock.calls[0]?.[0]).not.toContain("integrity");
    expect(JSON.parse(backup.serialized)).toEqual(backup.document);
  });

  it("writes the verified file before handing its URI to the share sheet", async () => {
    const writeFile = vi.fn(async () => "file:///backup.json");
    const shareFile = vi.fn(async () => "shared" as const);

    const result = await exportLocalBackup({
      db,
      appVersion: "1.0.0",
      createdAt: new Date("2026-09-02T08:09:10.123Z"),
      sha256: async () => "b".repeat(64),
      writeFile,
      shareFile,
    });

    expect(result).toBe("shared");
    expect(writeFile).toHaveBeenCalledWith(
      expect.objectContaining({
        fileName: "LUNA-Shift-Backup-2026-09-02T08-09-10Z.json",
      }),
    );
    expect(shareFile).toHaveBeenCalledWith("file:///backup.json");
    expect(writeFile.mock.invocationCallOrder[0]).toBeLessThan(
      shareFile.mock.invocationCallOrder[0] ?? Number.POSITIVE_INFINITY,
    );
  });

  it("rejects a malformed checksum", async () => {
    const emptySnapshot: LocalBackupSnapshot = {
      databaseSchemaVersion: 12,
      profile: null,
      templates: [],
      shifts: [],
      appointments: [],
      monthlyTariffDecisions: [],
      preferences: [],
    };

    await expect(
      createLocalBackupDocument(emptySnapshot, {
        appVersion: null,
        createdAt: new Date("2026-09-02T08:09:10.123Z"),
        sha256: async () => "invalid",
      }),
    ).rejects.toThrow("Prüfwert");
  });
});
