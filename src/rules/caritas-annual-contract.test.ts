import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { RuleTariffPackage } from "./contracts.generated";
import { validateRulePackage } from "./validation";

const commissions = ["bw", "bayern", "mitte", "nord", "nrw", "ost"] as const;

function load(commission: (typeof commissions)[number], year: 2025 | 2026): RuleTariffPackage {
  const version = commission === "ost" ? `${year}-01` : year === 2025 ? "2025-07-01" : "2026-02-01";
  return JSON.parse(
    readFileSync(
      new URL(
        `../../rules/packages/reviewed/avr-caritas-p-${commission}/${version}-draft1.json`,
        import.meta.url,
      ),
      "utf8",
    ),
  ) as RuleTariffPackage;
}

function codes(pkg: RuleTariffPackage): string[] {
  const result = validateRulePackage(pkg);
  return result.ok ? [] : result.issues.map((issue) => issue.code);
}

describe("Caritas annual-payment draft policy", () => {
  it("keeps every regional/year package valid but non-executable", () => {
    for (const region of commissions)
      for (const year of [2025, 2026] as const) {
        const pkg = load(region, year);
        expect(validateRulePackage(pkg)).toEqual({ ok: true, value: pkg });
        expect(pkg.rules.selection?.capabilities.annualPayment).toBe("UNSUPPORTED");
        expect(pkg.rules.caritasAnnualPaymentPolicy?.referenceMonths).toEqual([7, 8, 9]);
      }
  });

  it("rejects missing or duplicated P-group bands", () => {
    const missing = load("bw", 2026);
    missing.rules.caritasAnnualPaymentPolicy!.rateBands[0].groupIds = ["p4", "p6", "p7"];
    expect(codes(missing)).toContain("CARITAS_ANNUAL_RATE");

    const duplicate = load("bw", 2026);
    duplicate.rules.caritasAnnualPaymentPolicy!.rateBands[1].rateBasisPoints = 8600;
    expect(codes(duplicate)).toContain("CARITAS_ANNUAL_RATE");
  });

  it("pins the 2025 east exception and its 2026 repeal", () => {
    const old = load("ost", 2025);
    old.rules.caritasAnnualPaymentPolicy!.eastTariff2025UsesWestTable = false;
    expect(codes(old)).toContain("CARITAS_ANNUAL_EAST_BASIS");

    const current = load("ost", 2026);
    current.rules.caritasAnnualPaymentPolicy!.eastTariff2025UsesWestTable = true;
    expect(codes(current)).toContain("CARITAS_ANNUAL_EAST_BASIS");
    current.rules.caritasAnnualPaymentPolicy!.eastTariff2025UsesWestTable = false;
    current.rules.caritasAnnualPaymentPolicy!.sourceIds = ["caritas-avr-text-2026-03"];
    expect(codes(current)).toContain("CARITAS_ANNUAL_SOURCE");
  });

  it("rejects a claim year outside validity or an unknown source", () => {
    const dates = load("bw", 2025);
    dates.rules.caritasAnnualPaymentPolicy!.validTo = "2026-01-31";
    expect(codes(dates)).toContain("CARITAS_ANNUAL_RANGE");

    const source = load("bw", 2026);
    source.rules.caritasAnnualPaymentPolicy!.sourceIds = ["not-in-package"];
    expect(codes(source)).toContain("UNKNOWN_SOURCE_ID");
  });
});
