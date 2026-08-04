import Database from "better-sqlite3";
import type { SQLiteDatabase } from "expo-sqlite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { migrateDatabase } from "@/infrastructure/database/migrations";
import {
  restoreTestBackup,
  setDeveloperMode,
} from "@/infrastructure/database/dev-tools-repository";
import {
  purgeExpiredTombstones,
  TOMBSTONE_RETENTION_DAYS,
} from "@/infrastructure/database/tombstone-retention";

class TestDatabase {
  readonly database = new Database(":memory:");

  async execAsync(source: string) {
    this.database.exec(source);
  }

  async runAsync(source: string, ...params: unknown[]) {
    const result = this.database.prepare(source).run(...params);
    return { changes: result.changes, lastInsertRowId: Number(result.lastInsertRowid) };
  }

  async getFirstAsync<T>(source: string, ...params: unknown[]): Promise<T | null> {
    return (this.database.prepare(source).get(...params) as T | undefined) ?? null;
  }

  async getAllAsync<T>(source: string, ...params: unknown[]): Promise<T[]> {
    return this.database.prepare(source).all(...params) as T[];
  }

  async withExclusiveTransactionAsync(task: (database: SQLiteDatabase) => Promise<void>) {
    this.database.exec("BEGIN IMMEDIATE");
    try {
      await task(this as unknown as SQLiteDatabase);
      this.database.exec("COMMIT");
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    }
  }
}

describe("tombstone retention", () => {
  let adapter: TestDatabase;
  let db: SQLiteDatabase;

  beforeEach(async () => {
    adapter = new TestDatabase();
    db = adapter as unknown as SQLiteDatabase;
    await migrateDatabase(db);
  });

  afterEach(() => adapter.database.close());

  it("keeps tombstones for the documented retention window", () => {
    expect(TOMBSTONE_RETENTION_DAYS).toBe(90);
  });

  it("purges only expired tombstones and preserves referenced templates", async () => {
    adapter.database.exec(`
      INSERT INTO shift_templates(
        id,name,type,start_time,end_time,break_minutes,color,symbol,sort_order,
        revision,created_at,updated_at,deleted_at
      ) VALUES
        ('expired-template','Alt','CUSTOM','08:00','16:00',30,'#2F80ED','A',80,2,'2025-01-01','2025-01-01','2025-01-01'),
        ('backup-template','Backup','CUSTOM','08:00','16:00',30,'#2F80ED','B',85,2,'2025-01-01','2025-01-01','2025-01-01'),
        ('referenced-template','Referenz','CUSTOM','08:00','16:00',30,'#2F80ED','R',90,2,'2025-01-01','2025-01-01','2025-01-01');
      INSERT INTO shift_entries(
        id,date,template_id,title,type,start_time,end_time,break_minutes,color,symbol,note,
        overtime_minutes,holiday_premium_mode,revision,created_at,updated_at,deleted_at,test_run_id
      ) VALUES
        ('expired-shift','2025-01-02',NULL,'Alt','DAY','08:00','16:00',30,'#2F80ED','A','sensibel',0,'WITH_TIME_OFF',2,'2025-01-01','2025-01-01','2025-01-01',NULL),
        ('recent-shift','2026-08-01','referenced-template','Neu','DAY','08:00','16:00',30,'#2F80ED','N','bleibt',0,'WITH_TIME_OFF',2,'2026-08-01','2026-08-01','2026-08-01',NULL),
        ('active-shift','2025-01-03',NULL,'Aktiv','DAY','08:00','16:00',30,'#2F80ED','T',NULL,0,'WITH_TIME_OFF',1,'2025-01-01','2025-01-01',NULL,NULL);
      INSERT INTO appointments(
        id,date,title,all_day,start_time,end_time,color,note,revision,
        created_at,updated_at,deleted_at,test_run_id
      ) VALUES
        ('expired-appointment','2025-01-02','Alt',1,NULL,NULL,'#2F80ED','sensibel',2,'2025-01-01','2025-01-01','2025-01-01',NULL),
        ('cutoff-appointment','2026-05-06','Grenzwert',1,NULL,NULL,'#2F80ED',NULL,2,'2026-05-06','2026-05-06','2026-05-06T00:00:00.000Z',NULL),
        ('recent-appointment','2026-08-01','Neu',1,NULL,NULL,'#2F80ED',NULL,2,'2026-08-01','2026-08-01','2026-08-01',NULL);
      UPDATE shift_templates
      SET deleted_at='2025-01-01', updated_at='2025-01-01'
      WHERE id='default-early';
    `);
    adapter.database
      .prepare("INSERT INTO dev_test_backups(month,payload,run_id,created_at) VALUES(?,?,?,?)")
      .run(
        "2025-02",
        JSON.stringify({
          appointments: [],
          decision: null,
          shifts: [
            {
              id: "legacy-backup-shift",
              date: "2025-02-01",
              template_id: "backup-template",
              title: "Backup",
              type: "CUSTOM",
              start_time: "08:00",
              end_time: "16:00",
              break_minutes: 30,
              color: "#2F80ED",
              symbol: "B",
              note: null,
              overtime_minutes: 0,
              holiday_premium_mode: "WITH_TIME_OFF",
              revision: 1,
              created_at: "2025-02-01",
              updated_at: "2025-02-01",
              deleted_at: null,
              test_run_id: null,
            },
          ],
        }),
        "legacy-run",
        "2025-02-01",
      );

    const result = await purgeExpiredTombstones(db, new Date("2026-08-04T00:00:00.000Z"));

    expect(result).toEqual({ appointments: 1, shifts: 1, templates: 1 });
    expect(adapter.database.prepare("SELECT id FROM shift_entries ORDER BY id").all()).toEqual([
      { id: "active-shift" },
      { id: "recent-shift" },
    ]);
    expect(adapter.database.prepare("SELECT id FROM appointments ORDER BY id").all()).toEqual([
      { id: "cutoff-appointment" },
      { id: "recent-appointment" },
    ]);
    expect(
      adapter.database
        .prepare("SELECT id FROM shift_templates WHERE id LIKE '%template' ORDER BY id")
        .all(),
    ).toEqual([{ id: "backup-template" }, { id: "referenced-template" }]);
    expect(
      adapter.database
        .prepare("SELECT deleted_at FROM shift_templates WHERE id='default-early'")
        .get(),
    ).toEqual({ deleted_at: "2025-01-01" });

    await migrateDatabase(db);
    expect(
      adapter.database
        .prepare("SELECT deleted_at FROM shift_templates WHERE id='default-early'")
        .get(),
    ).toEqual({ deleted_at: "2025-01-01" });

    await setDeveloperMode(db, true);
    await restoreTestBackup(db, ["2025-02"]);
    expect(
      adapter.database
        .prepare("SELECT template_id FROM shift_entries WHERE id='legacy-backup-shift'")
        .get(),
    ).toEqual({ template_id: "backup-template" });
  });

  it("retains template tombstones when an open backup cannot be validated", async () => {
    adapter.database.exec(`
      INSERT INTO shift_templates(
        id,name,type,start_time,end_time,break_minutes,color,symbol,sort_order,
        revision,created_at,updated_at,deleted_at
      ) VALUES('uncertain-template','Alt','CUSTOM','08:00','16:00',30,'#2F80ED','A',80,
        2,'2025-01-01','2025-01-01','2025-01-01');
      INSERT INTO dev_test_backups(month,payload,run_id,created_at)
      VALUES('2025-01','{"shifts":"unbekannt"}','test-run','2025-01-01');
    `);

    const result = await purgeExpiredTombstones(db, new Date("2026-08-04T00:00:00.000Z"));

    expect(result.templates).toBe(0);
    expect(
      adapter.database
        .prepare("SELECT id FROM shift_templates WHERE id='uncertain-template'")
        .get(),
    ).toEqual({ id: "uncertain-template" });
  });

  it("does not purge months protected by an open test-lab backup", async () => {
    adapter.database.exec(`
      INSERT INTO appointments(
        id,date,title,all_day,start_time,end_time,color,note,revision,
        created_at,updated_at,deleted_at,test_run_id
      ) VALUES('protected','2025-01-02','Alt',1,NULL,NULL,'#2F80ED',NULL,2,
        '2025-01-01','2025-01-01','2025-01-01',NULL);
      INSERT INTO dev_test_backups(month,payload,run_id,created_at)
      VALUES('2025-01','{}','test-run','2025-01-01');
    `);

    const result = await purgeExpiredTombstones(db, new Date("2026-08-04T00:00:00.000Z"));

    expect(result.appointments).toBe(0);
    expect(
      adapter.database.prepare("SELECT id FROM appointments WHERE id='protected'").get(),
    ).toEqual({ id: "protected" });
  });

  it("rolls back every table when one purge statement fails", async () => {
    adapter.database.exec(`
      INSERT INTO shift_entries(
        id,date,template_id,title,type,start_time,end_time,break_minutes,color,symbol,note,
        overtime_minutes,holiday_premium_mode,revision,created_at,updated_at,deleted_at,test_run_id
      ) VALUES('rollback-shift','2025-01-02',NULL,'Alt','DAY','08:00','16:00',30,
        '#2F80ED','A',NULL,0,'WITH_TIME_OFF',2,'2025-01-01','2025-01-01','2025-01-01',NULL);
      INSERT INTO appointments(
        id,date,title,all_day,start_time,end_time,color,note,revision,
        created_at,updated_at,deleted_at,test_run_id
      ) VALUES('rollback-appointment','2025-01-02','Alt',1,NULL,NULL,'#2F80ED',NULL,2,
        '2025-01-01','2025-01-01','2025-01-01',NULL);
      CREATE TRIGGER reject_appointment_purge BEFORE DELETE ON appointments
      BEGIN SELECT RAISE(ABORT, 'blocked purge'); END;
    `);

    await expect(purgeExpiredTombstones(db, new Date("2026-08-04T00:00:00.000Z"))).rejects.toThrow(
      "blocked purge",
    );
    expect(
      adapter.database.prepare("SELECT id FROM shift_entries WHERE id='rollback-shift'").get(),
    ).toEqual({ id: "rollback-shift" });
    expect(
      adapter.database.prepare("SELECT id FROM appointments WHERE id='rollback-appointment'").get(),
    ).toEqual({ id: "rollback-appointment" });
  });
});
