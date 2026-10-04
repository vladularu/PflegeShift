import Database from "better-sqlite3";
import type { SQLiteDatabase } from "expo-sqlite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { migrateDatabase } from "./migrations";
import { saveProfile } from "./profile-repository";
import { saveDatedRemunerationProfile } from "./remuneration-profile-repository";
import { saveMonthlyAllowanceDecisions } from "./allowance-decision-repository";
import { loadRemunerationSnapshot } from "./remuneration-snapshot-repository";
import { saveOvertimeAllocation } from "./overtime-allocation-repository";
import { saveShift } from "./calendar-entry-repository";
import { saveTvoedAnnexAPremiumFacts } from "./tvoed-annex-a-premium-facts-repository";
import { tvoedAnnexAShiftBinding } from "@/domain/saved-tvoed-annex-a-premium-facts";
import { shift as shiftFixture } from "@/engine/remuneration-test-fixtures";
import { tariffAnnualFixture } from "@/engine/tariff-annual-test-fixtures";
import { saveTariffAnnualClaim, revokeTariffAnnualClaim } from "./tariff-annual-claim-repository";
import {
  saveActualOwnAnnualPayment,
  revokeActualOwnAnnualPayment,
} from "./annual-payment-repository";

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((yes) => {
    resolve = yes;
  });
  return { promise, resolve };
}

class TestDatabase {
  readonly database = new Database(":memory:");
  beforeRead: ((sql: string) => Promise<void>) | null = null;
  async execAsync(sql: string) {
    this.database.exec(sql);
  }
  async runAsync(sql: string, ...params: unknown[]) {
    const result = this.database.prepare(sql).run(...params);
    return { changes: result.changes, lastInsertRowId: Number(result.lastInsertRowid) };
  }
  async getFirstAsync<T>(sql: string, ...params: unknown[]): Promise<T | null> {
    return (this.database.prepare(sql).get(...params) as T | undefined) ?? null;
  }
  async getAllAsync<T>(sql: string, ...params: unknown[]): Promise<T[]> {
    await this.beforeRead?.(sql);
    return this.database.prepare(sql).all(...params) as T[];
  }
}
const data = {
  version: 1,
  weeklyMinutes: 2310,
  selection: {
    kind: "tariff",
    packageId: "tvoed-vka-bt-k",
    variant: "BT_K",
    region: "OTHER",
    group: "P5",
    level: "1",
    fullTimeWeeklyMinutes: 2310,
  },
} as const;

describe("atomic remuneration snapshot", () => {
  let adapter: TestDatabase;
  let db: SQLiteDatabase;
  beforeEach(async () => {
    adapter = new TestDatabase();
    db = adapter as unknown as SQLiteDatabase;
    await migrateDatabase(db);
  });
  afterEach(() => adapter.database.close());

  async function populate() {
    await saveProfile(db, { federalState: "NW", weeklyMinutes: 2310, timeZone: "Europe/Berlin" });
    await saveDatedRemunerationProfile(db, {
      effectiveFrom: "2026-01-01",
      data,
      expectedRevision: 0,
    });
    await saveMonthlyAllowanceDecisions(db, {
      month: "2026-09",
      expectedRevision: 0,
      decisions: [
        {
          from: "2026-09-01",
          through: "2026-09-30",
          tariff: { packageId: "tvoed-vka-bt-k", variant: "BT_K", region: "OTHER" },
          allowanceStatus: "SHIFT_MONTHLY",
        },
      ],
    });
  }

  async function populateOvertime() {
    await populate();
    const shift = await saveShift(db, {
      ...shiftFixture({ date: "2026-09-30", overtimeMinutes: 90, tariffOvertimeConfirmed: true }),
      id: undefined,
    });
    const input = {
      shiftId: shift.id,
      expectedShiftRevision: shift.revision,
      timeZone: "Europe/Berlin",
      expectedRevision: 0,
      allocations: [
        { date: "2026-09-30", minutes: 30 },
        { date: "2026-10-01", minutes: 60 },
      ],
    };
    const saved = await saveOvertimeAllocation(db, input);
    return { shift, input, saved };
  }

  it("returns an immutable successful empty snapshot, not a loading failure", async () => {
    const snapshot = await loadRemunerationSnapshot(db);
    expect(snapshot).toEqual({
      caritasMonthFacts: [],
      tvoedAnnexAMonthConfirmations: [],
      drkEmployeeMonthConfirmations: [],
      drkTrainingMonthConfirmations: [],
      tvoedAnnexAPremiumFacts: [],
      tvoedSueMonthConfirmations: [],
      tvoedSueAllowanceConfirmations: [],
      tvlShiftWork: [],
      profiles: [],
      allowanceDecisions: [],
      overtimeAllocations: [],
      paidAbsences: [],
      actualAnnualPayments: [],
      tariffAnnualClaims: [],
    });
    expect(Object.isFrozen(snapshot.paidAbsences)).toBe(true);
    expect(Object.isFrozen(snapshot.tvlShiftWork)).toBe(true);
    expect(Object.isFrozen(snapshot.tvoedAnnexAPremiumFacts)).toBe(true);
    expect(Object.isFrozen(snapshot.tvoedSueAllowanceConfirmations)).toBe(true);
    expect(Object.isFrozen(snapshot.actualAnnualPayments)).toBe(true);
    expect(Object.isFrozen(snapshot.tariffAnnualClaims)).toBe(true);
    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(Object.isFrozen(snapshot.allowanceDecisions)).toBe(true);
    expect(Object.isFrozen(snapshot.profiles)).toBe(true);
    expect(Object.isFrozen(snapshot.overtimeAllocations)).toBe(true);
  });

  it("loads all months including explicitly cleared months in stable order", async () => {
    await populate();
    await saveMonthlyAllowanceDecisions(db, {
      month: "2026-08",
      expectedRevision: 0,
      decisions: [],
    });
    const snapshot = await loadRemunerationSnapshot(db);
    expect(snapshot.profiles.map((profile) => profile.effectiveFrom)).toEqual([null, "2026-01-01"]);
    expect(snapshot.allowanceDecisions.map((month) => month.month)).toEqual(["2026-08", "2026-09"]);
    expect(snapshot.allowanceDecisions[0]).toMatchObject({ revision: 1, decisions: [] });
    expect(snapshot.allowanceDecisions[1].decisions[0].allowanceStatus).toBe("SHIFT_MONTHLY");
  });

  it.each([
    "remuneration_profiles",
    "scoped_allowance_decisions",
    "overtime_allocations",
    "paid_absences",
    "actual_annual_payments",
    "tvl_shift_work",
  ])(
    "rejects a partial snapshot when %s cannot be read and releases the transaction",
    async (table) => {
      await populateOvertime();
      const before = await loadRemunerationSnapshot(db);
      adapter.beforeRead = async (sql) => {
        if (sql.includes(table)) throw new Error("read failure");
      };
      await expect(loadRemunerationSnapshot(db)).rejects.toThrow("read failure");
      expect(adapter.database.inTransaction).toBe(false);
      adapter.beforeRead = null;
      expect(await loadRemunerationSnapshot(db)).toEqual(before);
    },
  );

  it("does not interleave a profile write between snapshot reads", async () => {
    await populate();
    const entered = deferred();
    const release = deferred();
    adapter.beforeRead = async (sql) => {
      if (sql.includes("FROM remuneration_profiles")) {
        entered.resolve();
        await release.promise;
      }
    };
    const pendingSnapshot = loadRemunerationSnapshot(db);
    await entered.promise;
    const pendingWrite = saveDatedRemunerationProfile(db, {
      effectiveFrom: "2026-01-01",
      expectedRevision: 1,
      data: { ...data, weeklyMinutes: 1155 },
    });
    release.resolve();
    const snapshot = await pendingSnapshot;
    await pendingWrite;
    expect(snapshot.profiles[1].data.weeklyMinutes).toBe(2310);
    expect(snapshot.allowanceDecisions[0].decisions).toHaveLength(1);
    adapter.beforeRead = null;
    expect((await loadRemunerationSnapshot(db)).profiles[1].data.weeklyMinutes).toBe(1155);
  });

  it("retains actual zero and revoked confirmations without dropping their conflict tokens", async () => {
    await populate();
    const saved = await saveActualOwnAnnualPayment(db, {
      expected: null,
      payment: {
        paymentId: "annual",
        entitlementYear: 2026,
        payoutMonth: "2027-01",
        title: "Sonderzahlung",
        grossCents: 0,
      },
    });
    expect((await loadRemunerationSnapshot(db)).actualAnnualPayments).toEqual([saved]);
    const revoked = await revokeActualOwnAnnualPayment(db, saved);
    expect((await loadRemunerationSnapshot(db)).actualAnnualPayments).toEqual([revoked]);
  });

  it("retains tariff claims, actual zero and absent payments including revocation tokens", async () => {
    await populate();
    const input = { claim: tariffAnnualFixture().claim, actualPayment: null, expected: null };
    const estimated = await saveTariffAnnualClaim(db, input);
    expect((await loadRemunerationSnapshot(db)).tariffAnnualClaims).toEqual([estimated]);
    const zero = await saveTariffAnnualClaim(db, {
      ...input,
      actualPayment: { grossCents: 0, payoutMonth: "2027-01" },
      expected: estimated,
    });
    const loaded = (await loadRemunerationSnapshot(db)).tariffAnnualClaims;
    expect(loaded).toEqual([zero]);
    expect(Object.isFrozen(loaded[0].claim.basis.months)).toBe(true);
    const revoked = await revokeTariffAnnualClaim(db, zero);
    expect((await loadRemunerationSnapshot(db)).tariffAnnualClaims).toEqual([revoked]);
  });

  it("serializes tariff claim writes after the entire snapshot transaction", async () => {
    await populate();
    const entered = deferred();
    const release = deferred();
    adapter.beforeRead = async (sql) => {
      if (sql.includes("FROM remuneration_profiles")) {
        entered.resolve();
        await release.promise;
      }
    };
    const read = loadRemunerationSnapshot(db);
    await entered.promise;
    const write = saveTariffAnnualClaim(db, {
      claim: tariffAnnualFixture().claim,
      actualPayment: null,
      expected: null,
    });
    release.resolve();
    expect((await read).tariffAnnualClaims).toEqual([]);
    const saved = await write;
    adapter.beforeRead = null;
    expect((await loadRemunerationSnapshot(db)).tariffAnnualClaims).toEqual([saved]);
  });

  it("fails the complete snapshot on corrupt tariff claims and releases the transaction", async () => {
    await populate();
    const saved = await saveTariffAnnualClaim(db, {
      claim: tariffAnnualFixture().claim,
      actualPayment: null,
      expected: null,
    });
    await db.runAsync("UPDATE tariff_annual_claims SET claim_json='{}'");
    await expect(loadRemunerationSnapshot(db)).rejects.toThrow();
    expect(adapter.database.inTransaction).toBe(false);
    await db.runAsync("UPDATE tariff_annual_claims SET claim_json=?", JSON.stringify(saved.claim));
    expect((await loadRemunerationSnapshot(db)).tariffAnnualClaims).toEqual([saved]);
  });

  it("does not interleave an annual payment write in a combined snapshot", async () => {
    await populate();
    const entered = deferred();
    const release = deferred();
    adapter.beforeRead = async (sql) => {
      if (sql.includes("FROM remuneration_profiles")) {
        entered.resolve();
        await release.promise;
      }
    };
    const pendingSnapshot = loadRemunerationSnapshot(db);
    await entered.promise;
    const pendingWrite = saveActualOwnAnnualPayment(db, {
      expected: null,
      payment: {
        paymentId: "annual",
        entitlementYear: 2026,
        payoutMonth: "2026-12",
        title: "Sonderzahlung",
        grossCents: 54321,
      },
    });
    release.resolve();
    expect((await pendingSnapshot).actualAnnualPayments).toEqual([]);
    const saved = await pendingWrite;
    adapter.beforeRead = null;
    expect((await loadRemunerationSnapshot(db)).actualAnnualPayments).toEqual([saved]);
  });

  it("rejects a corrupt annual payment instead of returning a partial calculation snapshot", async () => {
    await populate();
    await db.runAsync(
      "INSERT INTO actual_annual_payments VALUES (?, ?, ?, ?, ?)",
      "annual",
      2026,
      "{}",
      0,
      "2026-09-01T00:00:00Z",
    );
    await expect(loadRemunerationSnapshot(db)).rejects.toThrow();
    expect(adapter.database.inTransaction).toBe(false);
  });

  it("rejects corrupted stored confirmations instead of substituting an empty set", async () => {
    await populate();
    await db.runAsync("UPDATE scoped_allowance_decisions SET decisions_json=?", '{"future":true}');
    await expect(loadRemunerationSnapshot(db)).rejects.toThrow();
    expect(adapter.database.inTransaction).toBe(false);
  });

  it("loads Anlage-A premium facts with the same committed profile and rejects corrupt facts", async () => {
    await populate();
    const profile = await saveDatedRemunerationProfile(db, {
      effectiveFrom: "2026-09-01",
      expectedRevision: 0,
      data: {
        version: 1,
        weeklyMinutes: 1920,
        selection: {
          kind: "tariff",
          packageId: "tvoed-vka-anlage-a",
          variant: "BT_K",
          region: "VKA",
          group: "EG6",
          level: "2",
          fullTimeWeeklyMinutes: 2340,
        },
      },
    });
    const shift = await saveShift(db, {
      ...shiftFixture({ date: "2026-09-30" }),
      id: undefined,
    });
    const saved = await saveTvoedAnnexAPremiumFacts(db, {
      month: "2026-09",
      profileEffectiveFrom: "2026-09-01",
      expectedProfileRevision: profile.revision,
      ruleVersionId: "2026-05-01-draft1",
      cashPaymentConfirmed: true,
      localAgreement: "NONE_CONFIRMED",
      dayDecisions: [
        {
          shiftId: shift.id,
          date: shift.date,
          origin: "confirmed",
          shiftBinding: tvoedAnnexAShiftBinding(shift, "Europe/Berlin"),
          workKind: "REGULAR_ACTIVE",
          holidayTimeOff: null,
          shiftWork: true,
          legacyAngestellteClass: null,
        },
      ],
      expectedRevision: 0,
    });
    const snapshot = await loadRemunerationSnapshot(db);
    expect(snapshot.tvoedAnnexAPremiumFacts).toEqual([saved]);
    expect(snapshot.profiles).toContainEqual(profile);
    await db.runAsync("UPDATE tvoed_annex_a_premium_facts SET facts_json=?", '{"invalid":true}');
    await expect(loadRemunerationSnapshot(db)).rejects.toThrow();
    expect(adapter.database.inTransaction).toBe(false);
  });

  it("preserves cross-month, stale and explicitly cleared allocations without recalculating them", async () => {
    const { saved, shift, input } = await populateOvertime();
    expect((await loadRemunerationSnapshot(db)).overtimeAllocations).toEqual([saved]);
    await saveShift(db, { ...shift, expectedRevision: shift.revision, note: "updated" });
    expect((await loadRemunerationSnapshot(db)).overtimeAllocations).toEqual([saved]);
    const cleared = await saveOvertimeAllocation(db, {
      ...input,
      expectedRevision: 1,
      expectedShiftRevision: shift.revision + 1,
      allocations: null,
    });
    expect((await loadRemunerationSnapshot(db)).overtimeAllocations).toEqual([cleared]);
    expect(cleared.allocations).toBeNull();
    expect(cleared.revision).toBe(2);
  });

  it("does not interleave an overtime write between profiles and allocations", async () => {
    const { saved, input } = await populateOvertime();
    const entered = deferred();
    const release = deferred();
    adapter.beforeRead = async (sql) => {
      if (sql.includes("FROM scoped_allowance_decisions")) {
        entered.resolve();
        await release.promise;
      }
    };
    const pendingSnapshot = loadRemunerationSnapshot(db);
    await entered.promise;
    const pendingWrite = saveOvertimeAllocation(db, {
      ...input,
      expectedRevision: 1,
      allocations: null,
    });
    release.resolve();
    const snapshot = await pendingSnapshot;
    const cleared = await pendingWrite;
    expect(snapshot.overtimeAllocations).toEqual([saved]);
    expect(snapshot.profiles).toHaveLength(2);
    expect(snapshot.allowanceDecisions).toHaveLength(1);
    adapter.beforeRead = null;
    expect((await loadRemunerationSnapshot(db)).overtimeAllocations).toEqual([cleared]);
  });

  it("rejects corrupted overtime rather than reporting an otherwise complete snapshot", async () => {
    await populateOvertime();
    await db.runAsync("UPDATE overtime_allocations SET allocations_json=?", '{"future":true}');
    await expect(loadRemunerationSnapshot(db)).rejects.toThrow();
    expect(adapter.database.inTransaction).toBe(false);
  });
});
