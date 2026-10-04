import { describe, expect, it } from "vitest";
import p2024 from "../../rules/packages/reviewed/drk-rtv-training/2024-06-01-draft1.json";
import p2025 from "../../rules/packages/reviewed/drk-rtv-training/2025-09-01-draft1.json";
import p2026 from "../../rules/packages/reviewed/drk-rtv-training/2026-10-01-draft1.json";
import source from "../../rules/sources/drk-rtv-anlage-3-training-tables.json";
import type { RuleTariffPackage } from "./contracts.generated";
import { RULE_CATALOG_SUPPORTED_ENGINE_CONTRACT_VERSIONS } from "./rule-catalog-engine-support";
import { resolveTariffSelection } from "./tariff-selection";
import { validateRulePackage } from "./validation";

const candidates = [p2024, p2025, p2026] as const;

describe("DRK-RTV Anlage 3/3a training catalog drafts", () => {
  it.each(candidates)("preserves eight amounts per period without enabling pay", (raw) => {
    const pkg = raw as RuleTariffPackage;
    const sourceTable = source.tables.find((table) => table.validFrom === pkg.validFrom);
    expect(sourceTable).toBeDefined();
    expect(validateRulePackage(pkg)).toEqual({ ok: true, value: pkg });
    expect(pkg).toMatchObject({
      packageId: "drk-rtv-training",
      engineContractVersion: 17,
      status: "DRAFT",
      validTo: sourceTable?.validTo,
    });
    expect(pkg.sources[0].sha256).toBe(source.source.sha256);
    expect(pkg.rules.payTables[0].entries).toEqual(
      sourceTable?.rows.flatMap(([groupId, ...values]) =>
        values.flatMap((monthlyCents, index) =>
          monthlyCents === null ? [] : [{ groupId, stepId: `s${index + 1}`, monthlyCents }],
        ),
      ),
    );
    expect(pkg.rules.payTables[0].entries).toHaveLength(8);
    expect(pkg.rules.trainingPay).toBeUndefined();
    for (const variant of ["ANLAGE_3", "ANLAGE_3A_A", "ANLAGE_3A_B"]) {
      const selected = resolveTariffSelection(pkg, variant, "BTG");
      expect(selected?.employmentKind).toBe("APPRENTICE");
      expect(Object.values(selected!.capabilities)).toEqual(Array(5).fill("UNSUPPORTED"));
    }
    expect(RULE_CATALOG_SUPPORTED_ENGINE_CONTRACT_VERSIONS).not.toContain(17);
  });

  it("rejects invented years, missing cells and false salary support", () => {
    const invented = structuredClone(p2025) as RuleTariffPackage;
    invented.rules.payTables[0].entries.push({
      groupId: "anlage-3a-b",
      stepId: "s2",
      monthlyCents: 1,
    });
    const inventedResult = validateRulePackage(invented);
    expect(inventedResult.ok).toBe(false);
    if (!inventedResult.ok)
      expect(inventedResult.issues.map((issue) => issue.code)).toContain("DRK_TRAINING_STAGES");

    const missing = structuredClone(p2026) as RuleTariffPackage;
    missing.rules.payTables[0].entries.splice(0, 1);
    const missingResult = validateRulePackage(missing);
    expect(missingResult.ok).toBe(false);
    if (!missingResult.ok)
      expect(missingResult.issues.map((issue) => issue.code)).toContain("DRK_TRAINING_CELL_COUNT");

    const executable = structuredClone(p2026) as RuleTariffPackage;
    executable.rules.selection!.capabilities.basePay = "SUPPORTED";
    const executableResult = validateRulePackage(executable);
    expect(executableResult.ok).toBe(false);
    if (!executableResult.ok)
      expect(executableResult.issues.map((issue) => issue.code)).toContain(
        "DRK_TRAINING_NOT_ACTIVATABLE",
      );
  });

  it("rejects a wrong annex or an invented validity period", () => {
    const wrongAnnex = structuredClone(p2024) as RuleTariffPackage;
    if (!("specialPartIds" in wrongAnnex.rules.selector)) throw new Error("Expected two annexes.");
    wrongAnnex.rules.selector.specialPartIds = ["anlage-3", "anlage-a2"];
    const annexResult = validateRulePackage(wrongAnnex);
    expect(annexResult.ok).toBe(false);
    if (!annexResult.ok)
      expect(annexResult.issues.map((issue) => issue.code)).toContain("DRK_TRAINING_IDENTITY");

    const wrongPeriod = structuredClone(p2026) as RuleTariffPackage;
    wrongPeriod.validFrom = "2026-09-01";
    const periodResult = validateRulePackage(wrongPeriod);
    expect(periodResult.ok).toBe(false);
    if (!periodResult.ok)
      expect(periodResult.issues.map((issue) => issue.code)).toContain("DRK_TRAINING_PERIOD");
  });
});
