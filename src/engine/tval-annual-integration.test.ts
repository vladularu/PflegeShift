import { describe, expect, it } from "vitest";
import oldValue from "../../rules/packages/reviewed/tval-pflege-tdl/2025-11.json";
import currentValue from "../../rules/packages/reviewed/tval-pflege-tdl/2026-04.json";
import type { RuleTariffPackage } from "@/rules/contracts.generated";
import type { SavedTariffAnnualClaim } from "@/domain/saved-tariff-annual-claim";
import { selectAnnualTariff } from "@/rules/tariff-annual-selection";
import { history, resolver, work } from "./remuneration-test-fixtures";
import { annualBasisMonth, tariffAnnualFixture } from "./tariff-annual-test-fixtures";
import { calculateTariffAnnualPayments } from "./remuneration-tariff-annual";
import { calculateDatedMonthlyRemuneration } from "./remuneration-month";

const rules = resolver([oldValue, currentValue] as RuleTariffPackage[]);
function fixture() {
  const { claim } = tariffAnnualFixture(true);
  claim.selection = {
    packageId: "tval-pflege-tdl",
    variant: "CARE",
    region: "WEST_38_5",
    group: "regular",
    confirmed: true,
  };
  claim.basis.months = [annualBasisMonth("2026-11", 144070)];
  const profile = {
    ...history(),
    data: {
      version: 1 as const,
      weeklyMinutes: 2310,
      selection: {
        kind: "tariff" as const,
        packageId: "tval-pflege-tdl",
        variant: "CARE",
        region: "WEST_38_5",
        group: "regular",
        level: "1",
        fullTimeWeeklyMinutes: 2310,
      },
    },
  };
  const row: SavedTariffAnnualClaim = {
    claim,
    actualPayment: null,
    revoked: false,
    revision: 1,
    updatedAt: work.updatedAt,
  };
  return { claim, row, profile };
}
const months = Array.from({ length: 12 }, (_, i) => "2026-" + String(i + 1).padStart(2, "0"));
describe("TVA-L actual catalog annual integration", () => {
  it("agrees across package versions and contributes once to the cash year", () => {
    const { claim, row } = fixture();
    const selected = selectAnnualTariff(claim, rules);
    expect(selected.ok).toBe(true);
    if (selected.ok) expect(selected.versions).toHaveLength(2);
    const all = months.map((m) => calculateTariffAnnualPayments(m, [row], rules));
    expect(all.flatMap((r) => r.positions)).toHaveLength(1);
    expect(all.reduce((sum, r) => sum + r.knownSubtotalCents, 0)).toBe(136867);
  });
  it("leaves a missing claim incomplete in November and no other month", () => {
    const { profile } = fixture();
    for (const month of months) {
      const r = calculateDatedMonthlyRemuneration({
        month,
        shifts: [],
        workProfile: work,
        history: [profile],
        allowanceEntitlements: [],
        resolver: rules,
      });
      expect(r.annualPayments.positions.length).toBe(month === "2026-11" ? 1 : 0);
      if (month === "2026-11") expect(r.annualPayments.totalCents).toBeNull();
    }
  });
  it("retains incomplete total gross while combining the known base and annual payment", () => {
    const { profile, row } = fixture();
    const r = calculateDatedMonthlyRemuneration({
      month: "2026-11",
      shifts: [],
      workProfile: work,
      history: [profile],
      allowanceEntitlements: [],
      tariffAnnualClaims: [row],
      resolver: rules,
    });
    expect(r.base.totalCents).toBe(144070);
    expect(r.annualPayments.totalCents).toBe(136867);
    expect(r.knownSubtotalCents).toBe(280937);
    expect(r.estimatedGrossCents).toBeNull();
  });
  it.each([0, 140000])("replaces the estimate with actual %s, never adds it", (grossCents) => {
    const { row } = fixture();
    const actual = { ...row, actualPayment: { grossCents, payoutMonth: "2027-01" } };
    expect(
      months.flatMap((m) => calculateTariffAnnualPayments(m, [actual], rules).positions),
    ).toEqual([]);
    const r = calculateTariffAnnualPayments("2027-01", [actual], rules);
    expect(r.totalCents).toBe(grossCents);
    expect(r.positions).toHaveLength(1);
    expect(r.positions[0]!.status).toBe("calculated");
  });
});
