import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { caritasTableIssues } from "./caritas-table-validation";
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

function withRates(): RuleTariffPackage {
  const pkg = candidate();
  if (!pkg.sources.some((source) => source.id === "caritas-dg-2024-care-allowances"))
    pkg.sources.push({
      id: "caritas-dg-2024-care-allowances",
      title: "Caritas-Dienstgeber, AVR erklärt: Zulagen als Bestandteile der Entlohnung",
      url: "https://caritas-dienstgeber.de/detail-news/avr-erklaert-teil-5-zulagen-als-bestandteile-der-entlohnung/",
      documentDate: "2024-12-17",
      section: "III und V: § 12 Abs. 3, 25 Euro außer Baden-Württemberg 35 Euro",
      sha256: "6740550d20915b03c4eef4f26730dd9ec6a1ad9372f40e5abbc17527455030f4",
    });
  const rates = [31, 32].flatMap((annex) => [
    {
      id: `caritas-bw-care-3-${annex}-2026`,
      provisionId: "SECTION_12_3" as const,
      variantId: `ANLAGE_${annex}`,
      regionId: "BW",
      validFrom: "2026-02-01",
      validTo: "2026-12-31",
      monthlyCents: 3500,
      sourceIds: ["caritas-dg-2024-care-allowances"] as [string],
    },
    {
      id: `caritas-bw-care-4-${annex}-2026`,
      provisionId: "SECTION_12_4" as const,
      variantId: `ANLAGE_${annex}`,
      regionId: "BW",
      validFrom: "2026-02-01",
      validTo: "2026-12-31",
      monthlyCents: 14182,
      sourceIds: ["caritas-bk-2025-02-corrected", "caritas-rk-bw-2025"] as [string, string],
    },
  ]);
  const [first, ...rest] = rates;
  if (!first) throw new Error("Expected sourced care-allowance fixtures");
  pkg.rules.caritasCareAllowanceRates = [first, ...rest];
  return pkg;
}

function codes(pkg: RuleTariffPackage): string[] {
  const result = validateRulePackage(pkg);
  return result.ok ? [] : result.issues.map((issue) => issue.code);
}

describe("Caritas care allowance rate contract, not an entitlement", () => {
  it("accepts both separately sourced provisions in both care annexes without activation", () => {
    const pkg = withRates();
    expect(validateRulePackage(pkg)).toEqual({ ok: true, value: pkg });
    expect(pkg.rules.selection?.capabilities.allowances).toBe("UNSUPPORTED");
  });

  it("rejects an incomplete annex, date gap and overlapping period", () => {
    const missing = withRates();
    missing.rules.caritasCareAllowanceRates!.pop();
    expect(codes(missing)).toContain("CARITAS_RATE_COVERAGE");

    const missingFixed = withRates();
    missingFixed.rules.caritasCareAllowanceRates!.splice(0, 1);
    expect(codes(missingFixed)).toContain("CARITAS_RATE_COVERAGE");

    const gap = withRates();
    gap.rules.caritasCareAllowanceRates![0].validFrom = "2026-02-02";
    expect(codes(gap)).toContain("CARITAS_RATE_COVERAGE");

    const overlap = withRates();
    overlap.rules.caritasCareAllowanceRates!.push({
      ...overlap.rules.caritasCareAllowanceRates![0],
      id: "caritas-bw-care-3-31-overlap",
      validFrom: "2026-03-01",
    });
    expect(codes(overlap)).toContain("CARITAS_RATE_COVERAGE");
  });

  it("rejects a foreign territory, missing regional adoption and duplicate id", () => {
    const territory = withRates();
    territory.rules.caritasCareAllowanceRates![0].regionId = "OST_TARIF_OST";
    expect(codes(territory)).toContain("CARITAS_RATE_SELECTION");

    const source = withRates();
    source.rules.caritasCareAllowanceRates![0].sourceIds = ["caritas-rk-bw-2025"];
    expect(codes(source)).toContain("CARITAS_RATE_SOURCE");

    const secondSource = withRates();
    secondSource.rules.caritasCareAllowanceRates![1].sourceIds = [
      "caritas-dg-2024-care-allowances",
    ];
    expect(codes(secondSource)).toContain("CARITAS_RATE_SOURCE");

    const duplicate = withRates();
    duplicate.rules.caritasCareAllowanceRates![1].id =
      duplicate.rules.caritasCareAllowanceRates![0].id;
    expect(codes(duplicate)).toContain("CARITAS_RATE_ID");
  });

  it("rejects the rate field outside Caritas contract 14", () => {
    const pkg = withRates();
    Reflect.set(pkg, "engineContractVersion", 12); // Deliberately invalid schema input.
    expect(codes(pkg)).toContain("SCHEMA_ENUM");
    expect(caritasTableIssues(pkg).map((issue) => issue.code)).toContain("CARITAS_RATE_CONTRACT");
  });
});
