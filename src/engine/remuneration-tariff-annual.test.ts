import { describe, expect, it } from "vitest";
import type { SavedTariffAnnualClaim } from "@/domain/saved-tariff-annual-claim";
import { tariffAnnualFixture } from "./tariff-annual-test-fixtures";
import { history, resolver, work } from "./remuneration-test-fixtures";
import { calculateTariffAnnualPayments } from "./remuneration-tariff-annual";
import { calculateDatedMonthlyRemuneration } from "./remuneration-month";

function fixture(training = false) {
  const { pkg, claim } = tariffAnnualFixture(training);
  const row: SavedTariffAnnualClaim = {
    claim,
    actualPayment: null,
    revoked: false,
    revision: 1,
    updatedAt: work.updatedAt,
  };
  return { pkg, claim, row, rules: resolver([pkg]) };
}
const months = (year: number) =>
  Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, "0")}`);
describe("tariff annual cash-month aggregation", () => {
  it("keeps a Caritas draft out of cash months until an actual payment is confirmed", () => {
    const { row, claim, rules } = fixture();
    claim.version = 3;
    claim.selection = {
      packageId: "avr-caritas-p-bw",
      variant: "ANLAGE_31",
      region: "BW",
      group: "p7",
      confirmed: true,
      groupAtSeptember1Confirmed: true,
    };
    expect(
      months(2026).flatMap((month) => calculateTariffAnnualPayments(month, [row], rules).positions),
    ).toEqual([]);
    const paid = { ...row, actualPayment: { grossCents: 123_456, payoutMonth: "2026-11" } };
    expect(calculateTariffAnnualPayments("2026-11", [paid], rules).totalCents).toBe(123_456);
  });
  it.each([
    [false, 270000],
    [true, 135000],
  ] as const)("includes exactly one sourced estimate (training %s)", (training, cents) => {
    const { row, rules } = fixture(training);
    const results = months(2026).map((m) => calculateTariffAnnualPayments(m, [row], rules));
    expect(results.reduce((sum, r) => sum + r.knownSubtotalCents, 0)).toBe(cents);
    expect(results.flatMap((r) => r.positions)).toHaveLength(1);
    const p = results[10].positions[0];
    expect(p.status).toBe("estimated");
    expect(p.basis.tariff?.claimRevision).toBe(1);
    expect(p.source.references.length).toBeGreaterThan(0);
  });
  it.each([0, 123456])(
    "actual %s replaces the estimate, including payout in the next year",
    (grossCents) => {
      const { row, rules } = fixture();
      const saved = { ...row, actualPayment: { grossCents, payoutMonth: "2027-01" } };
      expect(
        months(2026).flatMap((m) => calculateTariffAnnualPayments(m, [saved], rules).positions),
      ).toEqual([]);
      const results = months(2027).map((m) => calculateTariffAnnualPayments(m, [saved], rules));
      expect(results.reduce((sum, r) => sum + r.knownSubtotalCents, 0)).toBe(grossCents);
      expect(results.flatMap((r) => r.positions)).toHaveLength(1);
      expect(results[0].positions[0]).toMatchObject({
        status: "calculated",
        basis: { method: "actual", entitlementYear: 2026, actualRevision: 1 },
      });
      expect(calculateTariffAnnualPayments("2027-01", [saved], resolver([])).totalCents).toBe(
        grossCents,
      );
    },
  );
  it("keeps missing information and rules unavailable instead of inventing zero", () => {
    const { row, claim, rules } = fixture();
    claim.selection.confirmed = false;
    const missing = calculateTariffAnnualPayments("2026-11", [row], rules);
    expect(missing.totalCents).toBeNull();
    expect(missing.positions[0].basis.tariff?.missing).toEqual(["selection.confirmed"]);
    expect(calculateTariffAnnualPayments("2026-10", [row], rules).positions).toEqual([]);
    const absent = calculateTariffAnnualPayments("2026-11", [row], resolver([]));
    expect(absent.totalCents).toBeNull();
    expect(absent.positions[0].issue?.code).toBe("ANNUAL_RULE_MISSING");
  });
  it("deactivation retains no amount and reactivation returns exactly one amount", () => {
    const { row, rules } = fixture();
    const off = { ...row, revoked: true };
    expect(calculateTariffAnnualPayments("2026-11", [off], rules).positions).toEqual([]);
    expect(
      calculateTariffAnnualPayments("2026-11", [{ ...off, revoked: false, revision: 3 }], rules)
        .totalCents,
    ).toBe(270000);
  });
  it("does not consult or cite current tariff rules for a personally confirmed actual payment", () => {
    const { row, rules } = fixture();
    const unavailable = {
      ...rules,
      annualTariffCandidates: () => {
        throw new Error("This calculation must not read annual tariff rules");
      },
    };
    const result = calculateTariffAnnualPayments(
      "2026-11",
      [{ ...row, actualPayment: { grossCents: 12345, payoutMonth: "2026-11" } }],
      unavailable,
    );
    expect(result.totalCents).toBe(12345);
    expect(result.positions[0].source).toMatchObject({
      kind: "profile",
      requestedPackageId: null,
      packageId: null,
      versionId: null,
      references: [],
    });
    expect(result.positions[0].basis.tariff?.versions).toEqual([]);
  });
  it("does not prorate personal confirmed payments again in the monthly engine", () => {
    const { row } = fixture();
    const input = {
      month: "2026-11",
      shifts: [],
      workProfile: work,
      history: [history("2026-01-01", "P5", 1155)],
      allowanceEntitlements: [],
      resolver: resolver(),
    };
    const before = calculateDatedMonthlyRemuneration(input);
    const after = calculateDatedMonthlyRemuneration({
      ...input,
      tariffAnnualClaims: [
        { ...row, actualPayment: { grossCents: 123456, payoutMonth: "2026-11" } },
      ],
    });
    expect(after.annualPayments.totalCents).toBe(123456);
    expect(after.knownSubtotalCents - before.knownSubtotalCents).toBe(123456);
    expect(after.positions.filter((p) => p.kind === "annual-payment")).toHaveLength(1);
  });
  it("requires an explicit allocation for multiple claims and caps the rational sum at twelve", () => {
    const { row, claim, rules } = fixture();
    const other = structuredClone(row);
    const second: SavedTariffAnnualClaim = {
      ...other,
      claim: { ...other.claim, id: "second", selection: { ...other.claim.selection, group: "p9" } },
    };
    expect(
      calculateTariffAnnualPayments("2026-11", [row, second], rules).positions.every(
        (p) => p.issue?.code === "ANNUAL_ALLOCATION_UNCONFIRMED",
      ),
    ).toBe(true);
    claim.allocation = { required: true, twelfthsNumerator: 13, twelfthsDenominator: 2 };
    const allocated = {
      ...second,
      claim: {
        ...second.claim,
        allocation: { required: true, twelfthsNumerator: 11, twelfthsDenominator: 2 },
      },
    };
    const good = calculateTariffAnnualPayments("2026-11", [row, allocated], rules);
    expect(good.totalCents).toBe(146250 + 116875);
    const tooMuch = {
      ...allocated,
      claim: {
        ...allocated.claim,
        allocation: { ...allocated.claim.allocation, twelfthsNumerator: 12 },
      },
    };
    expect(calculateTariffAnnualPayments("2026-11", [row, tooMuch], rules).totalCents).toBeNull();
  });
  it("does not count two ids with the same claim identity or bypass allocation using actual payments", () => {
    const { row, claim, rules } = fixture();
    claim.allocation = { required: true, twelfthsNumerator: 6, twelfthsDenominator: 1 };
    const first = { ...row, actualPayment: { grossCents: 100000, payoutMonth: "2026-11" } };
    const second = { ...first, claim: { ...claim, id: "duplicate" } };
    expect(calculateTariffAnnualPayments("2026-11", [first, second], rules).totalCents).toBeNull();
    expect(
      calculateTariffAnnualPayments("2026-11", [first, { ...second, revoked: true }], rules)
        .totalCents,
    ).toBe(100000);
  });
  it("detects allocation conflicts in another payout year instead of evaluating only the visible month", () => {
    const { row, rules } = fixture();
    const first = { ...row, actualPayment: { grossCents: 100000, payoutMonth: "2027-01" } };
    const second = {
      ...row,
      claim: { ...row.claim, id: "second", selection: { ...row.claim.selection, group: "p9" } },
    };
    expect(
      calculateTariffAnnualPayments("2027-01", [first, second], rules).positions[0].issue?.code,
    ).toBe("ANNUAL_ALLOCATION_UNCONFIRMED");
  });
  it("uses explicit zero entitlement without requiring invented reference pay", () => {
    const { row, claim, rules } = fixture();
    claim.entitlements = claim.entitlements.map((m) => ({ ...m, reason: "NONE" }));
    claim.basis.months = [];
    const result = calculateTariffAnnualPayments("2026-11", [row], rules);
    expect(result.totalCents).toBe(0);
    expect(result.positions[0].status).toBe("estimated");
  });
});
