import { describe, expect, it } from "vitest";
import { caritasAnnualPaymentFixture } from "../testing/caritas-annual-payment-fixture";
import type { RuleTariffPackage } from "./contracts.generated";
import { validateRulePackage } from "./validation";

function codes(pkg: RuleTariffPackage): string[] {
  const result = validateRulePackage(pkg);
  return result.ok ? [] : result.issues.map((issue) => issue.code);
}

describe("Caritas DRAFT annual-payment contract", () => {
  it.each(["bw", "bayern", "mitte", "nord", "nrw", "ost"])(
    "accepts complete synthetic annual coverage for %s in 2025 and 2026",
    (region) => {
      for (const year of [2025, 2026] as const) {
        const pkg = caritasAnnualPaymentFixture(region, year);
        expect(codes(pkg)).toEqual([]);
        expect(pkg.status).toBe("DRAFT");
        expect(Object.values(pkg.rules.selection!.capabilities)).toEqual(
          Array(5).fill("UNSUPPORTED"),
        );
      }
    },
  );
  it("keeps older candidates without annual rules valid", () => {
    expect(codes(caritasAnnualPaymentFixture("bw", 2026, false))).toEqual([]);
  });
  it("rejects missing and overlapping P-group coverage", () => {
    const missing = caritasAnnualPaymentFixture();
    missing.rules.caritasAnnualPaymentRules!.pop();
    expect(codes(missing)).toContain("CARITAS_ANNUAL_COVERAGE");
    const overlap = caritasAnnualPaymentFixture();
    overlap.rules.caritasAnnualPaymentRules!.push({
      ...overlap.rules.caritasAnnualPaymentRules![0],
      id: "duplicate-coverage",
    });
    expect(codes(overlap)).toContain("CARITAS_ANNUAL_COVERAGE");
  });
  it("rejects foreign annexes, territories and duplicate IDs", () => {
    const annex = caritasAnnualPaymentFixture();
    annex.rules.caritasAnnualPaymentRules![0].variantId = "ANLAGE_33";
    expect(codes(annex)).toContain("CARITAS_ANNUAL_SELECTION");
    const territory = caritasAnnualPaymentFixture();
    territory.rules.caritasAnnualPaymentRules![0].regionId = "NRW";
    expect(codes(territory)).toContain("CARITAS_ANNUAL_SELECTION");
    const duplicate = caritasAnnualPaymentFixture();
    duplicate.rules.caritasAnnualPaymentRules![1].id =
      duplicate.rules.caritasAnnualPaymentRules![0].id;
    expect(codes(duplicate)).toContain("CARITAS_ANNUAL_ID");
  });
  it("rejects incorrect P16 and low-band rates", () => {
    const highBand = caritasAnnualPaymentFixture();
    highBand.rules.caritasAnnualPaymentRules![1].rateBasisPoints = 8600;
    expect(codes(highBand)).toContain("CARITAS_ANNUAL_RATE");
    const lowBand = caritasAnnualPaymentFixture();
    lowBand.rules.caritasAnnualPaymentRules![0].rateBasisPoints = 7600;
    expect(codes(lowBand)).toContain("CARITAS_ANNUAL_RATE");
    const eg13 = caritasAnnualPaymentFixture();
    Reflect.set(eg13.rules.caritasAnnualPaymentRules![1], "rateBasisPoints", 5600);
    expect(validateRulePackage(eg13).ok).toBe(false);
  });
  it("rejects unknown sources, missing annual norms and missing regional evidence", () => {
    for (const removed of ["caritas-avr-jsz-2026", "caritas-rk-bw-2025"]) {
      const pkg = caritasAnnualPaymentFixture();
      const rule = pkg.rules.caritasAnnualPaymentRules![0];
      rule.sourceIds = rule.sourceIds.filter((id) => id !== removed) as [string, ...string[]];
      expect(codes(pkg)).toContain("CARITAS_ANNUAL_SOURCE");
    }
    const unknown = caritasAnnualPaymentFixture();
    unknown.rules.caritasAnnualPaymentRules![0].sourceIds.push("unknown-source");
    expect(codes(unknown)).toContain("CARITAS_ANNUAL_SOURCE");
    const absent = caritasAnnualPaymentFixture();
    absent.sources.splice(
      absent.sources.findIndex((source) => source.id === "caritas-avr-jsz-2026"),
      1,
    );
    expect(codes(absent)).toContain("CARITAS_ANNUAL_SOURCE");
  });
  it("requires the 2026 Ost repeal source", () => {
    const pkg = caritasAnnualPaymentFixture("ost", 2026);
    const rule = pkg.rules.caritasAnnualPaymentRules![0];
    rule.sourceIds = rule.sourceIds.filter((id) => id !== "caritas-bk-2025-03-jsz-ost") as [
      string,
      ...string[],
    ];
    expect(codes(pkg)).toContain("CARITAS_ANNUAL_SOURCE");
  });
  it("rejects wrong Ost basis before and after the 2026 change", () => {
    for (const year of [2025, 2026] as const) {
      const pkg = caritasAnnualPaymentFixture("ost", year);
      const rule = pkg.rules.caritasAnnualPaymentRules![0];
      rule.basisRegionId = year === 2025 ? "OST_TARIF_OST" : "OST_TARIF_WEST_HAMBURG";
      rule.basisTablePolicy = year === 2025 ? "SELECTED_TERRITORY" : "RK_OST_WEST_TABLE_2025";
      expect(codes(pkg)).toContain("CARITAS_ANNUAL_BASIS");
    }
    const foreign = caritasAnnualPaymentFixture();
    foreign.rules.caritasAnnualPaymentRules![0].basisRegionId = "NRW";
    expect(codes(foreign)).toContain("CARITAS_ANNUAL_BASIS");
  });
  it("keeps the annex-specific exit policy distinct", () => {
    const pkg = caritasAnnualPaymentFixture();
    pkg.rules.caritasAnnualPaymentRules![0].eligibilityPolicy = "ANLAGE_32_SECTION_16_1";
    expect(codes(pkg)).toContain("CARITAS_ANNUAL_ELIGIBILITY");
    const other = caritasAnnualPaymentFixture();
    other.rules.caritasAnnualPaymentRules![2].eligibilityPolicy = "ANLAGE_31_SECTION_16_1_AND_6";
    expect(codes(other)).toContain("CARITAS_ANNUAL_ELIGIBILITY");
  });
  it("does not extend a 2025 package into entitlement year 2026", () => {
    const pkg = caritasAnnualPaymentFixture("bw", 2025);
    pkg.rules.caritasAnnualPaymentRules![0].entitlementYear = 2026;
    expect(codes(pkg)).toContain("CARITAS_ANNUAL_YEAR");
  });
  it.each([
    ["entitlementYear", 2027],
    ["payGroups", ["p5"]],
    ["payGroups", ["p4", "p4"]],
    ["referenceMonths", [6, 7, 8]],
    ["referenceMonths", [9, 8, 7]],
    ["groupReferenceDay", 2],
    ["payoutMonth", 12],
    ["basisPolicy", "TABLE_ONLY"],
    ["reductionPolicy", "NO_REDUCTION"],
    ["completeGross", true],
  ])("rejects malformed schema metadata %s", (key, value) => {
    const pkg = caritasAnnualPaymentFixture();
    Reflect.set(pkg.rules.caritasAnnualPaymentRules![0], key as string, value);
    expect(validateRulePackage(pkg).ok).toBe(false);
  });
  it("rejects non-DRAFT, another contract and supported capabilities", () => {
    const active = caritasAnnualPaymentFixture();
    Reflect.set(active, "status", "REVIEWED");
    expect(codes(active)).toContain("CARITAS_ANNUAL_CONTRACT");
    const contract = caritasAnnualPaymentFixture();
    contract.engineContractVersion = 11;
    expect(codes(contract)).toContain("CARITAS_ANNUAL_CONTRACT");
    const supported = caritasAnnualPaymentFixture();
    supported.rules.selection!.capabilities.annualPayment = "SUPPORTED";
    expect(codes(supported)).toContain("CARITAS_ANNUAL_CONTRACT");
  });
});
