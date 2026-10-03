import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { caritasTableIssues } from "./caritas-table-validation";
import type { RuleTariffPackage } from "./contracts.generated";
import { validateRulePackage } from "./validation";

const annualSources = {
  "2025": {
    id: "caritas-dcv-premiums-2025",
    title: "DCV Arbeits- und Tarifrecht, AVR-Zeitzuschlagstabellen 2025",
    url: "https://www.lambertus.de/media/wysiwyg/websites/lam_lambertus/Zeitzuschlagstabellen_2025_AVR.pdf",
    documentDate: "2025-09-03",
    section: "Seiten 8-10, Anlagen 31 und 32, § 6 Abs. 1",
    sha256: "43b73882a5f9e06f7d48fe6034febb38f6a3a9e69c41c6098669646b3950df80",
  },
  "2026": {
    id: "caritas-dcv-premiums-2026",
    title: "DCV Arbeits- und Tarifrecht, AVR-Zeitzuschlagstabellen 2026",
    url: "https://www.lambertus.de/media/wysiwyg/websites/lam_lambertus/Zeitzuschlagstabellen2026_AVR_und_bundesweite_Feiertage_31.10.2025_.pdf",
    documentDate: "2025-10-31",
    section: "Seiten 8-10, Anlagen 31 und 32, § 6 Abs. 1",
    sha256: "0e0869710b087a72ee3452d2caf9d65e1234f16e50b8d93a6c59989e3e12ade4",
  },
} as const;

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

function withRates(region = "bw", version = "2026-02-01"): RuleTariffPackage {
  const pkg = candidate(region, version);
  const periods =
    pkg.validFrom === "2025-07-01"
      ? ([
          ["2025-07-01", "2025-12-31", "2025"],
          ["2026-01-01", "2026-01-31", "2026"],
        ] as const)
      : ([[pkg.validFrom, pkg.validTo!, pkg.validFrom.slice(0, 4)]] as const);
  for (const year of new Set(periods.map((period) => period[2]))) {
    const source = annualSources[year as "2025" | "2026"];
    if (!pkg.sources.some((item) => item.id === source.id)) pkg.sources.push(source);
  }
  const rates = pkg.rules.selection!.variants.flatMap((variant) =>
    variant.regions.flatMap((territory) =>
      periods.map(([validFrom, validTo, year]) => ({
        id: `premium-${variant.id.toLowerCase().replaceAll("_", "-")}-${territory.id.toLowerCase().replaceAll("_", "-")}-${year}`,
        variantId: variant.id,
        regionId: territory.id,
        validFrom,
        validTo,
        referenceStepId: "3" as const,
        nightBasisPoints: 2000,
        sundayBasisPoints: 2500,
        holidayWithTimeOffBasisPoints: 3500,
        holidayWithoutTimeOffBasisPoints: 13500,
        preHolidayBasisPoints: 3500,
        saturdayBasisPoints: 2000,
        sourceIds: [`caritas-dcv-premiums-${year}`] as [string],
      })),
    ),
  );
  const [first, ...rest] = rates;
  if (!first) throw new Error("Expected premium-rate fixtures");
  pkg.rules.caritasTimePremiumRates = [first, ...rest];
  return pkg;
}

function codes(pkg: RuleTariffPackage): string[] {
  const result = validateRulePackage(pkg);
  return result.ok ? [] : result.issues.map((issue) => issue.code);
}

describe("Caritas section 6 time-premium rate contract", () => {
  it("accepts sourced 2026 rates for both annexes without activating pay", () => {
    const pkg = withRates();
    expect(validateRulePackage(pkg)).toEqual({ ok: true, value: pkg });
    expect(pkg.status).toBe("DRAFT");
    expect(pkg.rules.selection?.capabilities.timePremiums).toBe("UNSUPPORTED");
    expect(pkg.rules.premiumRules).toEqual([]);
    expect(pkg.rules.caritasTimePremiumRates?.map((rate) => rate.referenceStepId)).toEqual([
      "3",
      "3",
    ]);
  });

  it("requires a calendar-year split and covers all Ost territories", () => {
    expect(validateRulePackage(withRates("bw", "2025-07-01")).ok).toBe(true);
    expect(validateRulePackage(withRates("ost", "2025-01")).ok).toBe(true);
    const crossYear = withRates("bw", "2025-07-01");
    crossYear.rules.caritasTimePremiumRates![0].validTo = "2026-01-31";
    expect(codes(crossYear)).toContain("CARITAS_PREMIUM_RANGE");
  });

  it("rejects missing annex coverage, date gaps and overlaps", () => {
    const missing = withRates();
    missing.rules.caritasTimePremiumRates!.pop();
    expect(codes(missing)).toContain("CARITAS_PREMIUM_COVERAGE");

    const gap = withRates();
    gap.rules.caritasTimePremiumRates![0].validFrom = "2026-02-02";
    expect(codes(gap)).toContain("CARITAS_PREMIUM_COVERAGE");

    const overlap = withRates();
    overlap.rules.caritasTimePremiumRates!.push({
      ...overlap.rules.caritasTimePremiumRates![0],
      id: "another-premium-rate",
    });
    expect(codes(overlap)).toContain("CARITAS_PREMIUM_COVERAGE");
  });

  it("rejects foreign territories, duplicates and missing source references", () => {
    const foreign = withRates();
    foreign.rules.caritasTimePremiumRates![0].regionId = "OST_TARIF_OST";
    expect(codes(foreign)).toContain("CARITAS_PREMIUM_SELECTION");

    const duplicate = withRates();
    duplicate.rules.caritasTimePremiumRates![1].id = duplicate.rules.caritasTimePremiumRates![0].id;
    expect(codes(duplicate)).toContain("CARITAS_PREMIUM_ID");

    const source = withRates();
    source.rules.caritasTimePremiumRates![0].sourceIds = ["caritas-bk-2025-02-corrected"];
    expect(codes(source)).toContain("CARITAS_PREMIUM_SOURCE");

    const unknown = withRates();
    unknown.rules.caritasTimePremiumRates![0].sourceIds.push("unknown-source");
    expect(codes(unknown)).toContain("UNKNOWN_SOURCE_ID");
  });

  it("rejects a wrong reference step or lower rate and requires a source for increases", () => {
    const step = withRates();
    Reflect.set(step.rules.caritasTimePremiumRates![0], "referenceStepId", "2");
    expect(codes(step)).toContain("SCHEMA_CONST");

    const low = withRates();
    low.rules.caritasTimePremiumRates![0].nightBasisPoints = 1999;
    expect(codes(low)).toContain("SCHEMA_MINIMUM");

    const high = withRates();
    high.rules.caritasTimePremiumRates![0].nightBasisPoints = 2500;
    expect(codes(high)).toContain("CARITAS_PREMIUM_SOURCE");
  });

  it("keeps the premium field inside Caritas contract 14", () => {
    const pkg = withRates();
    Reflect.set(pkg, "engineContractVersion", 12);
    expect(codes(pkg)).toContain("TVL_KR_IDENTITY");
    expect(caritasTableIssues(pkg).map((issue) => issue.code)).toContain(
      "CARITAS_PREMIUM_CONTRACT",
    );
  });
});
