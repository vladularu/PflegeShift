import { createHash, randomUUID } from "node:crypto";
import { unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import canonicalize from "canonicalize";
import type { SQLiteDatabase } from "expo-sqlite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  type AllowanceDecisionInput,
  validateScopedAllowanceDecisions,
} from "@/domain/allowance-decisions";
import {
  AllowanceDecisionConflictError,
  loadMonthlyAllowanceDecisions,
  saveMonthlyAllowanceDecisions,
} from "./allowance-decision-repository";
import { migrateDatabase } from "./migrations";
import { saveProfile } from "./profile-repository";
import { saveDatedRemunerationProfile } from "./remuneration-profile-repository";
import { createLocalBackupDocument, loadLocalBackupSnapshot } from "./local-backup";
import { validateLocalBackup } from "./local-backup-validation";
import { restoreLocalBackup } from "./local-backup-restore";

class TestDatabase {
  readonly database: Database.Database;
  failSqlIncludes: string | null = null;
  constructor(path = ":memory:") {
    this.database = new Database(path);
  }
  async execAsync(sql: string) {
    this.database.exec(sql);
  }
  async runAsync(sql: string, ...params: unknown[]) {
    if (this.failSqlIncludes !== null && sql.includes(this.failSqlIncludes))
      throw new Error("injected failure");
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

const month = "2026-09";
const tariff = { packageId: "tvoed-vka-bt-k", variant: "BT_K", region: "OTHER" };
const data = {
  version: 1,
  weeklyMinutes: 2310,
  selection: { kind: "tariff", ...tariff, group: "P5", level: "1", fullTimeWeeklyMinutes: 2310 },
} as const;
const decision: AllowanceDecisionInput = {
  from: "2026-09-01",
  through: "2026-09-30",
  tariff,
  allowanceStatus: "SHIFT_MONTHLY",
};
const sha256 = async (text: string) => createHash("sha256").update(text).digest("hex");
async function setup(db: SQLiteDatabase) {
  await migrateDatabase(db);
  await saveProfile(db, { federalState: "NW", weeklyMinutes: 2310, timeZone: "Europe/Berlin" });
  await saveDatedRemunerationProfile(db, {
    effectiveFrom: "2026-01-01",
    data,
    expectedRevision: 0,
  });
}
async function backup(db: SQLiteDatabase) {
  return createLocalBackupDocument(await loadLocalBackupSnapshot(db), {
    appVersion: "0.1.0",
    createdAt: new Date("2026-09-22T12:00:00Z"),
    sha256,
  });
}
async function resign(serialized: string, mutate: (root: Record<string, unknown>) => void) {
  const root = JSON.parse(serialized) as Record<string, unknown>;
  delete root.integrity;
  mutate(root);
  if (typeof root.version === "number" && root.version < 17)
    delete (root.data as Record<string, unknown>).tvoedAnnexAPremiumFacts;
  if (typeof root.version === "number" && root.version < 18)
    delete (root.data as Record<string, unknown>).drkEmployeeMonthConfirmations;
  if (typeof root.version === "number" && root.version < 19)
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
const validate = (serialized: string) =>
  validateLocalBackup(serialized, { maxDatabaseSchemaVersion: 31, sha256 });

describe("scoped allowance decision persistence", () => {
  let adapter: TestDatabase;
  let db: SQLiteDatabase;
  beforeEach(async () => {
    adapter = new TestDatabase();
    db = adapter as unknown as SQLiteDatabase;
    await setup(db);
  });
  afterEach(() => adapter.database.close());
  const save = (
    database: SQLiteDatabase,
    expectedRevision = 0,
    decisions: readonly AllowanceDecisionInput[] = [decision],
  ) => saveMonthlyAllowanceDecisions(database, { month, expectedRevision, decisions });

  it("migrates additively and repeatedly without converting legacy confirmations", async () => {
    await db.runAsync(
      `INSERT INTO monthly_tariff_decisions
      (month,allowance_status,revision,confirmed_at,updated_at) VALUES(?,?,?,?,?)`,
      month,
      "NONE",
      3,
      "2026-09-01T00:00:00Z",
      "2026-09-01T00:00:00Z",
    );
    adapter.database.exec(
      "DROP TABLE scoped_allowance_decisions; DELETE FROM schema_migrations WHERE version=16;",
    );
    await migrateDatabase(db);
    await migrateDatabase(db);
    expect(await loadMonthlyAllowanceDecisions(db, month)).toMatchObject({
      revision: 0,
      decisions: [],
    });
    expect(
      await db.getFirstAsync("SELECT allowance_status,revision FROM monthly_tariff_decisions"),
    ).toEqual({ allowance_status: "NONE", revision: 3 });
    expect(
      await db.getFirstAsync("SELECT COUNT(*) AS count FROM schema_migrations WHERE version=16"),
    ).toEqual({ count: 1 });
  });

  it("persists immutable dated decisions and preserves unchanged confirmation timestamps", async () => {
    const first = await save(db);
    expect(await loadMonthlyAllowanceDecisions(db, month)).toEqual(first);
    expect(first.decisions[0]).toMatchObject({ ...decision, revision: 1 });
    expect(Object.isFrozen(first.decisions[0].tariff)).toBe(true);
    const second = await save(db, 1);
    expect(second.revision).toBe(2);
    expect(second.decisions[0].confirmedAt).toBe(first.decisions[0].confirmedAt);
    expect(second.decisions[0].revision).toBe(2);
  });

  it("survives a closed and reopened SQLite file", async () => {
    const path = join(tmpdir(), `luna-allowance-test-${randomUUID()}.sqlite`);
    let disk = new TestDatabase(path);
    try {
      await setup(disk as unknown as SQLiteDatabase);
      const saved = await save(disk as unknown as SQLiteDatabase);
      disk.database.close();
      disk = new TestDatabase(path);
      expect(await loadMonthlyAllowanceDecisions(disk as unknown as SQLiteDatabase, month)).toEqual(
        saved,
      );
    } finally {
      if (disk.database.open) disk.database.close();
      unlinkSync(path);
    }
  });

  it("prevents stale updates, stale creates and ABA after clearing", async () => {
    await save(db);
    await expect(save(db)).rejects.toBeInstanceOf(AllowanceDecisionConflictError);
    await save(db, 1, []);
    expect(await loadMonthlyAllowanceDecisions(db, month)).toMatchObject({
      revision: 2,
      decisions: [],
    });
    await expect(save(db)).rejects.toBeInstanceOf(AllowanceDecisionConflictError);
    await expect(save(db, 1)).rejects.toBeInstanceOf(AllowanceDecisionConflictError);
    expect((await save(db, 2)).revision).toBe(3);
  });

  it("preserves original confirmation times on untouched fragments of a partial replacement", async () => {
    const first = await save(db);
    const confirmedAt = "2020-01-01T00:00:00Z";
    await db.runAsync(
      "UPDATE scoped_allowance_decisions SET decisions_json=?",
      JSON.stringify(first.decisions.map((entry) => ({ ...entry, confirmedAt }))),
    );
    const saved = await save(db, 1, [
      { ...decision, through: "2026-09-09" },
      { ...decision, from: "2026-09-10", through: "2026-09-20", allowanceStatus: "NONE" },
      { ...decision, from: "2026-09-21" },
    ]);
    expect(saved.decisions[0].confirmedAt).toBe(confirmedAt);
    expect(saved.decisions[1].confirmedAt).not.toBe(confirmedAt);
    expect(saved.decisions[2].confirmedAt).toBe(confirmedAt);
  });

  it("accepts exactly one of two concurrent writers with the same expected revision", async () => {
    await save(db);
    const results = await Promise.allSettled([
      save(db, 1, []),
      save(db, 1, [{ ...decision, allowanceStatus: "NONE" }]),
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find((result) => result.status === "rejected");
    expect(rejected?.status === "rejected" && rejected.reason).toBeInstanceOf(
      AllowanceDecisionConflictError,
    );
    expect((await loadMonthlyAllowanceDecisions(db, month)).revision).toBe(2);
  });

  it("snapshots caller input before asynchronous persistence", async () => {
    const mutable = { ...decision, tariff: { ...tariff } };
    const pending = save(db, 0, [mutable]);
    mutable.tariff.region = "KAV_BW";
    mutable.through = "2026-10-01";
    expect((await pending).decisions[0]).toMatchObject(decision);
  });

  it("rolls back the new table if recording its migration fails", async () => {
    adapter.database.exec(
      "DROP TABLE scoped_allowance_decisions; DELETE FROM schema_migrations WHERE version=16;",
    );
    const before = await db.getAllAsync("SELECT * FROM remuneration_profiles");
    adapter.failSqlIncludes = "INSERT INTO schema_migrations";
    await expect(migrateDatabase(db)).rejects.toThrow("injected");
    expect(
      await db.getFirstAsync(
        "SELECT name FROM sqlite_master WHERE name='scoped_allowance_decisions'",
      ),
    ).toBeNull();
    expect(
      await db.getFirstAsync("SELECT version FROM schema_migrations WHERE version=16"),
    ).toBeNull();
    expect(await db.getAllAsync("SELECT * FROM remuneration_profiles")).toEqual(before);
    adapter.failSqlIncludes = null;
    await migrateDatabase(db);
    expect((await loadMonthlyAllowanceDecisions(db, month)).revision).toBe(0);
  });

  it("allows adjacent intervals and rejects inclusive overlaps without changing the prior set", async () => {
    const first = { ...decision, through: "2026-09-15" };
    const second = { ...decision, from: "2026-09-16", allowanceStatus: "NONE" } as const;
    const saved = await save(db, 0, [second, first]);
    expect(saved.decisions.map((item) => item.from)).toEqual(["2026-09-01", "2026-09-16"]);
    await expect(save(db, 1, [first, { ...second, from: "2026-09-15" }])).rejects.toThrow(
      "überschneiden",
    );
    expect(await loadMonthlyAllowanceDecisions(db, month)).toEqual(saved);
  });

  it.each([
    { from: "2026-08-31" },
    { through: "2026-10-01" },
    { from: "2026-09-31" },
    { through: "2026-08-30" },
    { tariff: { ...tariff, region: "KAV_BW" } },
    { tariff: { ...tariff, variant: "BT_B" } },
    { tariff: { ...tariff, packageId: "other" } },
  ])("rejects invalid or mismatched periods %j", async (change) => {
    await expect(save(db, 0, [{ ...decision, ...change }])).rejects.toThrow();
    expect((await loadMonthlyAllowanceDecisions(db, month)).revision).toBe(0);
  });

  it("validates all days, not just the first day, and permits same-tariff group changes", async () => {
    await saveDatedRemunerationProfile(db, {
      effectiveFrom: "2026-09-16",
      expectedRevision: 0,
      data: { ...data, selection: { ...data.selection, group: "P6" } },
    });
    const saved = await save(db);
    await saveDatedRemunerationProfile(db, {
      effectiveFrom: "2026-09-16",
      expectedRevision: 1,
      data: { ...data, selection: { ...data.selection, region: "KAV_BW" } },
    });
    await expect(save(db, 1)).rejects.toThrow("Tarifzuordnung");
    // History edits never silently erase an older confirmation.
    expect(await loadMonthlyAllowanceDecisions(db, month)).toEqual(saved);
  });

  it("rejects unknown history dates rather than assuming the legacy profile applied", async () => {
    await db.runAsync("DELETE FROM remuneration_profiles WHERE effective_from IS NOT NULL");
    await expect(save(db)).rejects.toThrow("Tarifzuordnung");
    await db.runAsync("DELETE FROM remuneration_profiles");
    await expect(save(db, 0, [])).rejects.toThrow("Vergütungsprofil");
  });

  it("rolls back a failed write and keeps the previous revision", async () => {
    const prior = await save(db);
    adapter.failSqlIncludes = "INSERT INTO scoped_allowance_decisions";
    await expect(save(db, 1, [])).rejects.toThrow("injected");
    expect(await loadMonthlyAllowanceDecisions(db, month)).toEqual(prior);
  });

  it.each([-1, 1.5, Number.MAX_SAFE_INTEGER, NaN])("rejects revision %s", async (revision) => {
    await expect(save(db, revision)).rejects.toThrow("Zulagenrevision");
  });

  it.each(["2026-9", "2026-13", "1899-12", "2026-09-01"])("rejects month %s", async (invalid) => {
    await expect(loadMonthlyAllowanceDecisions(db, invalid)).rejects.toThrow();
  });

  it("round-trips v3 including a future tariff identity and an intentionally empty month", async () => {
    const futureTariff = { packageId: "future-tariff", variant: "FUTURE", region: "NORD" };
    await saveDatedRemunerationProfile(db, {
      effectiveFrom: "2026-01-01",
      expectedRevision: 1,
      data: { ...data, selection: { ...data.selection, ...futureTariff } },
    });
    await save(db, 0, [{ ...decision, tariff: futureTariff }]);
    await saveMonthlyAllowanceDecisions(db, {
      month: "2026-10",
      expectedRevision: 0,
      decisions: [],
    });
    const before = await loadLocalBackupSnapshot(db);
    const exported = await backup(db);
    expect(exported.document.version).toBe(19);
    await save(db, 1, []);
    await restoreLocalBackup(db, await validate(exported.serialized));
    expect(await loadLocalBackupSnapshot(db)).toEqual(before);
  });

  it.each([1, 2])(
    "verifies the original v%s checksum and clears newer destination confirmations",
    async (version) => {
      await save(db);
      const exported = await backup(db);
      const legacy = await resign(exported.serialized, (root) => {
        root.version = version;
        root.databaseSchemaVersion = version === 1 ? 13 : 15;
        const body = root.data as Record<string, unknown>;
        delete body.allowanceDecisions;
        delete body.overtimeAllocations;
        delete body.paidAbsences;
        delete body.trainingProfiles;
        delete body.shiftTrainingDetails;
        delete body.actualAnnualPayments;
        delete body.tariffAnnualClaims;
        delete body.tvlShiftWork;
        delete body.caritasWorkDays;
        delete body.caritasMonthFacts;
        delete body.caritasOvertime;
        delete body.tvoedAnnexAMonthConfirmations;
        delete body.tvoedSueMonthConfirmations;
        delete body.tvoedSueAllowanceConfirmations;
        if (version === 1) delete body.remunerationProfiles;
      });
      await restoreLocalBackup(db, await validate(legacy));
      expect((await loadMonthlyAllowanceDecisions(db, month)).revision).toBe(0);
      await expect(
        validate(legacy.replace('"appVersion":"0.1.0"', '"appVersion":"tampered"')),
      ).rejects.toThrow("Prüfwert");
    },
  );

  it("preserves original nested JSON bytes for checksum verification", async () => {
    await save(db);
    const exported = await backup(db);
    const spaced = await resign(exported.serialized, (root) => {
      const rows = (root.data as Record<string, unknown>).allowanceDecisions as Record<
        string,
        unknown
      >[];
      rows[0].decisions_json = JSON.stringify(
        JSON.parse(rows[0].decisions_json as string),
        null,
        2,
      );
    });
    await restoreLocalBackup(db, await validate(spaced));
    const after = await backup(db);
    expect(after.document.data.allowanceDecisions).toEqual(
      JSON.parse(spaced).data.allowanceDecisions,
    );
  });

  it.each([
    "missing",
    "duplicate",
    "extra",
    "orphan",
    "schema",
    "revision",
    "overlap",
    "outside",
    "timestamp",
    "future-format",
  ])("rejects a signed malformed %s backup", async (mutation) => {
    await save(db);
    const exported = await backup(db);
    const bad = await resign(exported.serialized, (root) => {
      const body = root.data as Record<string, unknown>;
      const rows = body.allowanceDecisions as Record<string, unknown>[];
      if (mutation === "missing") delete body.allowanceDecisions;
      if (mutation === "duplicate") rows.push({ ...rows[0] });
      if (mutation === "extra") rows[0].unrecognized = "x";
      if (mutation === "orphan") body.profile = null;
      if (mutation === "schema") root.databaseSchemaVersion = 15;
      const values = JSON.parse(rows[0].decisions_json as string) as Record<string, unknown>[];
      if (mutation === "revision") values[0].revision = 99;
      if (mutation === "overlap") values.push({ ...values[0] });
      if (mutation === "outside") values[0].through = "2026-10-01";
      if (mutation === "timestamp") values[0].confirmedAt = "2099-01-01T00:00:00Z";
      if (mutation === "future-format") values[0].newParameter = 1;
      rows[0].decisions_json = JSON.stringify(values);
    });
    await expect(validate(bad)).rejects.toThrow();
  });

  it("does not overwrite an unreadable future decision record", async () => {
    await save(db);
    await db.runAsync("UPDATE scoped_allowance_decisions SET decisions_json=?", '{"version":99}');
    await expect(save(db, 1, [])).rejects.toThrow();
    expect(await db.getFirstAsync("SELECT revision FROM scoped_allowance_decisions")).toEqual({
      revision: 1,
    });
  });

  it("rolls back the entire restore when inserting confirmations fails", async () => {
    await save(db);
    const exported = await backup(db);
    const validated = await validate(exported.serialized);
    await save(db, 1, []);
    const before = await loadLocalBackupSnapshot(db);
    adapter.failSqlIncludes = "INSERT INTO scoped_allowance_decisions";
    await expect(restoreLocalBackup(db, validated)).rejects.toThrow("injected");
    expect(await loadLocalBackupSnapshot(db)).toEqual(before);
  });

  it("uses strict shared validation at the calculation and storage boundaries", () => {
    const valid = {
      ...decision,
      revision: 1,
      confirmedAt: "2026-09-01T00:00:00Z",
      updatedAt: "2026-09-01T00:00:00Z",
    };
    expect(validateScopedAllowanceDecisions([valid])).toEqual([valid]);
    for (const value of [
      null,
      {},
      [null],
      [{ ...valid, extra: true }],
      [{ ...valid, tariff: { ...tariff, extra: "x" } }],
      [{ ...valid, allowanceStatus: "UNKNOWN" }],
      [{ ...valid, revision: 1.5 }],
    ]) {
      expect(() => validateScopedAllowanceDecisions(value)).toThrow();
    }
  });
});
