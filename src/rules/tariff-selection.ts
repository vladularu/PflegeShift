import type { RuleTariffPackage } from "./contracts.generated";
import type { ValidationIssue } from "./validation";

/** Selection metadata is descriptive, never permission to execute an unknown tariff. */
export function tariffSelectionIssues(rulePackage: RuleTariffPackage): ValidationIssue[] {
  const selection = rulePackage.rules.selection;
  const issues: ValidationIssue[] = [];
  const add = (code: string, path: string, message: string) => issues.push({ code, path, message });
  if (![8, 10, 11, 12, 13, 14, 15, 16, 17, 18].includes(rulePackage.engineContractVersion)) {
    if (selection !== undefined)
      add(
        "UNSUPPORTED_TARIFF_SELECTION",
        "/rules/selection",
        "Selection metadata requires tariff contract 8, 10, 11, 12, 13, 14, 15, 16, 17 or 18.",
      );
    return issues;
  }
  if (selection === undefined) {
    add(
      "MISSING_TARIFF_SELECTION",
      "/rules/selection",
      "Tariff contracts 8, 10, 11, 12, 13, 14, 15, 16, 17 and 18 require selection metadata.",
    );
    return issues;
  }
  if (rulePackage.engineContractVersion === 11) {
    const expectedParts = new Map([
      ["BT_K", "bt-k"],
      ["BT_B", "bt-b"],
    ]);
    const supported =
      rulePackage.packageId === "tvoed-vka-bt-k" &&
      selection.familyId === "tvoed-p" &&
      selection.engineId === "tvoed-p-v3" &&
      selection.employmentKind === "EMPLOYEE" &&
      rulePackage.rules.selector.agreementId === "tvoed-vka" &&
      rulePackage.rules.payTables.length === 1 &&
      selection.variants.length === expectedParts.size &&
      selection.variants.every(
        (variant) =>
          expectedParts.get(variant.id) === variant.specialPartId &&
          variant.regions.length === 2 &&
          ["OTHER", "KAV_BW"].every((id) => variant.regions.some((region) => region.id === id)) &&
          variant.regions.every(
            (region) =>
              region.payTableId === undefined ||
              region.payTableId === rulePackage.rules.selector.payTableId,
          ),
      ) &&
      Object.values(selection.capabilities).every((capability) => capability === "SUPPORTED");
    if (!supported)
      add(
        "UNSUPPORTED_TARIFF_SELECTION",
        "/rules/selection",
        "This app supports contract 11 only for TVöD-VKA BT-K/BT-B employees with one pay table.",
      );
  }
  const sources = new Set(rulePackage.sources.map((source) => source.id));
  const selector = rulePackage.rules.selector;
  const parts = "specialPartIds" in selector ? selector.specialPartIds : [selector.specialPartId];
  const variants = new Set<string>();
  function checkSources(ids: readonly string[], path: string) {
    for (const id of ids)
      if (!sources.has(id)) add("UNKNOWN_SOURCE_ID", path, `Unknown source reference: ${id}.`);
  }
  for (const [index, variant] of selection.variants.entries()) {
    const path = `/rules/selection/variants/${index}`;
    if (variants.has(variant.id))
      add("DUPLICATE_SELECTION_VARIANT", path + "/id", "Variant identifiers must be unique.");
    variants.add(variant.id);
    if (!parts.includes(variant.specialPartId))
      add(
        "UNKNOWN_SELECTION_SPECIAL_PART",
        path + "/specialPartId",
        "The variant must reference a declared special part.",
      );
    checkSources(variant.sourceIds, path + "/sourceIds");
    const regions = new Set<string>();
    for (const [regionIndex, region] of variant.regions.entries()) {
      const regionPath = `${path}/regions/${regionIndex}`;
      if (regions.has(region.id))
        add(
          "DUPLICATE_SELECTION_REGION",
          regionPath + "/id",
          "Region identifiers must be unique within their variant.",
        );
      regions.add(region.id);
      checkSources(region.sourceIds, regionPath + "/sourceIds");
      if (
        region.payTableId !== undefined &&
        rulePackage.rules.payTables.filter((table) => table.id === region.payTableId).length !== 1
      )
        add(
          "UNKNOWN_SELECTION_PAY_TABLE",
          regionPath + "/payTableId",
          "The region must reference exactly one declared pay table.",
        );
    }
  }
  return issues;
}

export function resolveTariffSelection(
  rulePackage: RuleTariffPackage,
  variantId: string,
  regionId: string,
) {
  if (tariffSelectionIssues(rulePackage).length > 0) return null;
  const selection = rulePackage.rules.selection;
  if (selection === undefined) return null;
  const variant = selection.variants.find((item) => item.id === variantId);
  const region = variant?.regions.find((item) => item.id === regionId);
  if (!variant || !region) return null;
  const tables = rulePackage.rules.payTables.filter(
    (table) => table.id === (region.payTableId ?? rulePackage.rules.selector.payTableId),
  );
  if (tables.length !== 1) return null;
  const groups = new Map<string, string[]>();
  for (const entry of tables[0].entries) {
    const levels = groups.get(entry.groupId) ?? [];
    if (levels.includes(entry.stepId)) return null;
    levels.push(entry.stepId);
    groups.set(entry.groupId, levels);
  }
  return {
    packageId: rulePackage.packageId,
    versionId: rulePackage.versionId,
    label: rulePackage.label,
    validFrom: rulePackage.validFrom,
    validTo: rulePackage.validTo,
    familyId: selection.familyId,
    engineId: selection.engineId,
    employmentKind: selection.employmentKind,
    variant,
    region,
    capabilities: selection.capabilities,
    groups: [...groups].map(([id, levels]) => ({ id, levels })),
  };
}
