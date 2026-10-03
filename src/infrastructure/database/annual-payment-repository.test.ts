import { randomUUID, createHash } from "node:crypto";
import { unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import canonicalize from "canonicalize";
import type { SQLiteDatabase } from "expo-sqlite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ConcurrencyError } from "@/domain/errors";
import {
  activeActualOwnAnnualPayments,
  validateSavedActualOwnAnnualPayments,
} from "@/domain/saved-annual-payment";
import { work } from "@/engine/remuneration-test-fixtures";
import { migrateDatabase, LATEST_DATABASE_SCHEMA_VERSION } from "./migrations";
import { saveProfile } from "./profile-repository";
import {
  createLocalBackupDocument,
  loadLocalBackupSnapshot,
  LOCAL_BACKUP_VERSION,
} from "./local-backup";
import { validateLocalBackup } from "./local-backup-validation";
import { restoreLocalBackup } from "./local-backup-restore";
import {
  listActualOwnAnnualPayments,
  saveActualOwnAnnualPayment,
  revokeActualOwnAnnualPayment,
  mapAnnualPaymentRow,
} from "./annual-payment-repository";

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
    const r = this.database.prepare(sql).run(...params);
    return { changes: r.changes, lastInsertRowId: Number(r.lastInsertRowid) };
  }
  async getFirstAsync<T>(sql: string, ...params: unknown[]): Promise<T | null> {
    return (this.database.prepare(sql).get(...params) as T | undefined) ?? null;
  }
  async getAllAsync<T>(sql: string, ...params: unknown[]): Promise<T[]> {
    return this.database.prepare(sql).all(...params) as T[];
  }
  async prepareAsync(sql: string) {
    const s = this.database.prepare(sql);
    return {
      executeAsync: async (params: unknown[]) => {
        const r = s.run(...params);
        return { changes: r.changes, lastInsertRowId: Number(r.lastInsertRowid) };
      },
      finalizeAsync: async () => {},
    };
  }
}
const payment = {
  paymentId: "annual",
  entitlementYear: 2026,
  payoutMonth: "2026-11",
  title: "Weihnachtsgeld",
  grossCents: 87654,
};
const sha256 = async (text: string) => createHash("sha256").update(text).digest("hex");
interface MutableBackup {
  version: number;
  databaseSchemaVersion: number;
  data: Record<string, unknown>;
  integrity: { value: string };
}
async function resign(serialized: string, edit: (root: MutableBackup) => void) {
  const root = JSON.parse(serialized) as MutableBackup;
  edit(root);
  if (root.version < 17) delete root.data.tvoedAnnexAPremiumFacts;
  if (root.version < 18) delete root.data.drkEmployeeMonthConfirmations;
  if (root.version < 19) delete root.data.drkTrainingMonthConfirmations;
  const { integrity: _integrity, ...unsigned } = root;
  root.integrity.value = await sha256(canonicalize(unsigned)!);
  return JSON.stringify(root);
}

describe("actual annual payment persistence", () => {
  let adapter: TestDatabase;
  let db: SQLiteDatabase;
  beforeEach(async () => {
    adapter = new TestDatabase();
    db = adapter as unknown as SQLiteDatabase;
    await migrateDatabase(db);
    await saveProfile(db, work);
  });
  afterEach(() => adapter.database.close());
  const backup = async () =>
    createLocalBackupDocument(await loadLocalBackupSnapshot(db), {
      appVersion: "0.1.0",
      createdAt: new Date("2026-09-22T12:00:00Z"),
      sha256,
    });
  const validate = (serialized: string) =>
    validateLocalBackup(serialized, {
      maxDatabaseSchemaVersion: LATEST_DATABASE_SCHEMA_VERSION,
      sha256,
    });
  it("blocks new confirmations, updates and revocation while a test run is open", async () => {
    const saved = await saveActualOwnAnnualPayment(db, { payment, expected: null });
    await db.runAsync(
      "INSERT INTO dev_test_backups(month,payload,run_id,created_at) VALUES(?,?,?,?)",
      "2026-09",
      "{}",
      "test",
      "2026-09-01T00:00:00Z",
    );
    const before = await listActualOwnAnnualPayments(db);
    await expect(
      saveActualOwnAnnualPayment(db, {
        payment: { ...payment, entitlementYear: 2027 },
        expected: null,
      }),
    ).rejects.toThrow("Testlabor");
    await expect(
      saveActualOwnAnnualPayment(db, { payment: { ...payment, grossCents: 0 }, expected: saved }),
    ).rejects.toThrow("Testlabor");
    await expect(revokeActualOwnAnnualPayment(db, saved)).rejects.toThrow("Testlabor");
    expect(await listActualOwnAnnualPayments(db)).toEqual(before);
    await db.runAsync("DELETE FROM dev_test_backups");
    await expect(revokeActualOwnAnnualPayment(db, saved)).resolves.toMatchObject({ revoked: true });
  });
  it("round-trips v7 actual, zero and revoked payments without changing identity or confirmation", async () => {
    const paid = await saveActualOwnAnnualPayment(db, {
      payment: { ...payment, payoutMonth: "2027-01" },
      expected: null,
    });
    await saveActualOwnAnnualPayment(db, {
      payment: { ...payment, entitlementYear: 2025, grossCents: 0 },
      expected: null,
    });
    const withdrawn = await saveActualOwnAnnualPayment(db, {
      payment: { ...payment, paymentId: "withdrawn" },
      expected: null,
    });
    await revokeActualOwnAnnualPayment(db, withdrawn);
    const before = await loadLocalBackupSnapshot(db);
    const exported = await backup();
    expect(exported.document.version).toBe(LOCAL_BACKUP_VERSION);
    expect(exported.document.data.actualAnnualPayments).toHaveLength(3);
    await revokeActualOwnAnnualPayment(db, paid);
    await restoreLocalBackup(db, await validate(exported.serialized));
    expect(await loadLocalBackupSnapshot(db)).toEqual(before);
    const active = activeActualOwnAnnualPayments(await listActualOwnAnnualPayments(db));
    expect(active).toHaveLength(2);
    expect(active.find((entry) => entry.entitlementYear === 2026)?.payoutMonth).toBe("2027-01");
    expect(active.find((entry) => entry.entitlementYear === 2025)?.grossCents).toBe(0);
  });
  it.each([1, 2, 3, 4, 5, 6])(
    "restores legacy v%i without retaining or inventing actual payments",
    async (version) => {
      await saveActualOwnAnnualPayment(db, { payment, expected: null });
      const legacy = await resign((await backup()).serialized, (root) => {
        root.version = version;
        root.databaseSchemaVersion = [0, 13, 15, 16, 17, 18, 19][version];
        delete root.data.actualAnnualPayments;
        delete root.data.tariffAnnualClaims;
        delete root.data.tvlShiftWork;
        delete root.data.caritasWorkDays;
        delete root.data.caritasMonthFacts;
        delete root.data.caritasOvertime;
        delete root.data.tvoedAnnexAMonthConfirmations;
        delete root.data.tvoedSueMonthConfirmations;
        delete root.data.tvoedSueAllowanceConfirmations;
        if (version < 6) {
          delete root.data.trainingProfiles;
          delete root.data.shiftTrainingDetails;
        }
        if (version < 5) delete root.data.paidAbsences;
        if (version < 4) delete root.data.overtimeAllocations;
        if (version < 3) delete root.data.allowanceDecisions;
        if (version < 2) delete root.data.remunerationProfiles;
      });
      await restoreLocalBackup(db, await validate(legacy));
      expect(await listActualOwnAnnualPayments(db)).toEqual([]);
      await expect(
        validate(legacy.replace('"appVersion":"0.1.0"', '"appVersion":"tampered"')),
      ).rejects.toThrow("Prüfwert");
    },
  );
  it.each([
    "missing",
    "duplicate",
    "row-key",
    "nested-key",
    "gross",
    "unknown-version",
    "revision",
    "revoked",
    "date",
    "profile",
    "schema",
  ])("rejects corrupted v7 %s before any database write", async (mutation) => {
    await saveActualOwnAnnualPayment(db, { payment, expected: null });
    const before = await loadLocalBackupSnapshot(db);
    const corrupted = await resign((await backup()).serialized, (root) => {
      const rows = root.data.actualAnnualPayments as Record<string, unknown>[];
      const row = rows[0];
      const nested = JSON.parse(row.payment_json as string) as Record<string, unknown>;
      if (mutation === "missing") delete root.data.actualAnnualPayments;
      if (mutation === "duplicate") rows.push({ ...row });
      if (mutation === "row-key") row.payment_id = "unrelated";
      if (mutation === "nested-key") nested.extra = true;
      if (mutation === "gross") nested.grossCents = -1;
      if (mutation === "unknown-version") nested.version = 2;
      if (mutation === "revision") nested.revision = 0;
      if (mutation === "revoked") row.revoked = 2;
      if (mutation === "date") row.updated_at = "not-an-instant";
      if (mutation === "profile") root.data.profile = null;
      if (mutation === "schema") root.databaseSchemaVersion = 19;
      row.payment_json = JSON.stringify(nested);
    });
    await expect(validate(corrupted)).rejects.toThrow();
    expect(await loadLocalBackupSnapshot(db)).toEqual(before);
  });
  it("preserves exact nested JSON bytes for integrity and rejects an unsigned amount change", async () => {
    const saved = await saveActualOwnAnnualPayment(db, { payment, expected: null });
    const spaced = JSON.stringify(saved.payment, null, 2);
    await db.runAsync("UPDATE actual_annual_payments SET payment_json=?", spaced);
    const exported = await backup();
    const checked = await validate(exported.serialized);
    expect(checked.document.data.actualAnnualPayments![0].payment_json).toBe(spaced);
    await restoreLocalBackup(db, checked);
    expect((await loadLocalBackupSnapshot(db)).actualAnnualPayments[0].payment_json).toBe(spaced);
    const modified = JSON.parse(exported.serialized) as MutableBackup;
    (modified.data.actualAnnualPayments as Record<string, unknown>[])[0].payment_json =
      JSON.stringify({ ...saved.payment, grossCents: 1 });
    await expect(validate(JSON.stringify(modified))).rejects.toThrow("Prüfwert");
    await expect(
      validateLocalBackup(exported.serialized, { maxDatabaseSchemaVersion: 19, sha256 }),
    ).rejects.toThrow("neueren");
  });
  it.each(["DELETE FROM actual_annual_payments", "INSERT INTO actual_annual_payments"])(
    "rolls back the entire restore after %s fails",
    async (failure) => {
      const original = await saveActualOwnAnnualPayment(db, { payment, expected: null });
      const exported = await backup();
      await saveActualOwnAnnualPayment(db, {
        payment: { ...payment, grossCents: 1 },
        expected: original,
      });
      await db.runAsync("UPDATE user_profile SET weekly_minutes=1200");
      const before = await loadLocalBackupSnapshot(db);
      const checked = await validate(exported.serialized);
      adapter.fail = failure;
      await expect(restoreLocalBackup(db, checked)).rejects.toThrow("injected");
      expect(await loadLocalBackupSnapshot(db)).toEqual(before);
      expect(adapter.database.inTransaction).toBe(false);
    },
  );
  it("migrates idempotently without inventing payments or changing existing user data", async () => {
    const before = await db.getAllAsync("SELECT * FROM user_profile");
    await migrateDatabase(db);
    expect(await listActualOwnAnnualPayments(db)).toEqual([]);
    expect(
      await db.getFirstAsync("SELECT COUNT(*) AS n FROM schema_migrations WHERE version=20"),
    ).toEqual({ n: 1 });
    expect(await db.getAllAsync("SELECT * FROM user_profile")).toEqual(before);
  });
  it("rolls back a failed additive migration, preserving a large existing shift history", async () => {
    adapter.database.exec(
      "DROP TABLE IF EXISTS tariff_annual_claims; DROP TABLE actual_annual_payments; DELETE FROM schema_migrations WHERE version>=20;",
    );
    const insert = adapter.database
      .prepare(`INSERT INTO shift_entries(id,date,title,type,start_time,end_time,break_minutes,color,symbol,revision,created_at,updated_at)
      VALUES(?,'2026-09-20','Dienst','EARLY','06:00','14:00',30,'#EA5B55','N',1,'2026-01-01T00:00:00Z','2026-01-01T00:00:00Z')`);
    adapter.database.transaction(() => {
      for (let i = 0; i < 10000; i++) insert.run("annual-migration-" + i);
    })();
    const before = await db.getAllAsync("SELECT * FROM shift_entries ORDER BY id");
    adapter.fail = "INSERT INTO schema_migrations";
    await expect(migrateDatabase(db)).rejects.toThrow("injected");
    expect(
      await db.getFirstAsync("SELECT name FROM sqlite_master WHERE name='actual_annual_payments'"),
    ).toBeNull();
    adapter.fail = null;
    await migrateDatabase(db);
    expect(await db.getAllAsync("SELECT * FROM shift_entries ORDER BY id")).toEqual(before);
    expect(await listActualOwnAnnualPayments(db)).toEqual([]);
  });
  it("saves a frozen confirmation and reloads it after closing/reopening a real SQLite file", async () => {
    const path = join(tmpdir(), "luna-annual-" + randomUUID() + ".db");
    let file = new TestDatabase(path);
    try {
      let conn = file as unknown as SQLiteDatabase;
      await migrateDatabase(conn);
      await saveProfile(conn, work);
      const saved = await saveActualOwnAnnualPayment(conn, { payment, expected: null });
      expect(Object.isFrozen(saved)).toBe(true);
      expect(Object.isFrozen(saved.payment)).toBe(true);
      file.database.close();
      file = new TestDatabase(path);
      conn = file as unknown as SQLiteDatabase;
      await migrateDatabase(conn);
      expect(await listActualOwnAnnualPayments(conn)).toEqual([saved]);
      expect(activeActualOwnAnnualPayments(await listActualOwnAnnualPayments(conn))).toEqual([
        saved.payment,
      ]);
    } finally {
      file.database.close();
      unlinkSync(path);
    }
  });
  it("updates one ID/year, permits zero, and does not confuse another entitlement year", async () => {
    const saved = await saveActualOwnAnnualPayment(db, { payment, expected: null });
    const changed = await saveActualOwnAnnualPayment(db, {
      payment: { ...payment, grossCents: 0, payoutMonth: "2027-01" },
      expected: saved,
    });
    expect(changed.payment).toMatchObject({ grossCents: 0, payoutMonth: "2027-01", revision: 2 });
    expect(Date.parse(changed.updatedAt)).toBeGreaterThan(Date.parse(saved.updatedAt));
    await saveActualOwnAnnualPayment(db, {
      payment: { ...payment, entitlementYear: 2027 },
      expected: null,
    });
    expect(await listActualOwnAnnualPayments(db)).toHaveLength(2);
  });
  it("rejects a stale form, including same-revision data restored with a different amount", async () => {
    const saved = await saveActualOwnAnnualPayment(db, { payment, expected: null });
    await expect(
      saveActualOwnAnnualPayment(db, { payment, expected: null }),
    ).rejects.toBeInstanceOf(ConcurrencyError);
    await db.runAsync(
      "UPDATE actual_annual_payments SET payment_json=?",
      JSON.stringify({ ...saved.payment, grossCents: 1 }),
    );
    await expect(
      saveActualOwnAnnualPayment(db, { payment, expected: saved }),
    ).rejects.toBeInstanceOf(ConcurrencyError);
    await expect(revokeActualOwnAnnualPayment(db, saved)).rejects.toBeInstanceOf(ConcurrencyError);
  });
  it("serializes concurrent creates and accepts only one", async () => {
    const results = await Promise.allSettled([
      saveActualOwnAnnualPayment(db, { payment, expected: null }),
      saveActualOwnAnnualPayment(db, { payment, expected: null }),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((r) => r.status === "rejected")).toHaveLength(1);
    expect(await listActualOwnAnnualPayments(db)).toHaveLength(1);
  });
  it("revokes without resetting revision and supports explicit reconfirmation", async () => {
    const saved = await saveActualOwnAnnualPayment(db, { payment, expected: null });
    const revoked = await revokeActualOwnAnnualPayment(db, saved);
    expect(revoked).toMatchObject({ revoked: true, payment: { revision: 2 } });
    expect(activeActualOwnAnnualPayments(await listActualOwnAnnualPayments(db))).toEqual([]);
    await expect(
      saveActualOwnAnnualPayment(db, { payment, expected: saved }),
    ).rejects.toBeInstanceOf(ConcurrencyError);
    await expect(
      saveActualOwnAnnualPayment(db, { payment, expected: null }),
    ).rejects.toBeInstanceOf(ConcurrencyError);
    const restored = await saveActualOwnAnnualPayment(db, { payment, expected: revoked });
    expect(restored).toMatchObject({ revoked: false, payment: { revision: 3 } });
    expect(activeActualOwnAnnualPayments(await listActualOwnAnnualPayments(db))).toEqual([
      restored.payment,
    ]);
  });
  it("copies caller data before the first asynchronous boundary", async () => {
    const mutable = { ...payment };
    const pending = saveActualOwnAnnualPayment(db, { payment: mutable, expected: null });
    mutable.grossCents = 1;
    mutable.title = "changed";
    const saved = await pending;
    expect(saved.payment).toMatchObject(payment);
  });
  it("rolls back failed saves and revocations", async () => {
    const saved = await saveActualOwnAnnualPayment(db, { payment, expected: null });
    adapter.fail = "INSERT INTO actual_annual_payments";
    await expect(
      saveActualOwnAnnualPayment(db, { payment: { ...payment, grossCents: 0 }, expected: saved }),
    ).rejects.toThrow("injected");
    await expect(revokeActualOwnAnnualPayment(db, saved)).rejects.toThrow("injected");
    expect(await listActualOwnAnnualPayments(db)).toEqual([saved]);
    expect(adapter.database.inTransaction).toBe(false);
  });
  it("requires an employment profile but does not rewrite or invent a remuneration profile", async () => {
    await db.runAsync("DELETE FROM user_profile");
    await expect(saveActualOwnAnnualPayment(db, { payment, expected: null })).rejects.toThrow(
      "Arbeitsprofil",
    );
    expect(await listActualOwnAnnualPayments(db)).toEqual([]);
  });
  it.each([-1, 0.5, NaN, 1_000_000_001])("rejects invalid gross amount %s", async (grossCents) => {
    await expect(
      saveActualOwnAnnualPayment(db, { payment: { ...payment, grossCents }, expected: null }),
    ).rejects.toThrow();
    expect(await listActualOwnAnnualPayments(db)).toEqual([]);
  });
  it("rejects altered ID/year, unknown fields and malformed stored records", async () => {
    const saved = await saveActualOwnAnnualPayment(db, { payment, expected: null });
    await expect(
      saveActualOwnAnnualPayment(db, {
        payment: { ...payment, entitlementYear: 2027 },
        expected: saved,
      }),
    ).rejects.toThrow("Zuordnung");
    const bad = { ...payment, version: 9 };
    await expect(
      saveActualOwnAnnualPayment(db, { payment: bad, expected: null }),
    ).rejects.toThrow();
    expect(() => validateSavedActualOwnAnnualPayments([saved, saved])).toThrow();
    expect(() => validateSavedActualOwnAnnualPayments([{ ...saved, extra: true }])).toThrow();
    expect(() =>
      mapAnnualPaymentRow({
        payment_id: "wrong",
        entitlement_year: 2026,
        payment_json: JSON.stringify(saved.payment),
        revoked: 0,
        updated_at: saved.updatedAt,
      }),
    ).toThrow("Sonderzahlungszuordnung");
    await db.runAsync(
      "UPDATE actual_annual_payments SET payment_json=?",
      JSON.stringify({ ...saved.payment, grossCents: -1 }),
    );
    await expect(listActualOwnAnnualPayments(db)).rejects.toThrow();
  });
});
