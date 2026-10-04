import type { RuleTariffPackage } from "./contracts.generated";
import type { ValidationIssue } from "./validation";

const GROUPS = [
  "s18",
  "s17",
  "s16",
  "s15",
  "s14",
  "s13",
  "s12",
  "s11b",
  "s11a",
  "s9",
  "s8b",
  "s8a",
  "s7",
  "s4",
  "s3",
  "s2",
] as const;
const STEPS = ["s1", "s2", "s3", "s4", "s5", "s6"] as const;
const SOURCE_ID = "vka-tvoed-sue-bt-b-2025-2026";

/** Source-table contract only. Salary calculation needs a separately reviewed engine. */
export function tvoedSueIssues(pkg: RuleTariffPackage): ValidationIssue[] {
  const selection = pkg.rules.selection;
  const claimsSue =
    pkg.engineContractVersion === 18 ||
    pkg.packageId === "tvoed-vka-sue-bt-b" ||
    selection?.familyId === "tvoed-vka-sue";
  if (!claimsSue) return [];

  const issues: ValidationIssue[] = [];
  const add = (code: string, path: string, message: string) => issues.push({ code, path, message });
  if (pkg.engineContractVersion !== 18) {
    add(
      "TVOED_SUE_CONTRACT",
      "/engineContractVersion",
      "SuE BT-B source tables require contract 18.",
    );
    return issues;
  }

  const selector = pkg.rules.selector;
  const parts = "specialPartIds" in selector ? selector.specialPartIds : [selector.specialPartId];
  const variant = selection?.variants[0];
  const region = variant?.regions[0];
  if (
    pkg.packageId !== "tvoed-vka-sue-bt-b" ||
    selector.agreementId !== "tvoed-vka" ||
    parts.length !== 1 ||
    parts[0] !== "bt-b" ||
    selector.payTableId !== "anlage-c" ||
    selection?.familyId !== "tvoed-vka-sue" ||
    selection.engineId !== "tvoed-sue-bt-b-table-draft-v1" ||
    selection.employmentKind !== "EMPLOYEE" ||
    selection.variants.length !== 1 ||
    variant?.id !== "BT_B" ||
    variant.specialPartId !== "bt-b" ||
    variant.sourceIds.length !== 1 ||
    variant.sourceIds[0] !== SOURCE_ID ||
    variant.regions.length !== 1 ||
    region?.id !== "VKA" ||
    region.payTableId !== "anlage-c" ||
    region.sourceIds.length !== 1 ||
    region.sourceIds[0] !== SOURCE_ID
  )
    add("TVOED_SUE_IDENTITY", "/rules/selection", "Explicit BT-B Anlage C identity required.");

  if (
    pkg.status !== "DRAFT" ||
    pkg.review.status !== "DRAFT" ||
    !selection ||
    Object.values(selection.capabilities).some((value) => value !== "UNSUPPORTED")
  )
    add(
      "TVOED_SUE_NOT_ACTIVATABLE",
      "/rules/selection/capabilities",
      "The SuE source table must remain DRAFT with all capabilities unsupported.",
    );

  const allowedRuleKeys = new Set([
    "selection",
    "selector",
    "payTables",
    "premiumRules",
    "allowanceRules",
    "tvoedSueAllowancePolicy",
    "combinationRules",
    "workPatternRules",
    "workPatternPolicy",
  ]);
  if (
    Object.keys(pkg.rules).some((key) => !allowedRuleKeys.has(key)) ||
    [
      pkg.rules.premiumRules,
      pkg.rules.allowanceRules,
      pkg.rules.combinationRules,
      pkg.rules.workPatternRules,
    ].some((rows) => rows.length > 0)
  )
    add("TVOED_SUE_FOREIGN_RULES", "/rules", "Unimplemented calculation rules are forbidden.");

  const allowance = pkg.rules.tvoedSueAllowancePolicy;
  const expectedBands = [
    { groups: ["s2", "s3", "s4", "s7", "s8a", "s8b", "s9", "s11a"], cents: 13000, caseGroup: null },
    { groups: ["s11b", "s12", "s14"], cents: 18000, caseGroup: null },
    { groups: ["s15"], cents: 18000, caseGroup: "6" },
  ] as const;
  if (
    !allowance ||
    allowance.partTimeProRata !== true ||
    allowance.conversionDaysRequireSeparateCalculation !== true ||
    allowance.sourceIds.length !== 1 ||
    allowance.sourceIds[0] !== SOURCE_ID ||
    allowance.bands.length !== expectedBands.length ||
    expectedBands.some((expected, index) => {
      const band = allowance.bands[index];
      return (
        !band ||
        band.monthlyCents !== expected.cents ||
        band.caseGroup !== expected.caseGroup ||
        band.groupIds.length !== expected.groups.length ||
        expected.groups.some((group) => !band.groupIds.includes(group))
      );
    })
  )
    add(
      "TVOED_SUE_ALLOWANCE_POLICY",
      "/rules/tvoedSueAllowancePolicy",
      "§ 52(6) BT-B requires exact group, case-group, amount and source mapping.",
    );

  if (
    !pkg.sources.some((source) => source.id === SOURCE_ID) ||
    pkg.rules.payTables.length !== 1 ||
    pkg.rules.payTables[0]?.id !== "anlage-c" ||
    pkg.rules.payTables[0]?.sourceIds.length !== 1 ||
    pkg.rules.payTables[0]?.sourceIds[0] !== SOURCE_ID
  ) {
    add("TVOED_SUE_TABLE", "/rules/payTables", "One source-linked Anlage C table required.");
    return issues;
  }

  const entries = pkg.rules.payTables[0].entries;
  if (entries.length !== GROUPS.length * STEPS.length)
    add("TVOED_SUE_CELL_COUNT", "/rules/payTables/0/entries", "Exactly 96 cells required.");
  const seen = new Set<string>();
  for (const [index, entry] of entries.entries()) {
    const cell = `${entry.groupId}/${entry.stepId}`;
    if (
      !GROUPS.includes(entry.groupId as (typeof GROUPS)[number]) ||
      !STEPS.includes(entry.stepId as (typeof STEPS)[number]) ||
      seen.has(cell) ||
      !Number.isSafeInteger(entry.monthlyCents) ||
      entry.monthlyCents <= 0
    )
      add(
        "TVOED_SUE_CELL",
        `/rules/payTables/0/entries/${index}`,
        `Invalid or repeated cell ${cell}.`,
      );
    seen.add(cell);
  }
  for (const groupId of GROUPS)
    for (const stepId of STEPS)
      if (!seen.has(`${groupId}/${stepId}`))
        add(
          "TVOED_SUE_MISSING_CELL",
          "/rules/payTables/0/entries",
          `Missing ${groupId}/${stepId}.`,
        );
  return issues;
}
