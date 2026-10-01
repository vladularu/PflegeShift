import type { RuleTariffPackage } from "./contracts.generated";
import type { ValidationIssue } from "./validation";

const careGroups = ["p4", "p6", "p7", "p8", "p9", "p10", "p11", "p12", "p13", "p14", "p15", "p16"];

/** Optional, sourced §16 metadata only. Claim and basis calculation remain unsupported. */
export function caritasAnnualPaymentIssues(pkg: RuleTariffPackage): ValidationIssue[] {
  const rules = pkg.rules.caritasAnnualPaymentRules;
  if (rules === undefined) return [];
  const issues: ValidationIssue[] = [];
  const root = "/rules/caritasAnnualPaymentRules";
  const add = (code: string, path: string, message: string) => {
    issues.push({ code, path, message });
  };
  const selection = pkg.rules.selection;
  if (
    pkg.engineContractVersion !== 14 ||
    pkg.status !== "DRAFT" ||
    selection?.familyId !== "avr-caritas-p" ||
    selection.engineId !== "avr-caritas-p-v1" ||
    Object.values(selection.capabilities).some((value) => value !== "UNSUPPORTED")
  ) {
    add(
      "CARITAS_ANNUAL_CONTRACT",
      root,
      "Caritas annual rules require unsupported DRAFT contract 14.",
    );
    return issues;
  }
  const sources = new Set(pkg.sources.map((source) => source.id));
  const ids = new Set<string>();
  for (const [index, rule] of rules.entries()) {
    const path = `${root}/${index}`;
    if (ids.has(rule.id)) add("CARITAS_ANNUAL_ID", `${path}/id`, "Annual rule IDs must be unique.");
    ids.add(rule.id);
    const variant = selection.variants.find((item) => item.id === rule.variantId);
    const territory = variant?.regions.find((item) => item.id === rule.regionId);
    if (!territory || !["ANLAGE_31", "ANLAGE_32"].includes(rule.variantId)) {
      add(
        "CARITAS_ANNUAL_SELECTION",
        path,
        "Annual rules must reference a declared care annex and territory.",
      );
      continue;
    }
    const referenceDate = `${rule.entitlementYear}-09-01`;
    if (referenceDate < pkg.validFrom || (pkg.validTo !== null && referenceDate > pkg.validTo)) {
      add(
        "CARITAS_ANNUAL_YEAR",
        `${path}/entitlementYear`,
        "September 1 must fall within the package validity.",
      );
    }
    const lowBand = new Set(["p4", "p6", "p7", "p8"]);
    if (
      rule.payGroups.some(
        (group) =>
          !careGroups.includes(group) ||
          rule.rateBasisPoints !== (lowBand.has(group) ? 8600 : 7600),
      )
    ) {
      add(
        "CARITAS_ANNUAL_RATE",
        path,
        "P4/P6/P7/P8 use 86%; P9-P16 use 76%, including P16 mapped to EG12.",
      );
    }
    if (rule.referenceMonths.some((month, monthIndex) => month !== [7, 8, 9][monthIndex])) {
      add(
        "CARITAS_ANNUAL_REFERENCE_MONTHS",
        `${path}/referenceMonths`,
        "The ordinary reference months are July, August, September in that order.",
      );
    }
    const expectedEligibility =
      rule.variantId === "ANLAGE_31" ? "ANLAGE_31_SECTION_16_1_AND_6" : "ANLAGE_32_SECTION_16_1";
    if (rule.eligibilityPolicy !== expectedEligibility) {
      add(
        "CARITAS_ANNUAL_ELIGIBILITY",
        `${path}/eligibilityPolicy`,
        "The annex-specific eligibility policy must be explicit.",
      );
    }
    const east2025 = rule.regionId === "OST_TARIF_OST" && rule.entitlementYear === 2025;
    const expectedBasisRegion = east2025 ? "OST_TARIF_WEST_HAMBURG" : rule.regionId;
    const expectedBasisPolicy = east2025 ? "RK_OST_WEST_TABLE_2025" : "SELECTED_TERRITORY";
    const basisTerritory = variant?.regions.find((item) => item.id === rule.basisRegionId);
    if (
      rule.basisRegionId !== expectedBasisRegion ||
      rule.basisTablePolicy !== expectedBasisPolicy ||
      basisTerritory?.payTableId === undefined ||
      !pkg.rules.payTables.some((table) => table.id === basisTerritory.payTableId)
    ) {
      add(
        "CARITAS_ANNUAL_BASIS",
        path,
        "The selected year and territory require an explicit, mapped annual table basis.",
      );
    }
    const requiredSources = [`caritas-avr-jsz-${rule.entitlementYear}`, ...territory.sourceIds];
    if (pkg.packageId === "avr-caritas-p-ost" && rule.entitlementYear === 2026) {
      requiredSources.push("caritas-bk-2025-03-jsz-ost");
    }
    if (
      rule.sourceIds.some((id) => !sources.has(id)) ||
      requiredSources.some((id) => !rule.sourceIds.includes(id))
    ) {
      add(
        "CARITAS_ANNUAL_SOURCE",
        `${path}/sourceIds`,
        "Known annual norm, regional sources and the applicable Ost repeal source are required.",
      );
    }
  }
  for (const year of [2025, 2026]) {
    const referenceDate = `${year}-09-01`;
    if (referenceDate < pkg.validFrom || (pkg.validTo !== null && referenceDate > pkg.validTo))
      continue;
    for (const variant of selection.variants) {
      for (const territory of variant.regions) {
        for (const group of careGroups) {
          const matches = rules.filter(
            (rule) =>
              rule.entitlementYear === year &&
              rule.variantId === variant.id &&
              rule.regionId === territory.id &&
              rule.payGroups.includes(group as (typeof rule.payGroups)[number]),
          );
          if (matches.length !== 1) {
            add(
              "CARITAS_ANNUAL_COVERAGE",
              root,
              `Exactly one annual rule is required for ${year}/${variant.id}/${territory.id}/${group}.`,
            );
          }
        }
      }
    }
  }
  return issues;
}
