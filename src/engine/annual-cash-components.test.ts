import { describe, expect, it } from "vitest";
import type { SavedTariffAnnualClaim } from "@/domain/saved-tariff-annual-claim";
import { validateRulePackage } from "@/rules/validation";
import { annualPaymentCandidate } from "./annual-core-test-fixtures";
import { missingTariffAnnualClaims } from "./remuneration-annual-coverage";
import { calculateTariffAnnualPayments } from "./remuneration-tariff-annual";
import { tariffAnnualFixture } from "./tariff-annual-test-fixtures";
import { history, resolver, work } from "./remuneration-test-fixtures";
function fixture() {
  const { pkg, claim } = tariffAnnualFixture();
  const row: SavedTariffAnnualClaim = {
    claim,
    actualPayment: null,
    revoked: false,
    revision: 1,
    updatedAt: work.updatedAt,
  };
  return { row, pkg, rules: resolver([pkg]) };
}
describe("annual cash components", () => {
  it.each([false, true])("keeps a validated synthetic fixture (training %s)", (training) => {
    const validation = validateRulePackage(annualPaymentCandidate(training));
    expect(validation.ok, JSON.stringify(validation)).toBe(true);
  });
  it("puts the estimate in the declared cash month only", () => {
    const { row, rules } = fixture();
    expect(calculateTariffAnnualPayments("2026-10", [row], rules).positions).toEqual([]);
    expect(calculateTariffAnnualPayments("2026-11", [row], rules)).toMatchObject({
      totalCents: 270000,
      status: "estimated",
      complete: true,
    });
  });
  it("replaces the estimate by an actual payment in a later year", () => {
    const { row, rules } = fixture();
    const actual = {
      ...row,
      actualPayment: { grossCents: 255000, payoutMonth: "2027-01" },
      revision: 2,
    };
    expect(calculateTariffAnnualPayments("2026-11", [actual], rules).positions).toEqual([]);
    expect(calculateTariffAnnualPayments("2027-01", [actual], rules)).toMatchObject({
      totalCents: 255000,
      status: "calculated",
      complete: true,
    });
  });
  it("preserves an actual confirmed zero", () => {
    const { row, rules } = fixture();
    const actual = { ...row, actualPayment: { grossCents: 0, payoutMonth: "2026-11" } };
    expect(calculateTariffAnnualPayments("2026-11", [actual], rules)).toMatchObject({
      totalCents: 0,
      status: "calculated",
      complete: true,
    });
  });
  it("does not silently count two unallocated annual claims", () => {
    const { row, rules } = fixture();
    const other = { ...row, claim: { ...row.claim, id: "second" } };
    expect(calculateTariffAnnualPayments("2026-11", [row, other], rules)).toMatchObject({
      totalCents: null,
      complete: false,
    });
  });
  it("does not calculate a withdrawn claim", () => {
    const { row, rules } = fixture();
    expect(
      calculateTariffAnnualPayments("2026-11", [{ ...row, revoked: true }], rules).positions,
    ).toEqual([]);
  });
  it("reports the missing personal annual confirmation in the payout month", () => {
    const { rules } = fixture();
    expect(missingTariffAnnualClaims("2026-10", [history()], [], rules).positions).toEqual([]);
    expect(missingTariffAnnualClaims("2026-11", [history()], [], rules)).toMatchObject({
      totalCents: null,
      complete: false,
      positions: [{ issue: { code: "ANNUAL_INPUT_MISSING" } }],
    });
  });
  it("keeps a saved active annual claim from creating a duplicate gap", () => {
    const { row, rules } = fixture();
    expect(missingTariffAnnualClaims("2026-11", [history()], [row], rules).positions).toEqual([]);
  });
});
