import { randomUUID } from "node:crypto";
import { unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import type { SQLiteDatabase } from "expo-sqlite";
import { beforeEach, afterEach, describe, it, expect } from "vitest";
import { ConcurrencyError } from "@/domain/errors";
import { isCurrentPaidAbsence, type SavePaidAbsenceInput } from "@/domain/paid-absence";
import { shift as fixture, work } from "@/engine/remuneration-test-fixtures";
import { migrateDatabase } from "./migrations";
import { saveProfile } from "./profile-repository";
import { saveShift, deleteCalendarEntry } from "./calendar-entry-repository";
import { savePaidAbsence, loadPaidAbsence, listPaidAbsences } from "./paid-absence-repository";
import {
  generateTestRun,
  restoreTestBackup,
  acceptTestRun,
  setDeveloperMode,
} from "./dev-tools-repository";

class TestDatabase {
  readonly database: Database.Database;
  fail: string | null = null;
  constructor(path = ":memory:") {
    this.database = new Database(path);
  }
  async execAsync(sql: string) {
    this.database.exec(sql);
  }
  async runAsync(sql: string, ...params: unknown[]) {
    if (this.fail && sql.includes(this.fail)) throw new Error("injected failure");
    const result = this.database.prepare(sql).run(...params);
    return { changes: result.changes, lastInsertRowId: Number(result.lastInsertRowid) };
  }
  async getFirstAsync<T>(sql: string, ...params: unknown[]): Promise<T | null> {
    return (this.database.prepare(sql).get(...params) as T | undefined) ?? null;
  }
  async getAllAsync<T>(sql: string, ...params: unknown[]): Promise<T[]> {
    return this.database.prepare(sql).all(...params) as T[];
  }
  async prepareAsync(sql: string) {
    const statement = this.database.prepare(sql);
    return {
      executeAsync: async (params: unknown[]) => {
        const result = statement.run(...params);
        return { changes: result.changes, lastInsertRowId: Number(result.lastInsertRowid) };
      },
      finalizeAsync: async () => {},
    };
  }
}

describe("persisted paid absence confirmations", () => {
  let adapter: TestDatabase;
  let db: SQLiteDatabase;
  let shift: Awaited<ReturnType<typeof saveShift>>;
  let input: SavePaidAbsenceInput;
  beforeEach(async () => {
    adapter = new TestDatabase();
    db = adapter as unknown as SQLiteDatabase;
    await migrateDatabase(db);
    await saveProfile(db, work);
    shift = await saveShift(db, {
      ...fixture({
        date: "2026-09-15",
        templateId: "default-vacation",
        type: "VACATION",
        title: "Urlaub",
        allDay: true,
        startTime: null,
        endTime: null,
        breakMinutes: 0,
      }),
      id: undefined,
    });
    input = {
      shiftId: shift.id,
      expectedShiftRevision: shift.revision,
      expectedShiftDate: shift.date,
      expectedShiftUpdatedAt: shift.updatedAt,
      timeZone: work.timeZone,
      expectedRevision: 0,
      paidMinutes: 462,
    };
  });
  afterEach(() => adapter.database.close());
  it("migrates once without inventing paid time", async () => {
    await migrateDatabase(db);
    expect(await listPaidAbsences(db)).toEqual([]);
    expect(
      await db.getFirstAsync("SELECT COUNT(*) AS n FROM schema_migrations WHERE version=18"),
    ).toEqual({ n: 1 });
  });
  it("rolls back a failed migration and retries without rewriting existing entries", async () => {
    adapter.database.exec(
      "DROP TABLE paid_absences; DELETE FROM schema_migrations WHERE version=18;",
    );
    const insert = adapter.database
      .prepare(`INSERT INTO shift_entries(id,date,title,type,start_time,end_time,break_minutes,color,symbol,revision,created_at,updated_at)
      VALUES(?,'2026-09-20','Dienst','EARLY','06:00','14:00',30,'#EA5B55','N',1,'2026-01-01T00:00:00Z','2026-01-01T00:00:00Z')`);
    adapter.database.transaction(() => {
      for (let i = 0; i < 10000; i++) insert.run("migration-" + i);
    })();
    const before = await db.getAllAsync("SELECT * FROM shift_entries ORDER BY id");
    adapter.fail = "INSERT INTO schema_migrations";
    await expect(migrateDatabase(db)).rejects.toThrow("injected");
    expect(
      await db.getFirstAsync("SELECT name FROM sqlite_master WHERE name='paid_absences'"),
    ).toBeNull();
    expect(
      await db.getFirstAsync("SELECT version FROM schema_migrations WHERE version=18"),
    ).toBeNull();
    adapter.fail = null;
    await migrateDatabase(db);
    expect(await listPaidAbsences(db)).toEqual([]);
    expect(await db.getAllAsync("SELECT * FROM shift_entries ORDER BY id")).toEqual(before);
  });
  it("saves immutable values and preserves them after closing/reopening SQLite", async () => {
    const saved = await savePaidAbsence(db, input);
    expect(saved.paidMinutes).toBe(462);
    expect(await listPaidAbsences(db)).toEqual([saved]);
    expect(Object.isFrozen(saved)).toBe(true);
    expect(isCurrentPaidAbsence(saved, shift, work.timeZone)).toBe(true);
    expect(Object.isFrozen(await listPaidAbsences(db))).toBe(true);
    const path = join(tmpdir(), `luna-paid-absence-${randomUUID()}.sqlite`);
    let reopened: TestDatabase | null = null;
    try {
      await adapter.database.backup(path);
      reopened = new TestDatabase(path);
      expect(await loadPaidAbsence(reopened as unknown as SQLiteDatabase, shift.id)).toEqual(saved);
    } finally {
      reopened?.database.close();
      unlinkSync(path);
    }
  });
  it("distinguishes zero, revocation and a missing confirmation", async () => {
    expect(await loadPaidAbsence(db, shift.id)).toBeNull();
    const zero = await savePaidAbsence(db, { ...input, paidMinutes: 0 });
    expect(isCurrentPaidAbsence(zero, shift, work.timeZone)).toBe(true);
    const cleared = await savePaidAbsence(db, { ...input, expectedRevision: 1, paidMinutes: null });
    expect(cleared.revision).toBe(2);
    expect(isCurrentPaidAbsence(cleared, shift, work.timeZone)).toBe(false);
    expect(await loadPaidAbsence(db, shift.id)).toEqual(cleared);
  });
  it("owns caller input before awaiting and rejects a stale second write", async () => {
    const mutable = { ...input };
    const pending = savePaidAbsence(db, mutable);
    mutable.paidMinutes = 999;
    mutable.shiftId = "other";
    const saved = await pending;
    expect(saved.paidMinutes).toBe(462);
    await expect(savePaidAbsence(db, input)).rejects.toBeInstanceOf(ConcurrencyError);
    expect(await loadPaidAbsence(db, shift.id)).toEqual(saved);
  });
  it.each(["revision", "date", "updated", "zone", "deleted"])(
    "rejects stale %s context without saving",
    async (change) => {
      if (change === "revision")
        await db.runAsync("UPDATE shift_entries SET revision=revision+1 WHERE id=?", shift.id);
      if (change === "date")
        await db.runAsync("UPDATE shift_entries SET date='2026-09-16' WHERE id=?", shift.id);
      if (change === "updated")
        await db.runAsync(
          "UPDATE shift_entries SET updated_at='2026-01-01T00:00:00Z' WHERE id=?",
          shift.id,
        );
      if (change === "zone") await saveProfile(db, { ...work, timeZone: "Europe/London" });
      if (change === "deleted")
        await db.runAsync("UPDATE shift_entries SET deleted_at=updated_at WHERE id=?", shift.id);
      await expect(savePaidAbsence(db, input)).rejects.toBeInstanceOf(ConcurrencyError);
      expect(await listPaidAbsences(db)).toEqual([]);
    },
  );
  it.each([-1, 1501, 0.5, NaN])("rejects invalid minutes %s", async (paidMinutes) => {
    await expect(savePaidAbsence(db, { ...input, paidMinutes })).rejects.toThrow();
    expect(await listPaidAbsences(db)).toEqual([]);
  });
  it("rejects a timed work shift and missing parent", async () => {
    await db.runAsync(
      "UPDATE shift_entries SET type='EARLY',all_day=0,start_time='07:00',end_time='15:00' WHERE id=?",
      shift.id,
    );
    await expect(savePaidAbsence(db, input)).rejects.toThrow("keine bestätigbare");
    await expect(savePaidAbsence(db, { ...input, shiftId: "missing" })).rejects.toBeInstanceOf(
      ConcurrencyError,
    );
  });
  it("keeps stale and soft-deleted records inert; hard delete cascades", async () => {
    const saved = await savePaidAbsence(db, input);
    const changed = await saveShift(db, {
      ...shift,
      expectedRevision: shift.revision,
      date: "2026-10-01",
    });
    expect(isCurrentPaidAbsence(saved, changed, work.timeZone)).toBe(false);
    expect(await loadPaidAbsence(db, shift.id)).toEqual(saved);
    await deleteCalendarEntry(db, changed);
    expect(await loadPaidAbsence(db, shift.id)).toEqual(saved);
    await db.runAsync("DELETE FROM shift_entries WHERE id=?", shift.id);
    expect(await loadPaidAbsence(db, shift.id)).toBeNull();
  });
  it("rolls back a failed save without changing the prior value", async () => {
    const saved = await savePaidAbsence(db, input);
    adapter.fail = "INSERT INTO paid_absences";
    await expect(
      savePaidAbsence(db, { ...input, expectedRevision: 1, paidMinutes: 0 }),
    ).rejects.toThrow("injected");
    expect(await loadPaidAbsence(db, shift.id)).toEqual(saved);
    expect(adapter.database.inTransaction).toBe(false);
  });
  it.each([462, 0, null])(
    "restores test-lab originals exactly for minutes %s",
    async (paidMinutes) => {
      const saved = await savePaidAbsence(db, { ...input, paidMinutes });
      await setDeveloperMode(db, true);
      await generateTestRun(
        db,
        { startMonth: "2026-09", range: 1, scenario: "NORMAL_ROTATION" },
        work,
      );
      expect(await listPaidAbsences(db)).toEqual([]);
      await generateTestRun(
        db,
        { startMonth: "2026-09", range: 1, scenario: "NORMAL_ROTATION" },
        work,
      );
      await restoreTestBackup(db, ["2026-09"]);
      expect(await listPaidAbsences(db)).toEqual([saved]);
    },
  );
  it("does not resurrect original confirmations when accepting test data", async () => {
    await savePaidAbsence(db, input);
    await setDeveloperMode(db, true);
    await generateTestRun(
      db,
      { startMonth: "2026-09", range: 1, scenario: "NORMAL_ROTATION" },
      work,
    );
    await acceptTestRun(db, ["2026-09"]);
    expect(await listPaidAbsences(db)).toEqual([]);
  });
  it("restores v4 test snapshots without inventing paid absence confirmations", async () => {
    await savePaidAbsence(db, input);
    await setDeveloperMode(db, true);
    await generateTestRun(
      db,
      { startMonth: "2026-09", range: 1, scenario: "NORMAL_ROTATION" },
      work,
    );
    const row = await db.getFirstAsync<{ payload: string }>(
      "SELECT payload FROM dev_test_backups WHERE month='2026-09'",
    );
    const root = JSON.parse(row!.payload);
    root.version = 4;
    delete root.remuneration.paidAbsences;
    delete root.remuneration.tvlShiftWork;
    delete root.remuneration.caritasWorkDays;
    delete root.remuneration.caritasMonthFacts;
    delete root.remuneration.caritasOvertime;
    delete root.remuneration.tvoedAnnexAMonthConfirmations;
    delete root.remuneration.tvoedSueMonthConfirmations;
    delete root.remuneration.tvoedSueAllowanceConfirmations;
    delete root.remuneration.tvoedAnnexAPremiumFacts;
    delete root.remuneration.drkEmployeeMonthConfirmations;
    delete root.remuneration.drkTrainingMonthConfirmations;
    delete root.training;
    await db.runAsync(
      "UPDATE dev_test_backups SET payload=? WHERE month='2026-09'",
      JSON.stringify(root),
    );
    await restoreTestBackup(db, ["2026-09"]);
    expect(await listPaidAbsences(db)).toEqual([]);
  });
  it.each(["missing", "extra", "duplicate", "orphan", "future", "invalid", "downgrade"])(
    "rejects %s test snapshot before any restore",
    async (mutation) => {
      await savePaidAbsence(db, input);
      await setDeveloperMode(db, true);
      await generateTestRun(
        db,
        { startMonth: "2026-09", range: 1, scenario: "NORMAL_ROTATION" },
        work,
      );
      const row = await db.getFirstAsync<{ payload: string }>(
        "SELECT payload FROM dev_test_backups WHERE month='2026-09'",
      );
      const root = JSON.parse(row!.payload);
      const records = root.remuneration.paidAbsences;
      if (mutation === "missing") delete root.remuneration.paidAbsences;
      if (mutation === "extra") records[0].unexpected = true;
      if (mutation === "duplicate") records.push(records[0]);
      if (mutation === "orphan") records[0].shift_id = "missing";
      if (mutation === "future") records[0].shift_revision = 999;
      if (mutation === "invalid") records[0].paid_minutes = -1;
      if (mutation === "downgrade") root.version = 4;
      await db.runAsync(
        "UPDATE dev_test_backups SET payload=? WHERE month='2026-09'",
        JSON.stringify(root),
      );
      const before = await db.getAllAsync("SELECT * FROM shift_entries ORDER BY id");
      await expect(restoreTestBackup(db, ["2026-09"])).rejects.toThrow();
      expect(await db.getAllAsync("SELECT * FROM shift_entries ORDER BY id")).toEqual(before);
      expect(await listPaidAbsences(db)).toEqual([]);
    },
  );
});
