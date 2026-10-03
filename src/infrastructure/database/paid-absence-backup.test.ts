import { createHash } from "node:crypto";
import Database from "better-sqlite3";
import canonicalize from "canonicalize";
import type { SQLiteDatabase } from "expo-sqlite";
import { beforeEach, afterEach, describe, it, expect } from "vitest";
import { isCurrentPaidAbsence } from "@/domain/paid-absence";
import { shift as fixture, work } from "@/engine/remuneration-test-fixtures";
import { migrateDatabase } from "./migrations";
import { saveProfile } from "./profile-repository";
import { saveShift } from "./calendar-entry-repository";
import { savePaidAbsence, listPaidAbsences } from "./paid-absence-repository";
import { loadLocalBackupSnapshot, createLocalBackupDocument } from "./local-backup";
import { validateLocalBackup } from "./local-backup-validation";
import { restoreLocalBackup } from "./local-backup-restore";

class TestDatabase {
  readonly database = new Database(":memory:");
  fail: string | null = null;
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
}
const sha256 = async (value: string) => createHash("sha256").update(value).digest("hex");
const validate = (serialized: string) =>
  validateLocalBackup(serialized, { maxDatabaseSchemaVersion: 31, sha256 });
interface MutableDocument {
  version: number;
  databaseSchemaVersion: number;
  data: Record<string, unknown> & {
    paidAbsences?: Record<string, unknown>[];
    shifts: Record<string, unknown>[];
  };
  integrity?: unknown;
}
async function changeDocument(serialized: string, edit: (root: MutableDocument) => void) {
  const root = JSON.parse(serialized) as MutableDocument;
  delete root.integrity;
  edit(root);
  if (root.version < 17) delete (root.data as Record<string, unknown>).tvoedAnnexAPremiumFacts;
  if (root.version < 18)
    delete (root.data as Record<string, unknown>).drkEmployeeMonthConfirmations;
  if (root.version < 19)
    delete (root.data as Record<string, unknown>).drkTrainingMonthConfirmations;
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

describe("paid absence local backup v5", () => {
  let adapter: TestDatabase;
  let db: SQLiteDatabase;
  let shift: Awaited<ReturnType<typeof saveShift>>;
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
  });
  afterEach(() => adapter.database.close());
  const save = (paidMinutes: number | null, expectedRevision = 0) =>
    savePaidAbsence(db, {
      shiftId: shift.id,
      expectedShiftRevision: shift.revision,
      expectedShiftDate: shift.date,
      expectedShiftUpdatedAt: shift.updatedAt,
      timeZone: work.timeZone,
      expectedRevision,
      paidMinutes,
    });
  const backup = async () =>
    createLocalBackupDocument(await loadLocalBackupSnapshot(db), {
      appVersion: "0.1.0",
      createdAt: new Date("2026-09-22T12:00:00Z"),
      sha256,
    });
  it.each([462, 0, null])(
    "round-trips %s minutes byte-for-byte without reconfirmation",
    async (minutes) => {
      const saved = await save(minutes);
      const exported = await backup();
      expect(exported.document.version).toBe(19);
      expect(exported.document.databaseSchemaVersion).toBe(31);
      expect(exported.document.data.paidAbsences).toHaveLength(1);
      await save(999, 1);
      await restoreLocalBackup(db, await validate(exported.serialized));
      expect(await listPaidAbsences(db)).toEqual([saved]);
      expect((await backup()).document.data).toEqual(exported.document.data);
    },
  );
  it.each(["revision", "date", "timestamp", "zone", "soft-delete"])(
    "preserves an inert %s mismatch through backup",
    async (kind) => {
      const saved = await save(462);
      if (kind === "revision")
        shift = await saveShift(db, {
          ...shift,
          expectedRevision: shift.revision,
          title: "Neuer Titel",
        });
      if (kind === "date") {
        await db.runAsync("UPDATE shift_entries SET date='2026-09-16' WHERE id=?", shift.id);
        shift = { ...shift, date: "2026-09-16" };
      }
      if (kind === "timestamp") {
        const stamp = "2099-01-01T00:00:00Z";
        await db.runAsync("UPDATE shift_entries SET updated_at=? WHERE id=?", stamp, shift.id);
        shift = { ...shift, updatedAt: stamp };
      }
      if (kind === "zone") await saveProfile(db, { ...work, timeZone: "Europe/London" });
      if (kind === "soft-delete") {
        await db.runAsync("UPDATE shift_entries SET deleted_at=updated_at WHERE id=?", shift.id);
        shift = { ...shift, deletedAt: shift.updatedAt };
      }
      const exported = await backup();
      await restoreLocalBackup(db, await validate(exported.serialized));
      expect(await listPaidAbsences(db)).toEqual([saved]);
      expect(
        isCurrentPaidAbsence(saved, shift, kind === "zone" ? "Europe/London" : work.timeZone),
      ).toBe(false);
    },
  );
  it.each([1, 2, 3, 4])(
    "restores v%s with no invented or retained confirmations",
    async (version) => {
      await save(462);
      const legacy = await changeDocument((await backup()).serialized, (root) => {
        root.version = version;
        root.databaseSchemaVersion =
          version === 1 ? 13 : version === 2 ? 15 : version === 3 ? 16 : 17;
        delete root.data.paidAbsences;
        delete root.data.trainingProfiles;
        delete root.data.shiftTrainingDetails;
        delete root.data.actualAnnualPayments;
        delete root.data.tariffAnnualClaims;
        delete root.data.tvlShiftWork;
        delete root.data.caritasWorkDays;
        delete root.data.caritasMonthFacts;
        delete root.data.caritasOvertime;
        delete root.data.tvoedAnnexAMonthConfirmations;
        delete root.data.tvoedSueMonthConfirmations;
        delete root.data.tvoedSueAllowanceConfirmations;
        if (version < 4) delete root.data.overtimeAllocations;
        if (version < 3) delete root.data.allowanceDecisions;
        if (version < 2) delete root.data.remunerationProfiles;
      });
      await restoreLocalBackup(db, await validate(legacy));
      expect(await listPaidAbsences(db)).toEqual([]);
    },
  );
  it.each([
    "missing",
    "extra",
    "duplicate",
    "orphan",
    "future-revision",
    "future-time",
    "minutes",
    "time-zone",
    "no-profile",
    "old-schema",
    "downgrade",
    "work-shift",
  ])("rejects %s data even with a recalculated checksum", async (mutation) => {
    await save(462);
    const exported = await backup();
    const bad = await changeDocument(exported.serialized, (root) => {
      const rows = root.data.paidAbsences!;
      if (mutation === "missing") delete root.data.paidAbsences;
      if (mutation === "extra") rows[0].unexpected = 1;
      if (mutation === "duplicate") rows.push(rows[0]);
      if (mutation === "orphan") rows[0].shift_id = "missing";
      if (mutation === "future-revision") rows[0].shift_revision = 999;
      if (mutation === "future-time") {
        rows[0].shift_updated_at = "2099-01-01T00:00:00Z";
        rows[0].confirmed_at = "2099-01-01T00:00:00Z";
        rows[0].updated_at = "2099-01-01T00:00:00Z";
      }
      if (mutation === "minutes") rows[0].paid_minutes = -1;
      if (mutation === "time-zone") rows[0].time_zone = "invalid";
      if (mutation === "no-profile") root.data.profile = null;
      if (mutation === "old-schema") root.databaseSchemaVersion = 17;
      if (mutation === "downgrade") root.version = 4;
      if (mutation === "work-shift") {
        root.data.shifts[0].type = "EARLY";
        root.data.shifts[0].all_day = 0;
        root.data.shifts[0].start_time = "07:00";
        root.data.shifts[0].end_time = "15:00";
      }
    });
    await expect(validate(bad)).rejects.toThrow();
    expect((await backup()).document.data).toEqual(exported.document.data);
  });
  it("rejects an altered amount without its matching integrity checksum", async () => {
    await save(462);
    const exported = await backup();
    const root = JSON.parse(exported.serialized);
    root.data.paidAbsences[0].paid_minutes = 999;
    await expect(validate(JSON.stringify(root))).rejects.toThrow("Prüfwert");
  });
  it("rejects v5 on an older database before any replacement", async () => {
    await save(462);
    const exported = await backup();
    await expect(
      validateLocalBackup(exported.serialized, { maxDatabaseSchemaVersion: 17, sha256 }),
    ).rejects.toThrow("neueren");
  });
  it.each(["DELETE FROM paid_absences", "INSERT INTO paid_absences"])(
    "rolls back all replaced data when %s fails",
    async (failure) => {
      await save(462);
      const exported = await backup();
      const verified = await validate(exported.serialized);
      await save(120, 1);
      const before = (await backup()).document.data;
      adapter.fail = failure;
      await expect(restoreLocalBackup(db, verified)).rejects.toThrow("injected");
      expect(adapter.database.inTransaction).toBe(false);
      expect((await backup()).document.data).toEqual(before);
    },
  );
});
