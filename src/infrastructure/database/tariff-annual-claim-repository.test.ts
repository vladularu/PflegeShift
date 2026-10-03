import { randomUUID } from "node:crypto";
import { unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ConcurrencyError } from "@/domain/errors";
import {
  validateSavedTariffAnnualClaim,
  validateSavedTariffAnnualClaims,
} from "@/domain/saved-tariff-annual-claim";
import { tariffAnnualFixture } from "@/engine/tariff-annual-test-fixtures";
import { migrateTariffAnnualClaims } from "./migration-21-tariff-annual-claims";
import {
  listTariffAnnualClaims,
  mapTariffAnnualClaimRow,
  revokeTariffAnnualClaim,
  saveTariffAnnualClaim,
} from "./tariff-annual-claim-repository";
import { TariffAnnualTestDatabase } from "./tariff-annual-test-database";
import { withImmediateTransaction } from "./transaction";

describe("tariff annual claim persistence", () => {
  let adapter: TariffAnnualTestDatabase;
  beforeEach(async () => {
    adapter = new TariffAnnualTestDatabase();
    await adapter.setup();
  });
  afterEach(() => adapter.database.close());
  const actual = { grossCents: 270_000, payoutMonth: "2027-01" };
  const create = () =>
    saveTariffAnnualClaim(adapter.db, {
      claim: tariffAnnualFixture().claim,
      actualPayment: actual,
      expected: null,
    });
  it("is additive and idempotent without changing saved personal data", async () => {
    const saved = await create();
    const profile = await adapter.db.getFirstAsync("SELECT * FROM user_profile");
    await migrateTariffAnnualClaims(adapter.db, "2026-10-01T00:00:00Z");
    expect(await listTariffAnnualClaims(adapter.db)).toEqual([saved]);
    expect(await adapter.db.getFirstAsync("SELECT * FROM user_profile")).toEqual(profile);
    expect(
      await adapter.db.getAllAsync("SELECT version FROM schema_migrations WHERE version=21"),
    ).toHaveLength(1);
  });
  it("keeps the claim when a payment is removed, supports zero, and retains revocation", async () => {
    const saved = await create();
    const zero = await saveTariffAnnualClaim(adapter.db, {
      claim: saved.claim,
      actualPayment: { ...actual, grossCents: 0 },
      expected: saved,
    });
    expect(zero).toMatchObject({
      actualPayment: { grossCents: 0, payoutMonth: "2027-01" },
      revision: 2,
    });
    const estimate = await saveTariffAnnualClaim(adapter.db, {
      claim: saved.claim,
      actualPayment: null,
      expected: zero,
    });
    expect(estimate.actualPayment).toBeNull();
    const revoked = await revokeTariffAnnualClaim(adapter.db, estimate);
    expect(revoked).toMatchObject({ revoked: true, revision: 4, claim: saved.claim });
    expect(await listTariffAnnualClaims(adapter.db)).toEqual([revoked]);
    await expect(
      saveTariffAnnualClaim(adapter.db, {
        claim: saved.claim,
        actualPayment: actual,
        expected: null,
      }),
    ).rejects.toBeInstanceOf(ConcurrencyError);
    const restored = await saveTariffAnnualClaim(adapter.db, {
      claim: saved.claim,
      actualPayment: actual,
      expected: revoked,
    });
    expect(restored).toMatchObject({ revoked: false, revision: 5 });
    expect(restored.updatedAt > revoked.updatedAt).toBe(true);
  });
  it("persists an incomplete draft without manufacturing a complete entitlement", async () => {
    const { claim } = tariffAnnualFixture();
    claim.employment.confirmed = false;
    claim.basis.months = [];
    claim.entitlements.forEach((r) => {
      r.reason = "UNKNOWN";
    });
    const saved = await saveTariffAnnualClaim(adapter.db, {
      claim,
      actualPayment: null,
      expected: null,
    });
    expect((await listTariffAnnualClaims(adapter.db))[0]).toEqual(saved);
  });
  it("rejects stale updates, stale revocations and restored same-revision content", async () => {
    const saved = await create();
    await adapter.db.runAsync(
      "UPDATE tariff_annual_claims SET actual_payment_json=?",
      JSON.stringify({ ...actual, grossCents: 1 }),
    );
    await expect(
      saveTariffAnnualClaim(adapter.db, {
        claim: saved.claim,
        actualPayment: null,
        expected: saved,
      }),
    ).rejects.toBeInstanceOf(ConcurrencyError);
    await expect(revokeTariffAnnualClaim(adapter.db, saved)).rejects.toBeInstanceOf(
      ConcurrencyError,
    );
    expect((await listTariffAnnualClaims(adapter.db))[0].actualPayment?.grossCents).toBe(1);
  });
  it("serializes simultaneous creates and updates", async () => {
    const results = await Promise.allSettled([create(), create()]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const [saved] = await listTariffAnnualClaims(adapter.db);
    const updates = await Promise.allSettled(
      [1, 2].map((grossCents) =>
        saveTariffAnnualClaim(adapter.db, {
          claim: saved.claim,
          actualPayment: { ...actual, grossCents },
          expected: saved,
        }),
      ),
    );
    expect(updates.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect((await listTariffAnnualClaims(adapter.db))[0].revision).toBe(2);
  });
  it("rejects changing the stable claim identity or entitlement year", async () => {
    const saved = await create();
    for (const change of [{ id: "other" }, { year: 2027 }]) {
      await expect(
        saveTariffAnnualClaim(adapter.db, {
          claim: { ...saved.claim, ...change },
          actualPayment: null,
          expected: saved,
        }),
      ).rejects.toThrow("Kennung");
    }
  });
  it("blocks all writes while any testlab backup is open", async () => {
    const saved = await create();
    await adapter.db.runAsync(
      "INSERT INTO dev_test_backups(month,payload,run_id,created_at) VALUES(?,?,?,?)",
      "2025-02",
      "{}",
      "test",
      saved.updatedAt,
    );
    await expect(revokeTariffAnnualClaim(adapter.db, saved)).rejects.toThrow("Testlabor");
    await expect(
      saveTariffAnnualClaim(adapter.db, {
        claim: saved.claim,
        actualPayment: null,
        expected: saved,
      }),
    ).rejects.toThrow("Testlabor");
    await expect(
      saveTariffAnnualClaim(adapter.db, {
        claim: { ...saved.claim, id: "new" },
        actualPayment: null,
        expected: null,
      }),
    ).rejects.toThrow("Testlabor");
    expect(await listTariffAnnualClaims(adapter.db)).toEqual([saved]);
    await adapter.db.runAsync("DELETE FROM dev_test_backups");
    await expect(revokeTariffAnnualClaim(adapter.db, saved)).resolves.toMatchObject({
      revoked: true,
    });
  });
  it("rolls back failed writes and leaves the queue usable", async () => {
    const saved = await create();
    adapter.fail = "INSERT INTO tariff_annual_claims";
    await expect(revokeTariffAnnualClaim(adapter.db, saved)).rejects.toThrow("injected");
    expect(await listTariffAnnualClaims(adapter.db)).toEqual([saved]);
    adapter.fail = null;
    expect((await revokeTariffAnnualClaim(adapter.db, saved)).revision).toBe(2);
  });
  it("copies caller-owned data before waiting on a transaction", async () => {
    let release!: () => void;
    const barrier = new Promise<void>((resolve) => {
      release = resolve;
    });
    const pending = withImmediateTransaction(adapter.db, async () => barrier);
    const { claim } = tariffAnnualFixture();
    const payment = { ...actual };
    const write = saveTariffAnnualClaim(adapter.db, {
      claim,
      actualPayment: payment,
      expected: null,
    });
    claim.basis.months[0].baseCents = 1;
    payment.grossCents = 0;
    release();
    await pending;
    expect(await write).toMatchObject({ actualPayment: actual });
    expect((await listTariffAnnualClaims(adapter.db))[0].claim.basis.months[0].baseCents).toBe(
      300_000,
    );
  });
  it("requires an existing work profile", async () => {
    await adapter.db.runAsync("DELETE FROM user_profile");
    await expect(create()).rejects.toThrow("Arbeitsprofil");
    expect(await listTariffAnnualClaims(adapter.db)).toEqual([]);
  });
  it("survives a real close/reopen of an isolated database file", async () => {
    const path = join(tmpdir(), "luna-tariff-annual-" + randomUUID() + ".sqlite");
    let file = new TariffAnnualTestDatabase(path);
    try {
      await file.setup();
      const saved = await saveTariffAnnualClaim(file.db, {
        claim: tariffAnnualFixture().claim,
        actualPayment: actual,
        expected: null,
      });
      file.database.close();
      file = new TariffAnnualTestDatabase(path);
      await file.setup();
      expect(await listTariffAnnualClaims(file.db)).toEqual([saved]);
    } finally {
      file.database.close();
      unlinkSync(path);
    }
  });
  it.each([
    "claim-id",
    "year",
    "claim-json",
    "actual-json",
    "revision",
    "revoked",
    "extra",
    "timestamp",
  ])("rejects corrupt row %s", async (kind) => {
    await create();
    const raw = (await adapter.db.getFirstAsync("SELECT * FROM tariff_annual_claims")) as Record<
      string,
      unknown
    >;
    if (kind === "claim-id") raw.claim_id = "wrong";
    if (kind === "year") raw.entitlement_year = 2027;
    if (kind === "claim-json") raw.claim_json = '{"private":"do-not-log"';
    if (kind === "actual-json") raw.actual_payment_json = '{"private":"do-not-log"';
    if (kind === "revision") raw.revision = 0;
    if (kind === "revoked") raw.revoked = 2;
    if (kind === "extra") raw.extra = 1;
    if (kind === "timestamp") raw.updated_at = "invalid";
    expect(() => mapTariffAnnualClaimRow(raw)).toThrow();
    if (kind.endsWith("json")) expect(() => mapTariffAnnualClaimRow(raw)).toThrow("beschädigt");
  });
  it.each([-1, 0.5, NaN, Infinity, 1_000_000_001])(
    "rejects invalid actual cents %s before writing",
    async (grossCents) => {
      await expect(
        saveTariffAnnualClaim(adapter.db, {
          claim: tariffAnnualFixture().claim,
          actualPayment: { ...actual, grossCents },
          expected: null,
        }),
      ).rejects.toThrow();
      expect(await listTariffAnnualClaims(adapter.db)).toEqual([]);
    },
  );
  it("validates immutable saved records, duplicates and list bounds", async () => {
    const saved = await create();
    expect(Object.isFrozen(validateSavedTariffAnnualClaim(saved).claim.basis.months)).toBe(true);
    expect(() => validateSavedTariffAnnualClaims([saved, saved])).toThrow("Doppelte");
    expect(() => validateSavedTariffAnnualClaims(Array(4097).fill(saved))).toThrow();
    expect(() => validateSavedTariffAnnualClaim({ ...saved, extra: true })).toThrow();
    expect(() =>
      validateSavedTariffAnnualClaim({ ...saved, revision: Number.MAX_SAFE_INTEGER + 1 }),
    ).toThrow();
    expect(() =>
      validateSavedTariffAnnualClaim({
        ...saved,
        actualPayment: { ...actual, payoutMonth: "4100-01" },
      }),
    ).toThrow();
  });
});
