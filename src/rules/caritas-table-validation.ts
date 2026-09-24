import type { RuleTariffPackage } from "./contracts.generated";
import type { ValidationIssue } from "./validation";

const regionalIds = ["bw", "bayern", "mitte", "nord", "nrw", "ost"] as const;
const annexes = new Map([
  ["ANLAGE_31", "anlage-31"],
  ["ANLAGE_32", "anlage-32"],
]);
const allowedRuleKeys = new Set([
  "selection",
  "selector",
  "payTables",
  "premiumRules",
  "allowanceRules",
  "combinationRules",
  "workPatternRules",
  "workPatternPolicy",
]);

/** Contract 14 accepts sourced P tables only. It does not authorize pay calculation. */
export function caritasTableIssues(pkg: RuleTariffPackage): ValidationIssue[] {
  const { rules } = pkg;
  const issues: ValidationIssue[] = [];
  const add = (code: string, path: string, message: string) => {
    issues.push({ code, path, message });
  };
  const claimsCaritas =
    pkg.packageId.startsWith("avr-caritas-p") || rules.selection?.familyId === "avr-caritas-p";
  if (pkg.engineContractVersion !== 14) {
    if (claimsCaritas) {
      add("CARITAS_CONTRACT", "/engineContractVersion", "Caritas P tables require contract 14.");
    }
    return issues;
  }

  const region = regionalIds.find((id) => pkg.packageId === `avr-caritas-p-${id}`);
  const { selection, selector, payTables } = rules;
  if (
    region === undefined ||
    selector.agreementId !== "avr-caritas" ||
    selection?.familyId !== "avr-caritas-p" ||
    selection.engineId !== "avr-caritas-p-v1" ||
    selection.employmentKind !== "EMPLOYEE"
  ) {
    add("CARITAS_IDENTITY", "/rules/selection", "A regional Caritas P identity is required.");
  }
  if (pkg.status !== "DRAFT") {
    add("CARITAS_DRAFT_ONLY", "/status", "Table-only Caritas packages must remain DRAFT.");
  }
  const expectedRange =
    region === "ost"
      ? ([
          ["2025-01-01", "2025-12-31"],
          ["2026-01-01", "2026-12-31"],
        ] as const)
      : ([
          ["2025-07-01", "2026-01-31"],
          ["2026-02-01", "2026-12-31"],
        ] as const);
  if (!expectedRange.some(([start, end]) => pkg.validFrom === start && pkg.validTo === end)) {
    add(
      "CARITAS_TABLE_PERIOD",
      "/validFrom",
      "The P table period must match a sourced 2025 or 2026 period.",
    );
  }

  const parts = "specialPartIds" in selector ? selector.specialPartIds : [selector.specialPartId];
  if (
    parts.length !== 2 ||
    new Set(parts).size !== 2 ||
    !parts.every((part) => [...annexes.values()].includes(part))
  ) {
    add("CARITAS_ANNEXES", "/rules/selector", "Both care annexes must be declared once.");
  }
  const expectedRegions =
    region === "ost"
      ? ["OST_TARIF_OST", "OST_TARIF_WEST_BERLIN", "OST_TARIF_WEST_HAMBURG"]
      : region === undefined
        ? []
        : [region.toUpperCase()];
  const referencedTables = new Set<string>();
  const variants = selection?.variants ?? [];
  if (
    variants.length !== annexes.size ||
    variants.some((variant) => annexes.get(variant.id) !== variant.specialPartId)
  ) {
    add(
      "CARITAS_VARIANTS",
      "/rules/selection/variants",
      "Both distinct care annexes are required.",
    );
  }
  for (const variant of variants) {
    const regionIds = variant.regions.map((item) => item.id);
    if (
      regionIds.length !== expectedRegions.length ||
      new Set(regionIds).size !== expectedRegions.length ||
      expectedRegions.some((id) => !regionIds.includes(id))
    ) {
      add(
        "CARITAS_REGIONS",
        "/rules/selection/variants",
        "Every annex requires its regional territories.",
      );
    }
    for (const item of variant.regions) {
      if (item.payTableId === undefined) {
        add(
          "CARITAS_TABLE_MAPPING",
          "/rules/selection/variants",
          "Every territory requires an explicit P table.",
        );
      } else {
        referencedTables.add(item.payTableId);
      }
    }
  }
  if (
    !selection ||
    Object.values(selection.capabilities).some((value) => value !== "UNSUPPORTED")
  ) {
    add(
      "CARITAS_CAPABILITIES",
      "/rules/selection/capabilities",
      "Table evidence does not enable a pay capability.",
    );
  }

  if (
    Object.keys(rules).some((key) => !allowedRuleKeys.has(key)) ||
    [rules.premiumRules, rules.allowanceRules, rules.combinationRules, rules.workPatternRules].some(
      (values) => values.length > 0,
    )
  ) {
    add(
      "CARITAS_FOREIGN_RULES",
      "/rules",
      "Table-only packages cannot inherit another tariff's calculation rules.",
    );
  }
  if (
    payTables.length < 1 ||
    payTables.length > 4 ||
    payTables.some((table) => !referencedTables.has(table.id))
  ) {
    add("CARITAS_TABLES", "/rules/payTables", "One to four mapped P tables are required.");
  }
  for (const [index, table] of payTables.entries()) {
    const expectedEntries = new Set<string>();
    for (const group of [4, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]) {
      for (let step = group <= 6 ? 1 : 2; step <= 6; step++) {
        expectedEntries.add(`p${group}:${step}`);
      }
    }
    for (const entry of table.entries) {
      if (!expectedEntries.delete(`${entry.groupId}:${entry.stepId}`) || entry.monthlyCents <= 0) {
        add(
          "CARITAS_TABLE_ENTRY",
          `/rules/payTables/${index}/entries`,
          "Only distinct positive P4/P6/P7–P16 values at their printed steps are valid.",
        );
      }
    }
    if (expectedEntries.size > 0) {
      add(
        "CARITAS_TABLE_INCOMPLETE",
        `/rules/payTables/${index}/entries`,
        "All 62 printed P values are required.",
      );
    }
  }
  return issues;
}
