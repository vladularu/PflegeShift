import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { lookupCaritasAnnualPaymentRule } from "../engine/caritas-annual-payment-rule";
import type { RuleTariffPackage } from "./contracts.generated";
import { validateRulePackage } from "./validation";

const regions = ["bw", "bayern", "mitte", "nord", "nrw"] as const;
const bands = new Map(
  readFileSync(
    new URL("../../rules/source-extracts/caritas-annual-payment-p-bands.csv", import.meta.url),
    "utf8",
  )
    .trim()
    .split(/\r?\n/u)
    .slice(1)
    .map((line) => {
      const [groupId, referenceEg, basisPoints] = line.split(",");
      return [groupId, { referenceEg, basisPoints: Number(basisPoints) }] as const;
    }),
);

function candidate(region: string, year: 2025 | 2026): RuleTariffPackage {
  const version = year === 2025 ? "2025-07-01" : "2026-02-01";
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

describe("West Caritas annual-payment source data", () => {
  it("has all 12 sourced P groups with P16 mapped to EG12", () => {
    expect(bands.size).toBe(12);
    expect(bands.has("p5")).toBe(false);
    expect(bands.get("p16")).toEqual({ referenceEg: "12", basisPoints: 7600 });
  });
  it.each(regions)("checks all 48 year/annex/P combinations in %s", (region) => {
    for (const year of [2025, 2026] as const) {
      const pkg = candidate(region, year);
      expect(validateRulePackage(pkg)).toMatchObject({ ok: true });
      expect(pkg.engineContractVersion).toBe(14);
      expect(pkg.status).toBe("DRAFT");
      expect(Object.values(pkg.rules.selection!.capabilities)).toEqual(
        Array(5).fill("UNSUPPORTED"),
      );
      expect(pkg.rules.caritasAnnualPaymentRules).toHaveLength(4);
      expect(
        pkg.sources.every(
          (source) => !source.url.includes("example.invalid") && source.sha256 !== "0".repeat(64),
        ),
      ).toBe(true);
      for (const annex of ["ANLAGE_31", "ANLAGE_32"]) {
        for (const [groupId, expected] of bands) {
          const result = lookupCaritasAnnualPaymentRule(
            pkg,
            year,
            annex,
            region.toUpperCase(),
            groupId,
          );
          expect(result).toMatchObject({
            kind: "source-annual-payment-rule",
            entitlementYear: year,
            variantId: annex,
            regionId: region.toUpperCase(),
            basisRegionId: region.toUpperCase(),
            basisTablePolicy: "SELECTED_TERRITORY",
            rateBasisPoints: expected.basisPoints,
            referenceMonths: [7, 8, 9],
            groupReferenceMonth: 9,
            groupReferenceDay: 1,
            payoutMonth: 11,
            eligibilityPolicy:
              annex === "ANLAGE_31" ? "ANLAGE_31_SECTION_16_1_AND_6" : "ANLAGE_32_SECTION_16_1",
            draft: true,
            completeGross: false,
            sourceIds: expect.arrayContaining([
              `caritas-avr-jsz-${year}`,
              `caritas-rk-${region}-2025`,
            ]),
          });
          expect(result).not.toHaveProperty("amountCents");
          expect(result).not.toHaveProperty("grossCents");
        }
      }
    }
  });
  it.each(regions)("records actual norm and dated corroborating sources for %s", (region) => {
    for (const year of [2025, 2026] as const) {
      const pkg = candidate(region, year);
      const norm = pkg.sources.find((source) => source.id === `caritas-avr-jsz-${year}`);
      expect(norm).toMatchObject({
        url: "https://www.lambertus.de/media/wysiwyg/websites/lam_lambertus/AVR_Online-PDF_2026_final.pdf",
        documentDate: "2026-03-19",
        sha256: "cb6fc32981eb120d5c05e68d6563725436001409e9bc728bc47d52d08d705aa7",
      });
      const facts =
        year === 2025
          ? [
              [
                "caritas-dgs-west-annual-facts-2025",
                "2025-07-01",
                "01a2a4e6681bb94e6fd85042f012d9582a6805b12ccfd1283a82ce1371a6045a",
              ],
            ]
          : [
              [
                "caritas-dgs-west-annual-p6-2026",
                "2026-02-01",
                "1d5d55787e2a94af24b48371d744669411407395b5ebafa89782b58dbbe0b1ca",
              ],
              [
                "caritas-dgs-west-annual-p12-2026",
                "2026-02-01",
                "936b9abdbed1d15c645dde2934eaf3b75bbbcf67eaadec8508f0aa13255c6428",
              ],
            ];
      for (const [id, documentDate, sha256] of facts) {
        expect(pkg.sources.find((source) => source.id === id)).toMatchObject({
          documentDate,
          sha256,
        });
        expect(
          pkg.rules.caritasAnnualPaymentRules!.every((rule) => rule.sourceIds.includes(id)),
        ).toBe(true);
      }
    }
  });
  it("uses 76% for P11 despite the contradictory 2025 factsheet caption", () => {
    expect(Math.round((535395 * 7600) / 10000)).toBe(406900);
    const pkg = candidate("bw", 2025);
    const rule = pkg.rules.caritasAnnualPaymentRules!.find(
      (item) => item.variantId === "ANLAGE_31" && item.payGroups.includes("p11"),
    )!;
    expect(rule.rateBasisPoints).toBe(7600);
    rule.rateBasisPoints = 8600;
    const result = validateRulePackage(pkg);
    expect(result.ok).toBe(false);
    if (!result.ok)
      expect(result.issues.map((issue) => issue.code)).toContain("CARITAS_ANNUAL_RATE");
  });
  it("keeps the 2025 January tail separate from entitlement year 2026", () => {
    expect(
      lookupCaritasAnnualPaymentRule(candidate("bw", 2025), 2026, "ANLAGE_31", "BW", "p7"),
    ).toEqual({ kind: "unavailable", reason: "OUTSIDE_ENTITLEMENT_YEAR" });
  });
});
