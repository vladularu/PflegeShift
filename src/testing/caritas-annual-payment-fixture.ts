import { readFileSync } from "node:fs";
import type { RuleCaritasAnnualPaymentRule, RuleTariffPackage } from "../rules/contracts.generated";

/** Test-only annual metadata. example.invalid and zero hashes are not normative evidence. */
export function caritasAnnualPaymentFixture(
  region = "bw",
  year: 2025 | 2026 = 2026,
  withAnnualRules = true,
): RuleTariffPackage {
  const version = region === "ost" ? `${year}-01` : year === 2025 ? "2025-07-01" : "2026-02-01";
  const pkg = JSON.parse(
    readFileSync(
      new URL(
        `../../rules/packages/reviewed/avr-caritas-p-${region}/${version}-draft1.json`,
        import.meta.url,
      ),
      "utf8",
    ),
  ) as RuleTariffPackage;
  delete pkg.rules.caritasAnnualPaymentRules;
  if (!withAnnualRules) return pkg;
  const normId = `caritas-avr-jsz-${year}`;
  const repealId = "caritas-bk-2025-03-jsz-ost";
  for (const id of region === "ost" && year === 2026 ? [normId, repealId] : [normId]) {
    const existingIndex = pkg.sources.findIndex((source) => source.id === id);
    if (existingIndex >= 0) pkg.sources.splice(existingIndex, 1);
    pkg.sources.push({
      id,
      title: "SYNTHETIC TEST FIXTURE - no normative evidence",
      url: `https://example.invalid/synthetic/${id}.pdf`,
      documentDate: `${year}-01-01`,
      section: "Synthetic annual-payment contract fixture only",
      sha256: "0".repeat(64),
    });
  }
  const rules: RuleCaritasAnnualPaymentRule[] = pkg.rules.selection!.variants.flatMap((variant) =>
    variant.regions.flatMap((territory) =>
      [
        { payGroups: ["p4", "p6", "p7", "p8"] as const, rateBasisPoints: 8600 as const },
        {
          payGroups: ["p9", "p10", "p11", "p12", "p13", "p14", "p15", "p16"] as const,
          rateBasisPoints: 7600 as const,
        },
      ].map((band, index) => ({
        id: `jsz-${variant.id.toLowerCase().replaceAll("_", "-")}-${territory.id.toLowerCase().replaceAll("_", "-")}-${year}-${index}`,
        variantId: variant.id,
        regionId: territory.id,
        entitlementYear: year,
        payGroups: [...band.payGroups],
        rateBasisPoints: band.rateBasisPoints,
        referenceMonths: [7, 8, 9] as [7, 8, 9],
        groupReferenceMonth: 9 as const,
        groupReferenceDay: 1 as const,
        payoutMonth: 11 as const,
        basisPolicy: "ANLAGE_31_32_SECTION_16_2_WITH_EXCEPTIONS" as const,
        eligibilityPolicy:
          variant.id === "ANLAGE_31"
            ? ("ANLAGE_31_SECTION_16_1_AND_6" as const)
            : ("ANLAGE_32_SECTION_16_1" as const),
        reductionPolicy: "ANLAGE_31_32_SECTION_16_4_WITH_EXCEPTIONS" as const,
        basisRegionId:
          territory.id === "OST_TARIF_OST" && year === 2025
            ? "OST_TARIF_WEST_HAMBURG"
            : territory.id,
        basisTablePolicy:
          territory.id === "OST_TARIF_OST" && year === 2025
            ? ("RK_OST_WEST_TABLE_2025" as const)
            : ("SELECTED_TERRITORY" as const),
        sourceIds: [
          normId,
          ...territory.sourceIds,
          ...(region === "ost" && year === 2026 ? [repealId] : []),
        ] as [string, ...string[]],
      })),
    ),
  );
  const [first, ...rest] = rules;
  if (!first) throw new Error("Expected synthetic care annual-payment rules");
  pkg.rules.caritasAnnualPaymentRules = [first, ...rest];
  return pkg;
}
