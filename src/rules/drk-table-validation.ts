import type { RuleTariffPackage } from "./contracts.generated";
import type { ValidationIssue } from "./validation";

const ALL_STEPS = ["s1", "s2", "s3", "s4", "s5", "s6"];
interface DrkTableSpec {
  readonly annexId: string;
  readonly tableId: string;
  readonly variantId: string;
  readonly engineId: string;
  readonly codePrefix: "DRK_E" | "DRK_P" | "DRK_S";
  readonly groups: readonly string[];
  readonly withoutStageOne: ReadonlySet<string>;
  readonly cellCount: number;
}

const SPECS: Readonly<Record<string, DrkTableSpec>> = {
  "drk-rtv-e": {
    annexId: "anlage-a1",
    tableId: "anlage-a1-e",
    variantId: "ANLAGE_A1",
    engineId: "drk-rtv-e-v1",
    codePrefix: "DRK_E",
    groups: [
      "e15",
      "e14",
      "e13",
      "e12",
      "e11",
      "e10",
      "e9",
      "e9a",
      "e9b",
      "e9c",
      "e8",
      "e7",
      "e7a",
      "e6",
      "e6a",
      "e6b",
      "e5",
      "e4",
      "e3",
      "e2",
      "e1",
    ],
    withoutStageOne: new Set(["e1"]),
    cellCount: 125,
  },
  "drk-rtv-p": {
    annexId: "anlage-a2",
    tableId: "anlage-a2-p",
    variantId: "ANLAGE_A2",
    engineId: "drk-rtv-p-v1",
    codePrefix: "DRK_P",
    groups: Array.from({ length: 12 }, (_, index) => `p${16 - index}`),
    withoutStageOne: new Set(Array.from({ length: 10 }, (_, index) => `p${16 - index}`)),
    cellCount: 62,
  },
  "drk-rtv-s": {
    annexId: "anlage-a3",
    tableId: "anlage-a3-s",
    variantId: "ANLAGE_A3",
    engineId: "drk-rtv-s-v1",
    codePrefix: "DRK_S",
    groups: [
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
    ],
    withoutStageOne: new Set(),
    cellCount: 96,
  },
};

/** Source-table contract: E, P and S remain independently non-executable until reviewed. */
export function drkTableIssues(pkg: RuleTariffPackage): ValidationIssue[] {
  // Anlage 3/3a has a separate contract-17 draft validator.
  if (pkg.packageId === "drk-rtv-training") return [];
  const selection = pkg.rules.selection;
  const claimsDrk =
    pkg.engineContractVersion === 17 ||
    pkg.packageId.startsWith("drk-rtv-") ||
    selection?.familyId === "drk-rtv";
  if (!claimsDrk) return [];

  const issues: ValidationIssue[] = [];
  const add = (code: string, path: string, message: string) => issues.push({ code, path, message });
  if (pkg.engineContractVersion !== 17) {
    add("DRK_CONTRACT", "/engineContractVersion", "DRK source tables require contract 17.");
    return issues;
  }
  const spec = SPECS[pkg.packageId];
  if (spec === undefined) {
    add("DRK_IDENTITY", "/packageId", "Unknown DRK table family under contract 17.");
    return issues;
  }

  const selector = pkg.rules.selector;
  const parts = "specialPartIds" in selector ? selector.specialPartIds : [selector.specialPartId];
  const variant = selection?.variants[0];
  const region = variant?.regions[0];
  if (
    selector.agreementId !== "drk-rtv" ||
    parts.length !== 1 ||
    parts[0] !== spec.annexId ||
    selector.payTableId !== spec.tableId ||
    selection?.familyId !== "drk-rtv" ||
    selection.engineId !== spec.engineId ||
    selection.employmentKind !== "EMPLOYEE" ||
    selection.variants.length !== 1 ||
    variant?.id !== spec.variantId ||
    variant.specialPartId !== spec.annexId ||
    variant.regions.length !== 1 ||
    region?.id !== "BTG" ||
    region.payTableId !== spec.tableId
  )
    add(`${spec.codePrefix}_IDENTITY`, "/rules/selection", "Explicit DRK annex identity required.");

  if (
    pkg.status !== "DRAFT" ||
    pkg.review.status !== "DRAFT" ||
    selection === undefined ||
    Object.values(selection.capabilities).some((value) => value !== "UNSUPPORTED") ||
    pkg.rules.premiumRules.length > 0 ||
    pkg.rules.allowanceRules.length > 0 ||
    pkg.rules.combinationRules.length > 0 ||
    pkg.rules.workPatternRules.length > 0
  )
    add(
      `${spec.codePrefix}_NOT_ACTIVATABLE`,
      "/rules/selection/capabilities",
      "A DRK table draft cannot claim any executable tariff capability.",
    );

  if (pkg.rules.payTables.length !== 1 || pkg.rules.payTables[0]?.id !== spec.tableId) {
    add(`${spec.codePrefix}_TABLE`, "/rules/payTables", "Exactly one DRK annex table is required.");
    return issues;
  }
  const entries = pkg.rules.payTables[0].entries;
  if (entries.length !== spec.cellCount)
    add(
      `${spec.codePrefix}_CELL_COUNT`,
      "/rules/payTables/0/entries",
      `Expected ${spec.cellCount} cells.`,
    );
  for (const groupId of spec.groups) {
    const expectedSteps = spec.withoutStageOne.has(groupId) ? ALL_STEPS.slice(1) : ALL_STEPS;
    const actualSteps = entries
      .filter((entry) => entry.groupId === groupId)
      .map((entry) => entry.stepId);
    if (
      actualSteps.length !== expectedSteps.length ||
      new Set(actualSteps).size !== expectedSteps.length ||
      expectedSteps.some((stepId) => !actualSteps.includes(stepId))
    )
      add(
        `${spec.codePrefix}_STAGES`,
        "/rules/payTables/0/entries",
        `Invalid stages for ${groupId}: ${actualSteps.join(",")}.`,
      );
  }
  for (const [index, entry] of entries.entries()) {
    if (
      !spec.groups.includes(entry.groupId) ||
      !Number.isSafeInteger(entry.monthlyCents) ||
      entry.monthlyCents <= 0
    )
      add(
        `${spec.codePrefix}_CELL`,
        `/rules/payTables/0/entries/${index}`,
        "Unexpected DRK group or invalid monthly amount.",
      );
  }
  return issues;
}
