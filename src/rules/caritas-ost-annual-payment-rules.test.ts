import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { lookupCaritasAnnualPaymentRule } from "../engine/caritas-annual-payment-rule";
import { caritasAnnualPaymentFixture } from "../testing/caritas-annual-payment-fixture";
import type { RuleTariffPackage } from "./contracts.generated";
import { validateRulePackage } from "./validation";

const territories = ["OST_TARIF_OST", "OST_TARIF_WEST_BERLIN", "OST_TARIF_WEST_HAMBURG"];
const bands = new Map(
  readFileSync(
    new URL("../../rules/source-extracts/caritas-annual-payment-p-bands.csv", import.meta.url),
    "utf8",
  )
    .trim()
    .split(/\r?\n/u)
    .slice(1)
    .map((line) => {
      const [groupId, , rate] = line.split(",");
      return [groupId, Number(rate)] as const;
    }),
);

function candidate(year: 2025 | 2026): RuleTariffPackage {
  return JSON.parse(
    readFileSync(
      new URL(
        `../../rules/packages/reviewed/avr-caritas-p-ost/${year}-01-draft1.json`,
        import.meta.url,
      ),
      "utf8",
    ),
  ) as RuleTariffPackage;
}

function issueCodes(pkg: RuleTariffPackage): string[] {
  const result = validateRulePackage(pkg);
  return result.ok ? [] : result.issues.map((issue) => issue.code);
}

describe("RK Ost Caritas annual-payment source data", () => {
  it.each([2025, 2026] as const)("checks all 72 annex/territory/P selections in %s", (year) => {
    const pkg = candidate(year);
    expect(validateRulePackage(pkg).ok).toBe(true);
    expect(pkg.engineContractVersion).toBe(14);
    expect(pkg.status).toBe("DRAFT");
    expect(Object.values(pkg.rules.selection!.capabilities)).toEqual(Array(5).fill("UNSUPPORTED"));
    expect(pkg.rules.caritasAnnualPaymentRules).toHaveLength(12);
    expect(bands.size).toBe(12);
    expect(bands.has("p5")).toBe(false);
    for (const annex of ["ANLAGE_31", "ANLAGE_32"]) {
      for (const territory of territories) {
        for (const [groupId, rate] of bands) {
          const result = lookupCaritasAnnualPaymentRule(pkg, year, annex, territory, groupId);
          const westBasis = year === 2025 && territory === "OST_TARIF_OST";
          expect(result).toMatchObject({
            kind: "source-annual-payment-rule",
            packageId: "avr-caritas-p-ost",
            versionId: `${year}-01-draft1`,
            variantId: annex,
            regionId: territory,
            entitlementYear: year,
            rateBasisPoints: rate,
            basisRegionId: westBasis ? "OST_TARIF_WEST_HAMBURG" : territory,
            basisTablePolicy: westBasis ? "RK_OST_WEST_TABLE_2025" : "SELECTED_TERRITORY",
            basisPayTableId: `caritas-ost-p-${year}-common`,
            referenceMonths: [7, 8, 9],
            groupReferenceMonth: 9,
            groupReferenceDay: 1,
            payoutMonth: 11,
            basisPolicy: "ANLAGE_31_32_SECTION_16_2_WITH_EXCEPTIONS",
            eligibilityPolicy:
              annex === "ANLAGE_31" ? "ANLAGE_31_SECTION_16_1_AND_6" : "ANLAGE_32_SECTION_16_1",
            reductionPolicy: "ANLAGE_31_32_SECTION_16_4_WITH_EXCEPTIONS",
            draft: true,
            completeGross: false,
            sourceIds: expect.arrayContaining([
              `caritas-avr-jsz-${year}`,
              `caritas-rk-ost-${year}-p`,
            ]),
          });
          expect(result).not.toHaveProperty("amountCents");
          expect(result).not.toHaveProperty("grossCents");
        }
      }
    }
  });
  it.each([2025, 2026] as const)(
    "records actual normative and corroborating sources in %s",
    (year) => {
      const pkg = candidate(year);
      const expectedSources =
        year === 2025
          ? [
              [
                "caritas-avr-jsz-2025",
                "2025-07-01",
                "a4f8dea02fb84ba4f203a753bd362d82dec8ad8953f3befed99ac65e65ec2637",
              ],
              [
                "caritas-dgs-ost-east-annual-facts-2025",
                "2025-07-01",
                "33c753ebb59d25ca27d5f835792b3befbedb47d3e561fdbb8b7297e1e5e0e845",
              ],
            ]
          : [
              [
                "caritas-avr-jsz-2026",
                "2026-03-19",
                "cb6fc32981eb120d5c05e68d6563725436001409e9bc728bc47d52d08d705aa7",
              ],
              [
                "caritas-bk-2025-03-jsz-ost",
                "2025-10-09",
                "cb16c87710b42662d49e59666cee82c74d406f2da7569b6cfc7b9b9937c596c3",
              ],
              [
                "caritas-dgs-ost-annual-p6-2026",
                "2026-01-01",
                "b1fab89be20d3c0d6109b3447bab8bb9be9b4f47f14314e288803143caf90da5",
              ],
              [
                "caritas-dgs-ost-annual-p12-2026",
                "2026-01-01",
                "35c49650f31b590bbf1fec1c5505c589c3c7aa05f8ae120b0c77c3443824f849",
              ],
            ];
      expect(new Set(pkg.sources.map((source) => source.id)).size).toBe(pkg.sources.length);
      expect(
        pkg.sources.every(
          (source) => !source.url.includes("example.invalid") && source.sha256 !== "0".repeat(64),
        ),
      ).toBe(true);
      for (const [id, documentDate, sha256] of expectedSources) {
        expect(pkg.sources.find((source) => source.id === id)).toMatchObject({
          documentDate,
          sha256,
        });
        expect(
          pkg.rules.caritasAnnualPaymentRules!.every((rule) => rule.sourceIds.includes(id)),
        ).toBe(true);
      }
      expect(pkg.sources.find((source) => source.id === `caritas-avr-jsz-${year}`)?.url).toBe(
        `https://www.lambertus.de/media/wysiwyg/websites/lam_lambertus/${year === 2025 ? "AVR-PDF_Version_2025.pdf" : "AVR_Online-PDF_2026_final.pdf"}`,
      );
    },
  );
  it("keeps the 2025 annex-32 monthly table separate from the sourced annual West basis", () => {
    const pkg = candidate(2025);
    const annex = pkg.rules.selection!.variants.find((variant) => variant.id === "ANLAGE_32")!;
    expect(annex.regions.find((region) => region.id === "OST_TARIF_OST")?.payTableId).toBe(
      "caritas-ost-p-2025-annex32-east",
    );
    expect(
      annex.regions
        .filter((region) => region.id !== "OST_TARIF_OST")
        .map((region) => region.payTableId),
    ).toEqual(Array(2).fill("caritas-ost-p-2025-common"));
    const monthly = pkg.rules.payTables.find(
      (table) => table.id === "caritas-ost-p-2025-annex32-east",
    )!;
    const basis = pkg.rules.payTables.find((table) => table.id === "caritas-ost-p-2025-common")!;
    expect(
      monthly.entries.find((entry) => entry.groupId === "p6" && entry.stepId === "1")?.monthlyCents,
    ).toBe(287685);
    expect(
      basis.entries.find((entry) => entry.groupId === "p6" && entry.stepId === "1")?.monthlyCents,
    ).toBe(289095);
    expect(
      lookupCaritasAnnualPaymentRule(pkg, 2025, "ANLAGE_32", "OST_TARIF_OST", "p6"),
    ).toMatchObject({ basisPayTableId: basis.id });
    // Printed first-year P6 example in the 2025 TG-Ost factsheet uses the West basis.
    expect(Math.round(((289095 + 16296 + 4602 + 10000) * 8600) / 10000)).toBe(275194);
  });
  it.each([2025, 2026] as const)("rejects the opposite table-basis policy in %s", (year) => {
    const pkg = candidate(year);
    const rule = pkg.rules.caritasAnnualPaymentRules!.find(
      (item) => item.variantId === "ANLAGE_32" && item.regionId === "OST_TARIF_OST",
    )!;
    rule.basisRegionId = year === 2025 ? "OST_TARIF_OST" : "OST_TARIF_WEST_HAMBURG";
    rule.basisTablePolicy = year === 2025 ? "SELECTED_TERRITORY" : "RK_OST_WEST_TABLE_2025";
    expect(issueCodes(pkg)).toContain("CARITAS_ANNUAL_BASIS");
    expect(lookupCaritasAnnualPaymentRule(pkg, year, "ANLAGE_32", "OST_TARIF_OST", "p6")).toEqual({
      kind: "unavailable",
      reason: "INVALID_PACKAGE",
    });
  });
  it.each(["caritas-avr-jsz-2026", "caritas-bk-2025-03-jsz-ost"])(
    "requires %s on the actual 2026 candidate",
    (sourceId) => {
      const pkg = candidate(2026);
      const rule = pkg.rules.caritasAnnualPaymentRules![0];
      rule.sourceIds = rule.sourceIds.filter((id) => id !== sourceId) as [string, ...string[]];
      expect(issueCodes(pkg)).toContain("CARITAS_ANNUAL_SOURCE");
    },
  );
  it.each([2025, 2026] as const)(
    "preserves explicit legacy and synthetic fixtures after adding real %s sources",
    (year) => {
      const legacy = caritasAnnualPaymentFixture("ost", year, false);
      expect(validateRulePackage(legacy).ok).toBe(true);
      expect(
        lookupCaritasAnnualPaymentRule(legacy, year, "ANLAGE_32", "OST_TARIF_OST", "p6"),
      ).toEqual({ kind: "unavailable", reason: "MISSING_ANNUAL_PAYMENT_RULE" });
      const synthetic = caritasAnnualPaymentFixture("ost", year);
      expect(validateRulePackage(synthetic).ok).toBe(true);
      expect(
        synthetic.sources.filter((source) => source.id === `caritas-avr-jsz-${year}`),
      ).toHaveLength(1);
      expect(
        synthetic.sources.find((source) => source.id === `caritas-avr-jsz-${year}`)?.url,
      ).toContain("example.invalid/synthetic");
      if (year === 2026)
        expect(
          synthetic.sources.filter((source) => source.id === "caritas-bk-2025-03-jsz-ost"),
        ).toHaveLength(1);
    },
  );
  it.each([2025, 2026] as const)("does not extend %s into another entitlement year", (year) => {
    for (const otherYear of [2025, 2026, 2027].filter((value) => value !== year)) {
      expect(
        lookupCaritasAnnualPaymentRule(
          candidate(year),
          otherYear,
          "ANLAGE_32",
          "OST_TARIF_OST",
          "p6",
        ),
      ).toEqual({ kind: "unavailable", reason: "OUTSIDE_ENTITLEMENT_YEAR" });
    }
  });
});
