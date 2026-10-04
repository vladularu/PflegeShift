import type { RuleTariffPackage } from "./contracts.generated";
import type { ValidationIssue } from "./validation";

const PERIODS: Readonly<Record<string, string | null>> = {
  "2024-06-01": "2025-08-31",
  "2025-09-01": "2026-09-30",
  "2026-10-01": null,
};
const STAGES: Readonly<Record<string, readonly string[]>> = {
  "anlage-3-general": ["s1", "s2", "s3", "s4"],
  "anlage-3a-a": ["s1", "s2", "s3"],
  "anlage-3a-b": ["s1"],
};
const VARIANTS = [
  ["ANLAGE_3", "anlage-3"],
  ["ANLAGE_3A_A", "anlage-3a"],
  ["ANLAGE_3A_B", "anlage-3a"],
] as const;

/** A source-only apprentice table, not a claim that DRK training pay can be calculated. */
export function drkTrainingTableIssues(pkg: RuleTariffPackage): ValidationIssue[] {
  if (pkg.packageId !== "drk-rtv-training") return [];
  const issues: ValidationIssue[] = [];
  const add = (code: string, path: string, message: string) => issues.push({ code, path, message });
  const selection = pkg.rules.selection;
  const selector = pkg.rules.selector;
  const parts = "specialPartIds" in selector ? selector.specialPartIds : [selector.specialPartId];

  if (pkg.engineContractVersion !== 17)
    add(
      "DRK_TRAINING_CONTRACT",
      "/engineContractVersion",
      "DRK training drafts require contract 17.",
    );
  if (!(pkg.validFrom in PERIODS) || PERIODS[pkg.validFrom] !== pkg.validTo)
    add("DRK_TRAINING_PERIOD", "/validFrom", "Unknown DRK training table period.");
  if (
    selector.agreementId !== "drk-rtv" ||
    parts.length !== 2 ||
    !parts.includes("anlage-3") ||
    !parts.includes("anlage-3a") ||
    selector.payTableId !== "training" ||
    selection?.familyId !== "drk-rtv" ||
    selection.engineId !== "drk-rtv-training-v1" ||
    selection.employmentKind !== "APPRENTICE" ||
    selection.variants.length !== VARIANTS.length ||
    VARIANTS.some(([id, specialPartId]) => {
      const variant = selection.variants.find((candidate) => candidate.id === id);
      return (
        variant?.specialPartId !== specialPartId ||
        variant.regions.length !== 1 ||
        variant.regions[0]?.id !== "BTG" ||
        variant.regions[0]?.payTableId !== "training"
      );
    })
  )
    add(
      "DRK_TRAINING_IDENTITY",
      "/rules/selection",
      "Explicit Anlage 3/3a category selection required.",
    );

  if (
    pkg.status !== "DRAFT" ||
    pkg.review.status !== "DRAFT" ||
    selection === undefined ||
    Object.values(selection.capabilities).some((value) => value !== "UNSUPPORTED") ||
    pkg.rules.trainingPay !== undefined ||
    pkg.rules.premiumRules.length > 0 ||
    pkg.rules.allowanceRules.length > 0 ||
    pkg.rules.combinationRules.length > 0 ||
    pkg.rules.workPatternRules.length > 0
  )
    add(
      "DRK_TRAINING_NOT_ACTIVATABLE",
      "/rules/selection/capabilities",
      "Training source tables cannot claim an executable pay rule.",
    );

  if (pkg.rules.payTables.length !== 1 || pkg.rules.payTables[0]?.id !== "training") {
    add("DRK_TRAINING_TABLE", "/rules/payTables", "Exactly one training table is required.");
    return issues;
  }
  const entries = pkg.rules.payTables[0].entries;
  if (entries.length !== 8)
    add("DRK_TRAINING_CELL_COUNT", "/rules/payTables/0/entries", "Expected eight monthly amounts.");
  for (const [groupId, stages] of Object.entries(STAGES)) {
    const actual = entries
      .filter((entry) => entry.groupId === groupId)
      .map((entry) => entry.stepId);
    if (
      actual.length !== stages.length ||
      new Set(actual).size !== stages.length ||
      stages.some((stepId) => !actual.includes(stepId))
    )
      add("DRK_TRAINING_STAGES", "/rules/payTables/0/entries", `Invalid years for ${groupId}.`);
  }
  for (const [index, entry] of entries.entries())
    if (
      STAGES[entry.groupId] === undefined ||
      !Number.isSafeInteger(entry.monthlyCents) ||
      entry.monthlyCents <= 0
    )
      add(
        "DRK_TRAINING_CELL",
        `/rules/payTables/0/entries/${index}`,
        "Unknown training category or invalid monthly amount.",
      );
  return issues;
}
