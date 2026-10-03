import {
  LOCAL_BACKUP_VERSION,
  loadLocalBackupSnapshot,
  createLocalBackupDocument,
} from "./local-backup";
import { createHash, randomUUID } from "node:crypto";
import { unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import canonicalize from "canonicalize";
import type { SQLiteDatabase } from "expo-sqlite";
import { beforeEach, afterEach, describe, it, expect } from "vitest";
import {
  validateOvertimeAllocation,
  isCurrentOvertimeAllocation,
  type SaveOvertimeAllocationInput,
} from "@/domain/overtime-allocation";
import { shift as fixture } from "@/engine/remuneration-test-fixtures";
import { migrateDatabase, LATEST_DATABASE_SCHEMA_VERSION } from "./migrations";
import { saveProfile } from "./profile-repository";
import { saveShift, deleteCalendarEntry } from "./calendar-entry-repository";
import {
  saveOvertimeAllocation,
  loadOvertimeAllocation,
  listOvertimeAllocations,
} from "./overtime-allocation-repository";
import { validateLocalBackup } from "./local-backup-validation";
import { restoreLocalBackup } from "./local-backup-restore";

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
}
const sha256 = async (value: string) => createHash("sha256").update(value).digest("hex");
const validate = (serialized: string) =>
  validateLocalBackup(serialized, {
    maxDatabaseSchemaVersion: LATEST_DATABASE_SCHEMA_VERSION,
    sha256,
  });
async function backup(db: SQLiteDatabase) {
  return createLocalBackupDocument(await loadLocalBackupSnapshot(db), {
    appVersion: "0.1.0",
    createdAt: new Date("2026-09-22T12:00:00Z"),
    sha256,
  });
}
interface MutableBackup {
  version: number;
  databaseSchemaVersion: number;
  data: {
    overtimeAllocations?: Record<string, unknown>[];
    paidAbsences?: unknown;
    trainingProfiles?: unknown;
    shiftTrainingDetails?: unknown;
    actualAnnualPayments?: unknown;
    tariffAnnualClaims?: unknown;
    tvlShiftWork?: unknown;
    caritasWorkDays?: unknown;
    caritasMonthFacts?: unknown;
    caritasOvertime?: unknown;
    tvoedAnnexAMonthConfirmations?: unknown;
    tvoedSueMonthConfirmations?: unknown;
    tvoedSueAllowanceConfirmations?: unknown;
    allowanceDecisions?: unknown;
    remunerationProfiles?: unknown;
  };
  integrity?: unknown;
}
async function resign(serialized: string, edit: (root: MutableBackup) => void) {
  const root = JSON.parse(serialized) as MutableBackup;
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
const days = [
  { date: "2026-09-30", minutes: 30 },
  { date: "2026-10-01", minutes: 60 },
];
describe("persisted overtime day allocations", () => {
  let adapter: TestDatabase;
  let db: SQLiteDatabase;
  let shift: Awaited<ReturnType<typeof saveShift>>;
  let input: SaveOvertimeAllocationInput;
  beforeEach(async () => {
    adapter = new TestDatabase();
    db = adapter as unknown as SQLiteDatabase;
    await migrateDatabase(db);
    await saveProfile(db, { federalState: "NW", weeklyMinutes: 2310, timeZone: "Europe/Berlin" });
    shift = await saveShift(db, {
      ...fixture({ date: "2026-09-30", overtimeMinutes: 90, tariffOvertimeConfirmed: true }),
      id: undefined,
    });
    input = {
      shiftId: shift.id,
      expectedShiftRevision: shift.revision,
      timeZone: "Europe/Berlin",
      expectedRevision: 0,
      allocations: days,
    };
  });
  afterEach(() => adapter.database.close());
  it("adds migration 17 once without inferring allocations from confirmed hours", async () => {
    await migrateDatabase(db);
    expect(await listOvertimeAllocations(db)).toEqual([]);
    expect(
      await db.getFirstAsync("SELECT COUNT(*) AS n FROM schema_migrations WHERE version=17"),
    ).toEqual({ n: 1 });
  });
  it("saves immutable copies and reads them after closing the database", async () => {
    const saved = await saveOvertimeAllocation(db, input);
    expect(saved.allocations).toEqual(days);
    expect(Object.isFrozen(saved.allocations)).toBe(true);
    expect(isCurrentOvertimeAllocation(saved, shift, "Europe/Berlin")).toBe(true);
    const path = join(tmpdir(), `luna-overtime-${randomUUID()}.sqlite`);
    let reopened: TestDatabase | null = null;
    try {
      await adapter.database.backup(path);
      reopened = new TestDatabase(path);
      expect(await loadOvertimeAllocation(reopened as unknown as SQLiteDatabase, shift.id)).toEqual(
        saved,
      );
    } finally {
      reopened?.database.close();
      unlinkSync(path);
    }
  });
  it("retries an interrupted schema migration without a partial table or marker", async () => {
    adapter.database.exec(
      "DROP TABLE overtime_allocations; DELETE FROM schema_migrations WHERE version=17;",
    );
    adapter.fail = "INSERT INTO schema_migrations";
    await expect(migrateDatabase(db)).rejects.toThrow("injected");
    expect(
      await db.getFirstAsync("SELECT name FROM sqlite_master WHERE name='overtime_allocations'"),
    ).toBeNull();
    expect(
      await db.getFirstAsync("SELECT version FROM schema_migrations WHERE version=17"),
    ).toBeNull();
    adapter.fail = null;
    await migrateDatabase(db);
    expect(await listOvertimeAllocations(db)).toEqual([]);
  });
  it("upgrades a 10,000-shift fixture without rewriting or allocating its hours", async () => {
    adapter.database.exec(
      "DROP TABLE overtime_allocations; DELETE FROM schema_migrations WHERE version=17;",
    );
    const insert = adapter.database
      .prepare(`INSERT INTO shift_entries(id,date,title,type,start_time,end_time,break_minutes,color,symbol,revision,created_at,updated_at)
      VALUES(?,'2026-09-20','Dienst','EARLY','06:00','14:00',30,'#EA5B55','N',1,'2026-01-01T00:00:00Z','2026-01-01T00:00:00Z')`);
    adapter.database.transaction(() => {
      for (let i = 0; i < 10000; i++) insert.run(`bulk-${i}`);
    })();
    const before = await db.getFirstAsync(
      "SELECT COUNT(*) AS n,SUM(revision) AS revisions,SUM(overtime_minutes) AS minutes FROM shift_entries",
    );
    await migrateDatabase(db);
    expect(
      await db.getFirstAsync(
        "SELECT COUNT(*) AS n,SUM(revision) AS revisions,SUM(overtime_minutes) AS minutes FROM shift_entries",
      ),
    ).toEqual(before);
    expect(await listOvertimeAllocations(db)).toEqual([]);
  });
  it("serializes simultaneous optimistic writes so exactly one wins", async () => {
    const results = await Promise.allSettled([
      saveOvertimeAllocation(db, input),
      saveOvertimeAllocation(db, input),
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
    expect((await loadOvertimeAllocation(db, shift.id))?.revision).toBe(1);
  });
  it("validates real elapsed time across both daylight-saving transitions", async () => {
    const autumn = await saveShift(db, {
      ...shift,
      expectedRevision: shift.revision,
      date: "2026-10-25",
      startTime: "00:00",
      endTime: "04:00",
      overtimeMinutes: 270,
    });
    const saved = await saveOvertimeAllocation(db, {
      ...input,
      expectedShiftRevision: autumn.revision,
      allocations: [{ date: autumn.date, minutes: 270 }],
    });
    expect(saved.allocations).toEqual([{ date: "2026-10-25", minutes: 270 }]);
    const spring = await saveShift(db, {
      ...autumn,
      expectedRevision: autumn.revision,
      date: "2026-03-29",
      overtimeMinutes: 190,
    });
    await expect(
      saveOvertimeAllocation(db, {
        ...input,
        expectedRevision: 1,
        expectedShiftRevision: spring.revision,
        allocations: [{ date: spring.date, minutes: 190 }],
      }),
    ).rejects.toThrow("innerhalb der Diensttage");
  });
  it("copies mutable input before awaiting a pending transaction", async () => {
    const mutable = days.map((day) => ({ ...day }));
    const pending = saveOvertimeAllocation(db, { ...input, allocations: mutable });
    mutable[0].minutes = 999;
    expect((await pending).allocations).toEqual(days);
  });
  it("clears without resetting revision and rejects a stale writer", async () => {
    await saveOvertimeAllocation(db, input);
    const cleared = await saveOvertimeAllocation(db, {
      ...input,
      expectedRevision: 1,
      allocations: null,
    });
    expect(cleared.revision).toBe(2);
    expect(cleared.allocations).toBeNull();
    await expect(saveOvertimeAllocation(db, input)).rejects.toThrow("inzwischen geändert");
    expect((await loadOvertimeAllocation(db, shift.id))?.revision).toBe(2);
  });
  it("rejects changed shift revisions and marks old records stale", async () => {
    const saved = await saveOvertimeAllocation(db, input);
    const changed = await saveShift(db, {
      ...shift,
      expectedRevision: shift.revision,
      endTime: "02:00",
    });
    expect(isCurrentOvertimeAllocation(saved, changed, "Europe/Berlin")).toBe(false);
    await expect(saveOvertimeAllocation(db, { ...input, expectedRevision: 1 })).rejects.toThrow(
      "inzwischen geändert",
    );
    expect(await loadOvertimeAllocation(db, shift.id)).toEqual(saved);
  });
  it("rejects changed timezone and deleted shifts without touching prior data", async () => {
    const saved = await saveOvertimeAllocation(db, input);
    expect(isCurrentOvertimeAllocation(saved, shift, "Europe/London")).toBe(false);
    await expect(
      saveOvertimeAllocation(db, { ...input, expectedRevision: 1, timeZone: "Europe/London" }),
    ).rejects.toThrow("Zeitzone");
    await deleteCalendarEntry(db, shift);
    await expect(saveOvertimeAllocation(db, { ...input, expectedRevision: 1 })).rejects.toThrow(
      "nicht mehr verfügbar",
    );
    expect(await loadOvertimeAllocation(db, shift.id)).toEqual(saved);
  });
  it.each([
    [],
    [{ date: "2026-09-30", minutes: 0 }],
    [{ date: "2026-09-30", minutes: -1 }],
    [{ date: "2026-09-30", minutes: 1.5 }],
    [{ date: "2026-09-30", minutes: 90 }],
    [{ date: "2026-10-02", minutes: 90 }],
    [{ date: "2026-02-30", minutes: 90 }],
    [
      { date: "2026-09-30", minutes: 30 },
      { date: "2026-09-30", minutes: 60 },
    ],
    [{ date: "2026-09-30", minutes: 30 }],
    [{ date: "2026-10-01", minutes: Number.MAX_SAFE_INTEGER }],
  ])("rejects malformed, incomplete or out-of-service allocations %j", async (...allocations) => {
    await expect(saveOvertimeAllocation(db, { ...input, allocations })).rejects.toThrow();
    expect(await loadOvertimeAllocation(db, shift.id)).toBeNull();
  });
  it("never turns an unconfirmed overtime amount into a payout", async () => {
    const changed = await saveShift(db, {
      ...shift,
      expectedRevision: shift.revision,
      tariffOvertimeConfirmed: false,
    });
    await expect(
      saveOvertimeAllocation(db, { ...input, expectedShiftRevision: changed.revision }),
    ).rejects.toThrow("ausdrücklich bestätigen");
  });
  it("caps total overtime by net duration rather than gross duration", async () => {
    const changed = await saveShift(db, {
      ...shift,
      expectedRevision: shift.revision,
      breakMinutes: 60,
    });
    await expect(
      saveOvertimeAllocation(db, { ...input, expectedShiftRevision: changed.revision }),
    ).rejects.toThrow("innerhalb der Diensttage");
  });
  it("rolls back an injected write failure", async () => {
    const prior = await saveOvertimeAllocation(db, input);
    adapter.fail = "INSERT INTO overtime_allocations";
    await expect(
      saveOvertimeAllocation(db, { ...input, expectedRevision: 1, allocations: null }),
    ).rejects.toThrow("injected");
    expect(await loadOvertimeAllocation(db, shift.id)).toEqual(prior);
    expect(adapter.database.inTransaction).toBe(false);
  });
  it("round trips v4 including cleared and stale records", async () => {
    const prior = await saveOvertimeAllocation(db, input);
    await saveShift(db, { ...shift, expectedRevision: shift.revision, endTime: "02:00" });
    const exported = await backup(db);
    expect(exported.document.version).toBe(LOCAL_BACKUP_VERSION);
    await restoreLocalBackup(db, await validate(exported.serialized));
    expect(await loadOvertimeAllocation(db, shift.id)).toEqual(prior);
    const changed = await db.getFirstAsync<{ revision: number }>(
      "SELECT revision FROM shift_entries WHERE id=?",
      shift.id,
    );
    await saveOvertimeAllocation(db, {
      ...input,
      expectedRevision: 1,
      expectedShiftRevision: changed!.revision,
      allocations: null,
    });
    const cleared = await backup(db);
    await restoreLocalBackup(db, await validate(cleared.serialized));
    expect((await loadOvertimeAllocation(db, shift.id))?.allocations).toBeNull();
  });
  it.each([1, 2, 3])("restores legacy v%s without retaining newer allocations", async (version) => {
    await saveOvertimeAllocation(db, input);
    const old = await resign((await backup(db)).serialized, (root) => {
      root.version = version;
      root.databaseSchemaVersion = version === 1 ? 13 : version === 2 ? 15 : 16;
      delete root.data.overtimeAllocations;
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
      if (version < 3) delete root.data.allowanceDecisions;
      if (version < 2) delete root.data.remunerationProfiles;
    });
    await restoreLocalBackup(db, await validate(old));
    expect(await listOvertimeAllocations(db)).toEqual([]);
    await expect(
      validate(old.replace('"appVersion":"0.1.0"', '"appVersion":"changed"')),
    ).rejects.toThrow("Prüfwert");
  });
  it.each([
    "missing",
    "duplicate",
    "orphan",
    "future-revision",
    "extra",
    "invalid-days",
    "wrong-total",
  ])("rejects invalid re-signed backup: %s", async (mutation) => {
    await saveOvertimeAllocation(db, input);
    const bad = await resign((await backup(db)).serialized, (root) => {
      const rows = root.data.overtimeAllocations!;
      if (mutation === "missing") delete root.data.overtimeAllocations;
      if (mutation === "duplicate") rows.push(rows[0]);
      if (mutation === "orphan") rows[0].shift_id = "missing";
      if (mutation === "future-revision") rows[0].shift_revision = 999;
      if (mutation === "extra") rows[0].unknown = true;
      if (mutation === "invalid-days")
        rows[0].allocations_json = JSON.stringify([{ date: "2026-10-05", minutes: 90 }]);
      if (mutation === "wrong-total")
        rows[0].allocations_json = JSON.stringify([{ date: "2026-09-30", minutes: 10 }]);
    });
    await expect(validate(bad)).rejects.toThrow();
    expect((await loadOvertimeAllocation(db, shift.id))?.revision).toBe(1);
  });
  it("rolls back all restored data if the allocation insert fails", async () => {
    await saveOvertimeAllocation(db, input);
    const original = await backup(db);
    await saveOvertimeAllocation(db, { ...input, expectedRevision: 1, allocations: null });
    const before = await loadLocalBackupSnapshot(db);
    adapter.fail = "INSERT INTO overtime_allocations";
    await expect(restoreLocalBackup(db, await validate(original.serialized))).rejects.toThrow(
      "injected",
    );
    expect(await loadLocalBackupSnapshot(db)).toEqual(before);
  });
  it("fails on unknown nested fields and invalid revisions", async () => {
    const saved = await saveOvertimeAllocation(db, input);
    expect(() => validateOvertimeAllocation({ ...saved, extra: true })).toThrow();
    expect(() => validateOvertimeAllocation({ ...saved, revision: Infinity })).toThrow();
    expect(() =>
      validateOvertimeAllocation({ ...saved, allocations: [{ ...days[0], extra: true }] }),
    ).toThrow();
    expect(() =>
      validateOvertimeAllocation({ ...saved, confirmedAt: "2099-01-01T00:00:00Z" }),
    ).toThrow();
  });
});
