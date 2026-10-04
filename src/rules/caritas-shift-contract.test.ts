import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { RuleTariffPackage } from "./contracts.generated";
import { validateRulePackage } from "./validation";

function candidate(): RuleTariffPackage {
  return JSON.parse(
    readFileSync(
      new URL(
        "../../rules/packages/reviewed/avr-caritas-p-bw/2026-02-01-draft1.json",
        import.meta.url,
      ),
      "utf8",
    ),
  ) as RuleTariffPackage;
}

function withShiftRates(): RuleTariffPackage {
  const pkg = candidate();
  const rates = [31, 32].map((annex) => ({
    id: `caritas-bw-shift-${annex}-2026`,
    variantId: `ANLAGE_${annex}`,
    regionId: "BW",
    validFrom: "2026-02-01",
    validTo: "2026-12-31",
    alternatingMonthlyCents: 25000,
    alternatingHourlyCents: annex === 31 ? 149 : 147,
    shiftMonthlyCents: 10000,
    shiftHourlyCents: 59,
    sourceIds: ["caritas-bk-2025-02-corrected", "caritas-rk-bw-2025"] as [string, string],
  }));
  const [first, ...rest] = rates;
  if (!first) throw new Error("Expected sourced shift-rate fixtures");
  pkg.rules.caritasShiftAllowanceRates = [first, ...rest];
  return pkg;
}

function codes(pkg: RuleTariffPackage): string[] {
  const result = validateRulePackage(pkg);
  return result.ok ? [] : result.issues.map((issue) => issue.code);
}

describe("Caritas § 6 shift-rate contract without individual entitlement", () => {
  it("accepts sourced Anlage 31 and 32 rates while calculation remains unsupported", () => {
    const pkg = withShiftRates();
    expect(validateRulePackage(pkg)).toEqual({ ok: true, value: pkg });
    expect(pkg.rules.selection?.capabilities.allowances).toBe("UNSUPPORTED");
    expect(pkg.rules.caritasShiftAllowanceRates?.[0].alternatingHourlyCents).toBe(149);
    expect(pkg.rules.caritasShiftAllowanceRates?.[1].alternatingHourlyCents).toBe(147);
  });

  it("rejects a missing annex, a date gap and overlapping periods", () => {
    const missing = withShiftRates();
    missing.rules.caritasShiftAllowanceRates!.pop();
    expect(codes(missing)).toContain("CARITAS_SHIFT_COVERAGE");

    const gap = withShiftRates();
    gap.rules.caritasShiftAllowanceRates![0].validFrom = "2026-02-02";
    expect(codes(gap)).toContain("CARITAS_SHIFT_COVERAGE");

    const overlap = withShiftRates();
    overlap.rules.caritasShiftAllowanceRates!.push({
      ...overlap.rules.caritasShiftAllowanceRates![0],
      id: "caritas-bw-shift-31-overlap",
      validFrom: "2026-03-01",
    });
    expect(codes(overlap)).toContain("CARITAS_SHIFT_COVERAGE");
  });

  it("rejects a foreign region, missing adoption, duplicate id and nonpositive rate", () => {
    const territory = withShiftRates();
    territory.rules.caritasShiftAllowanceRates![0].regionId = "OST_TARIF_OST";
    expect(codes(territory)).toContain("CARITAS_SHIFT_SELECTION");

    const source = withShiftRates();
    source.rules.caritasShiftAllowanceRates![0].sourceIds = ["caritas-bk-2025-02-corrected"];
    expect(codes(source)).toContain("CARITAS_SHIFT_SOURCE");

    const duplicate = withShiftRates();
    duplicate.rules.caritasShiftAllowanceRates![1].id =
      duplicate.rules.caritasShiftAllowanceRates![0].id;
    expect(codes(duplicate)).toContain("CARITAS_SHIFT_ID");

    const zero = withShiftRates();
    zero.rules.caritasShiftAllowanceRates![0].shiftHourlyCents = 0;
    expect(validateRulePackage(zero).ok).toBe(false);
  });

  it("rejects shift-rate data outside contract 14", () => {
    const pkg = withShiftRates();
    pkg.engineContractVersion = 12;
    expect(codes(pkg)).toContain("CARITAS_SHIFT_CONTRACT");
  });
});
