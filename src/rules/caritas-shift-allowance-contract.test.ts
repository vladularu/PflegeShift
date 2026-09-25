import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { caritasTableIssues } from "./caritas-table-validation";
import type { RuleTariffPackage } from "./contracts.generated";
import { validateRulePackage } from "./validation";

function candidate(region = "bw", version = "2026-02-01"): RuleTariffPackage {
  return JSON.parse(
    readFileSync(
      new URL(
        `../../rules/packages/reviewed/avr-caritas-p-${region}/${version}-draft1.json`,
        import.meta.url,
      ),
      "utf8",
    ),
  ) as RuleTariffPackage;
}

function withRates(): RuleTariffPackage {
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
  if (!first) throw new Error("Expected two shift-rate fixtures");
  pkg.rules.caritasShiftAllowanceRates = [first, ...rest];
  return pkg;
}

function codes(pkg: RuleTariffPackage): string[] {
  const result = validateRulePackage(pkg);
  return result.ok ? [] : result.issues.map((issue) => issue.code);
}

describe("Caritas section 6 shift allowance rate contract", () => {
  it("accepts both sourced care annexes without activating a calculation", () => {
    const pkg = withRates();
    expect(validateRulePackage(pkg)).toEqual({ ok: true, value: pkg });
    expect(pkg.status).toBe("DRAFT");
    expect(pkg.rules.selection?.capabilities.allowances).toBe("UNSUPPORTED");
    expect(
      pkg.rules.caritasShiftAllowanceRates?.map((rate) => rate.alternatingHourlyCents),
    ).toEqual([149, 147]);
  });

  it("rejects a missing annex, a date gap and overlapping periods", () => {
    const missing = withRates();
    missing.rules.caritasShiftAllowanceRates!.pop();
    expect(codes(missing)).toContain("CARITAS_SHIFT_COVERAGE");

    const gap = withRates();
    gap.rules.caritasShiftAllowanceRates![0].validFrom = "2026-02-02";
    expect(codes(gap)).toContain("CARITAS_SHIFT_COVERAGE");

    const overlap = withRates();
    overlap.rules.caritasShiftAllowanceRates!.push({
      ...overlap.rules.caritasShiftAllowanceRates![0],
      id: "caritas-bw-shift-31-overlap",
      validFrom: "2026-03-01",
    });
    expect(codes(overlap)).toContain("CARITAS_SHIFT_COVERAGE");
  });

  it("rejects foreign territories, missing regional adoption and duplicate IDs", () => {
    const territory = withRates();
    territory.rules.caritasShiftAllowanceRates![0].regionId = "OST_TARIF_OST";
    expect(codes(territory)).toContain("CARITAS_SHIFT_SELECTION");

    const source = withRates();
    source.rules.caritasShiftAllowanceRates![0].sourceIds = ["caritas-bk-2025-02-corrected"];
    expect(codes(source)).toContain("CARITAS_SHIFT_SOURCE");

    const unknown = withRates();
    unknown.rules.caritasShiftAllowanceRates![0].sourceIds.push("unknown-source");
    expect(codes(unknown)).toContain("UNKNOWN_SOURCE_ID");

    const duplicate = withRates();
    duplicate.rules.caritasShiftAllowanceRates![1].id =
      duplicate.rules.caritasShiftAllowanceRates![0].id;
    expect(codes(duplicate)).toContain("CARITAS_SHIFT_ID");
  });

  it("rejects nonpositive values and rates before the sourced July 2025 start", () => {
    const zero = withRates();
    zero.rules.caritasShiftAllowanceRates![0].shiftHourlyCents = 0;
    expect(validateRulePackage(zero).ok).toBe(false);

    const early = candidate("ost", "2025-01");
    early.rules.caritasShiftAllowanceRates = [
      {
        id: "caritas-ost-shift-31-2025-early",
        variantId: "ANLAGE_31",
        regionId: "OST_TARIF_OST",
        validFrom: "2025-01-01",
        validTo: "2025-06-30",
        alternatingMonthlyCents: 25000,
        alternatingHourlyCents: 149,
        shiftMonthlyCents: 10000,
        shiftHourlyCents: 59,
        sourceIds: ["caritas-bk-2025-02-corrected", "caritas-rk-ost-2025-allowances"],
      },
    ];
    expect(codes(early)).toContain("CARITAS_SHIFT_RANGE");
  });

  it("keeps the rate field within Caritas contract 14", () => {
    const pkg = withRates();
    Reflect.set(pkg, "engineContractVersion", 12);
    expect(codes(pkg)).toContain("SCHEMA_ENUM");
    expect(caritasTableIssues(pkg).map((issue) => issue.code)).toContain("CARITAS_SHIFT_CONTRACT");
  });
});
