import { describe, expect, it } from "vitest";
import historicalCandidate from "../../rules/packages/reviewed/drk-rtv-p/2024-06-01-draft1.json";
import oldCandidate from "../../rules/packages/reviewed/drk-rtv-p/2025-09-01-draft1.json";
import currentCandidate from "../../rules/packages/reviewed/drk-rtv-p/2026-10-01-draft1.json";
import source from "../../rules/sources/drk-rtv-anlage-a2-p-tables.json";
import type { RuleTariffPackage } from "./contracts.generated";
import { RULE_CATALOG_SUPPORTED_ENGINE_CONTRACT_VERSIONS } from "./rule-catalog-engine-support";
import { resolveTariffSelection } from "./tariff-selection";
import { validateRulePackage } from "./validation";

describe("DRK-RTV P source-only catalog candidates", () => {
  it.each([
    [historicalCandidate, 0, "2024-06-01", "2025-08-31", 281253],
    [oldCandidate, 1, "2025-09-01", "2026-09-30", 294207],
    [currentCandidate, 2, "2026-10-01", null, 302445],
  ] as const)(
    "binds all source cells to dated contract 17 package",
    (raw, index, from, to, p6s1) => {
      const pkg = raw as RuleTariffPackage;
      expect(validateRulePackage(pkg)).toEqual({ ok: true, value: pkg });
      expect(pkg).toMatchObject({
        engineContractVersion: 17,
        packageId: "drk-rtv-p",
        status: "DRAFT",
        validFrom: from,
        validTo: to,
      });
      expect(pkg.sources[0].sha256).toBe(source.source.sha256);
      expect(pkg.sources[0].url).toBe(source.source.url);
      const entries = pkg.rules.payTables[0].entries;
      expect(entries).toHaveLength(62);
      expect(entries).toEqual(
        source.tables[index].rows.flatMap(([groupId, ...values]) =>
          values.flatMap((monthlyCents, step) =>
            monthlyCents === null ? [] : [{ groupId, stepId: `s${step + 1}`, monthlyCents }],
          ),
        ),
      );
      expect(entries.find((row) => row.groupId === "p6" && row.stepId === "s1")?.monthlyCents).toBe(
        p6s1,
      );
      const selected = resolveTariffSelection(pkg, "ANLAGE_A2", "BTG");
      expect(selected?.groups.find((group) => group.id === "p5")?.levels).toEqual([
        "s1",
        "s2",
        "s3",
        "s4",
        "s5",
        "s6",
      ]);
      expect(selected?.groups.find((group) => group.id === "p7")?.levels).toEqual([
        "s2",
        "s3",
        "s4",
        "s5",
        "s6",
      ]);
      expect(Object.values(selected!.capabilities)).toEqual(Array(5).fill("UNSUPPORTED"));
      expect(RULE_CATALOG_SUPPORTED_ENGINE_CONTRACT_VERSIONS).not.toContain(17);
    },
  );

  it("rejects missing cells and an invented P7 stage 1", () => {
    const pkg = structuredClone(currentCandidate) as RuleTariffPackage;
    pkg.rules.payTables[0].entries.splice(0, 1);
    pkg.rules.payTables[0].entries.push({ groupId: "p7", stepId: "s1", monthlyCents: 1 });
    const result = validateRulePackage(pkg);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues.map((issue) => issue.code)).toContain("DRK_P_STAGES");
  });

  it("rejects any claim that these tables can already calculate DRK salary", () => {
    const pkg = structuredClone(currentCandidate) as RuleTariffPackage;
    pkg.rules.selection!.capabilities.basePay = "SUPPORTED";
    const result = validateRulePackage(pkg);
    expect(result.ok).toBe(false);
    if (!result.ok)
      expect(result.issues.map((issue) => issue.code)).toContain("DRK_P_NOT_ACTIVATABLE");
  });

  it("rejects the same DRK identity under an older contract version", () => {
    const pkg = structuredClone(currentCandidate) as RuleTariffPackage;
    pkg.engineContractVersion = 14;
    const result = validateRulePackage(pkg);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues.map((issue) => issue.code)).toContain("DRK_CONTRACT");
  });
});
