import { describe, expect, it } from "vitest";
import e2024 from "../../rules/packages/reviewed/drk-rtv-e/2024-06-01-draft1.json";
import e2025 from "../../rules/packages/reviewed/drk-rtv-e/2025-09-01-draft1.json";
import e2026 from "../../rules/packages/reviewed/drk-rtv-e/2026-10-01-draft1.json";
import e2027 from "../../rules/packages/reviewed/drk-rtv-e/2027-10-01-draft1.json";
import s2024 from "../../rules/packages/reviewed/drk-rtv-s/2024-10-01-draft1.json";
import s2025 from "../../rules/packages/reviewed/drk-rtv-s/2025-09-01-draft1.json";
import s2026 from "../../rules/packages/reviewed/drk-rtv-s/2026-10-01-draft1.json";
import eSource from "../../rules/sources/drk-rtv-anlage-a1-e-tables.json";
import sSource from "../../rules/sources/drk-rtv-anlage-a3-s-tables.json";
import type { RuleTariffPackage } from "./contracts.generated";
import { RULE_CATALOG_SUPPORTED_ENGINE_CONTRACT_VERSIONS } from "./rule-catalog-engine-support";
import { resolveTariffSelection } from "./tariff-selection";
import { validateRulePackage } from "./validation";

const candidates = [
  [e2024, eSource, 0, "e", "a1", 125],
  [e2025, eSource, 1, "e", "a1", 125],
  [e2026, eSource, 2, "e", "a1", 125],
  [e2027, eSource, 3, "e", "a1", 125],
  [s2024, sSource, 0, "s", "a3", 96],
  [s2025, sSource, 1, "s", "a3", 96],
  [s2026, sSource, 2, "s", "a3", 96],
] as const;

describe("DRK-RTV E and S catalog drafts", () => {
  it.each(candidates)(
    "preserves all published cells in a dated contract 17 draft",
    (raw, source, index, family, annex, count) => {
      const pkg = raw as RuleTariffPackage;
      expect(validateRulePackage(pkg)).toEqual({ ok: true, value: pkg });
      expect(pkg).toMatchObject({
        packageId: `drk-rtv-${family}`,
        engineContractVersion: 17,
        status: "DRAFT",
        validFrom: source.tables[index].validFrom,
        validTo: source.tables[index].validTo,
      });
      expect(pkg.sources[0].sha256).toBe(source.source.sha256);
      const entries = pkg.rules.payTables[0].entries;
      expect(entries).toHaveLength(count);
      expect(entries).toEqual(
        source.tables[index].rows.flatMap(([groupId, ...values]) =>
          values.flatMap((monthlyCents, step) =>
            monthlyCents === null ? [] : [{ groupId, stepId: `s${step + 1}`, monthlyCents }],
          ),
        ),
      );
      const selected = resolveTariffSelection(pkg, `ANLAGE_${annex.toUpperCase()}`, "BTG");
      expect(selected?.familyId).toBe("drk-rtv");
      expect(selected?.region.payTableId).toBe(`anlage-${annex}-${family}`);
      expect(Object.values(selected!.capabilities)).toEqual(Array(5).fill("UNSUPPORTED"));
      expect(RULE_CATALOG_SUPPORTED_ENGINE_CONTRACT_VERSIONS).not.toContain(17);
    },
  );

  it("preserves E1 without stage 1 and the distinct October 2027 E9c value", () => {
    const current = e2027 as RuleTariffPackage;
    const entries = current.rules.payTables[0].entries;
    expect(entries.some((entry) => entry.groupId === "e1" && entry.stepId === "s1")).toBe(false);
    expect(
      entries.find((entry) => entry.groupId === "e9c" && entry.stepId === "s4")?.monthlyCents,
    ).toBe(454655);
    expect(
      (e2026 as RuleTariffPackage).rules.payTables[0].entries.find(
        (entry) => entry.groupId === "e9c" && entry.stepId === "s4",
      )?.monthlyCents,
    ).toBe(449655);
  });

  it("rejects invented E1 stage 1 and missing S-group cells", () => {
    const invented = structuredClone(e2026) as RuleTariffPackage;
    invented.rules.payTables[0].entries.push({ groupId: "e1", stepId: "s1", monthlyCents: 1 });
    const eResult = validateRulePackage(invented);
    expect(eResult.ok).toBe(false);
    if (!eResult.ok) expect(eResult.issues.map((issue) => issue.code)).toContain("DRK_E_STAGES");

    const missing = structuredClone(s2026) as RuleTariffPackage;
    missing.rules.payTables[0].entries.splice(0, 1);
    const sResult = validateRulePackage(missing);
    expect(sResult.ok).toBe(false);
    if (!sResult.ok) expect(sResult.issues.map((issue) => issue.code)).toContain("DRK_S_STAGES");
  });

  it("rejects wrong annex identity and any claim of executable DRK salary", () => {
    const wrong = structuredClone(s2026) as RuleTariffPackage;
    if (!("specialPartId" in wrong.rules.selector)) throw new Error("Expected one DRK annex.");
    wrong.rules.selector.specialPartId = "anlage-a1";
    const wrongResult = validateRulePackage(wrong);
    expect(wrongResult.ok).toBe(false);
    if (!wrongResult.ok)
      expect(wrongResult.issues.map((issue) => issue.code)).toContain("DRK_S_IDENTITY");

    const executable = structuredClone(e2026) as RuleTariffPackage;
    executable.rules.selection!.capabilities.basePay = "SUPPORTED";
    const executableResult = validateRulePackage(executable);
    expect(executableResult.ok).toBe(false);
    if (!executableResult.ok)
      expect(executableResult.issues.map((issue) => issue.code)).toContain("DRK_E_NOT_ACTIVATABLE");
  });
});
