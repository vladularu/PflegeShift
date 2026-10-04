import Database from "better-sqlite3";
import type { SQLiteDatabase } from "expo-sqlite";
import { Temporal } from "@js-temporal/polyfill";
import { beforeEach, afterEach, describe, it, expect } from "vitest";
import { history, shift as fixture, work } from "@/engine/remuneration-test-fixtures";
import { migrateDatabase } from "./migrations";
import { saveProfile } from "./profile-repository";
import { saveShift } from "./calendar-entry-repository";
import { saveDatedRemunerationProfile } from "./remuneration-profile-repository";
import { saveOvertimeAllocation } from "./overtime-allocation-repository";
import { saveMonthlyAllowanceDecisions } from "./allowance-decision-repository";
import {
  generateTestRun,
  restoreTestBackup,
  acceptTestRun,
  setDeveloperMode,
} from "./dev-tools-repository";
import { parseDevBackupPayload } from "./dev-backup-payload";
import {
  saveActualOwnAnnualPayment,
  listActualOwnAnnualPayments,
} from "./annual-payment-repository";

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
  async prepareAsync(sql: string) {
    const statement = this.database.prepare(sql);
    return {
      async executeAsync(params: unknown[]) {
        return statement.run(...params);
      },
      async finalizeAsync() {},
    };
  }
}
describe("test-lab remuneration snapshot v4", () => {
  let adapter: TestDatabase;
  let db: SQLiteDatabase;
  const tariff = { packageId: "tvoed-vka-bt-k", variant: "BT_K", region: "OTHER" };
  beforeEach(async () => {
    adapter = new TestDatabase();
    db = adapter as unknown as SQLiteDatabase;
    await migrateDatabase(db);
    await saveProfile(db, work);
    await setDeveloperMode(db, true);
    await saveDatedRemunerationProfile(db, {
      effectiveFrom: "2026-01-01",
      data: history().data,
      expectedRevision: 0,
    });
  });
  afterEach(() => adapter.database.close());
  function state() {
    return Object.fromEntries(
      [
        "shift_entries",
        "overtime_allocations",
        "scoped_allowance_decisions",
        "remuneration_profiles",
        "dev_test_backups",
        "monthly_tariff_decisions",
      ].map((table) => [
        table,
        adapter.database.prepare(`SELECT * FROM ${table} ORDER BY 1`).all(),
      ]),
    );
  }
  async function original(date = "2026-09-30", cleared = false) {
    const shift = await saveShift(db, {
      ...fixture({ date, overtimeMinutes: 30, tariffOvertimeConfirmed: true }),
      id: undefined,
    });
    await saveOvertimeAllocation(db, {
      shiftId: shift.id,
      expectedShiftRevision: shift.revision,
      timeZone: "Europe/Berlin",
      expectedRevision: 0,
      allocations: cleared
        ? null
        : [{ date: Temporal.PlainDate.from(date).add({ days: 1 }).toString(), minutes: 30 }],
    });
    return shift;
  }
  async function decision(month = "2026-09", expectedRevision = 0, empty = false) {
    const first = Temporal.PlainDate.from(month + "-01");
    return saveMonthlyAllowanceDecisions(db, {
      month,
      expectedRevision,
      decisions: empty
        ? []
        : [
            {
              tariff,
              from: first.toString(),
              through: first.with({ day: first.daysInMonth }).toString(),
              allowanceStatus: "SHIFT_MONTHLY",
            },
          ],
    });
  }
  const generate = (startMonth = "2026-09", range: 1 | 3 | 12 = 1) =>
    generateTestRun(db, { startMonth, range, scenario: "NORMAL_ROTATION" }, work);
  it.each(["restore", "accept"])(
    "keeps personal actual annual payments unchanged during generation and %s",
    async (finish) => {
      const saved = await saveActualOwnAnnualPayment(db, {
        expected: null,
        payment: {
          paymentId: "annual",
          entitlementYear: 2026,
          payoutMonth: "2026-11",
          title: "Sonderzahlung",
          grossCents: 54321,
        },
      });
      await generate("2026-10", 3);
      await generate("2026-11", 1);
      expect(await listActualOwnAnnualPayments(db)).toEqual([saved]);
      if (finish === "restore") await restoreTestBackup(db, ["2026-10", "2026-11", "2026-12"]);
      else await acceptTestRun(db, ["2026-10", "2026-11", "2026-12"]);
      expect(await listActualOwnAnnualPayments(db)).toEqual([saved]);
    },
  );
  async function savedPayload(month = "2026-09") {
    const row = await db.getFirstAsync<{ payload: string }>(
      "SELECT payload FROM dev_test_backups WHERE month=?",
      month,
    );
    if (!row) throw new Error("fixture backup missing");
    return row.payload;
  }
  it("restores original rows exactly after repeated generation, leaving global profiles and other months untouched", async () => {
    await original();
    await original("2026-08-31");
    await decision();
    await decision("2026-08");
    const before = state();
    await generate();
    const payload = await savedPayload();
    const parsed = parseDevBackupPayload(payload, "2026-09");
    expect(parsed.version).toBe(16);
    expect(parsed.remuneration.overtimeAllocations).toHaveLength(1);
    expect(parsed.remuneration.overtimeAllocations[0].allocations_json).toContain("2026-10-01");
    expect(adapter.database.prepare("SELECT month FROM scoped_allowance_decisions").all()).toEqual([
      { month: "2026-08" },
    ]);
    expect(
      adapter.database.prepare("SELECT COUNT(*) AS n FROM overtime_allocations").get(),
    ).toEqual({ n: 1 });
    await original("2026-09-10");
    await decision();
    await generate();
    expect(await savedPayload()).toBe(payload);
    await restoreTestBackup(db, ["2026-09"]);
    expect(state()).toEqual(before);
  });
  it("accepts current test confirmations without bringing original confirmations back", async () => {
    const old = await original();
    await decision();
    await generate();
    const current = await original("2026-09-10");
    await decision("2026-09", 0, true);
    const allocations = state().overtime_allocations;
    const decisions = state().scoped_allowance_decisions;
    await acceptTestRun(db, ["2026-09"]);
    expect(state().overtime_allocations).toEqual(allocations);
    expect(state().scoped_allowance_decisions).toEqual(decisions);
    expect(adapter.database.prepare("SELECT shift_id FROM overtime_allocations").all()).toEqual([
      { shift_id: current.id },
    ]);
    expect(
      adapter.database.prepare("SELECT id FROM shift_entries WHERE id=?").get(old.id),
    ).toBeUndefined();
    expect(state().dev_test_backups).toEqual([]);
  });
  it("preserves cleared decisions and stale allocations rather than reconfirming them", async () => {
    const stale = await original();
    await original("2026-09-20", true);
    await decision("2026-09", 0, true);
    await saveShift(db, { ...stale, expectedRevision: stale.revision, endTime: "02:00" });
    const before = state();
    await generate();
    await restoreTestBackup(db, ["2026-09"]);
    expect(state()).toEqual(before);
  });
  it.each([undefined, 1, 2, 3])(
    "reads legacy snapshot %s without inventing or retaining new confirmations",
    async (version) => {
      await saveShift(db, { ...fixture({ date: "2026-09-15" }), id: undefined });
      await generate();
      const root = JSON.parse(await savedPayload());
      delete root.remuneration;
      delete root.training;
      if (version === undefined) {
        delete root.version;
        delete root.month;
        delete root.counts;
      } else root.version = version;
      await db.runAsync(
        "UPDATE dev_test_backups SET payload=? WHERE month=?",
        JSON.stringify(root),
        "2026-09",
      );
      await original("2026-09-10");
      await decision();
      await restoreTestBackup(db, ["2026-09"]);
      expect(state().overtime_allocations).toEqual([]);
      expect(state().scoped_allowance_decisions).toEqual([]);
    },
  );
  it.each([
    "missing",
    "extra",
    "orphan",
    "duplicate",
    "future-shift",
    "wrong-total",
    "wrong-month",
    "bad-json",
    "future-version",
    "downgrade",
  ])("rejects %s snapshot before replacing current data", async (mutation) => {
    await original();
    await decision();
    await generate();
    const root = JSON.parse(await savedPayload());
    if (mutation === "missing") delete root.remuneration;
    if (mutation === "extra") root.remuneration.extra = true;
    if (mutation === "orphan") root.remuneration.overtimeAllocations[0].shift_id = "missing";
    if (mutation === "duplicate")
      root.remuneration.overtimeAllocations.push(root.remuneration.overtimeAllocations[0]);
    if (mutation === "future-shift") root.remuneration.overtimeAllocations[0].shift_revision = 999;
    if (mutation === "wrong-total")
      root.remuneration.overtimeAllocations[0].allocations_json = JSON.stringify([
        { date: "2026-10-01", minutes: 5 },
      ]);
    if (mutation === "wrong-month") root.remuneration.allowanceDecision.month = "2026-10";
    if (mutation === "bad-json") root.remuneration.allowanceDecision.decisions_json = "{";
    if (mutation === "future-version") root.version = 100;
    if (mutation === "downgrade") root.version = 3;
    await db.runAsync(
      "UPDATE dev_test_backups SET payload=? WHERE month=?",
      JSON.stringify(root),
      "2026-09",
    );
    const before = state();
    await expect(restoreTestBackup(db, ["2026-09"])).rejects.toThrow();
    expect(state()).toEqual(before);
    await expect(generate()).rejects.toThrow();
    expect(state()).toEqual(before);
  });
  it("rolls back every month when a later month's backup is corrupt", async () => {
    await original();
    await decision();
    await original("2026-10-31");
    await decision("2026-10");
    await generate("2026-09", 3);
    await db.runAsync("UPDATE dev_test_backups SET payload='{}' WHERE month='2026-10'");
    const before = state();
    await expect(restoreTestBackup(db, ["2026-09", "2026-10"])).rejects.toThrow();
    expect(state()).toEqual(before);
  });
  it.each([
    "INSERT INTO overtime_allocations",
    "INSERT INTO scoped_allowance_decisions",
    "DELETE FROM dev_test_backups",
  ])("rolls back restore after failure at %s", async (sql) => {
    await original();
    await decision();
    await generate();
    await original("2026-09-10");
    await decision();
    const before = state();
    adapter.fail = sql;
    await expect(restoreTestBackup(db, ["2026-09"])).rejects.toThrow("injected");
    expect(state()).toEqual(before);
    expect(adapter.database.inTransaction).toBe(false);
  });
  it("rolls back the new snapshot and all original rows when generation fails", async () => {
    await original();
    await decision();
    const before = state();
    adapter.fail = "DELETE FROM shift_entries";
    await expect(generate()).rejects.toThrow("injected");
    expect(state()).toEqual(before);
  });
});
