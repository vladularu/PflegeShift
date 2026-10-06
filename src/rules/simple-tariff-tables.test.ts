import { describe, expect, it } from "vitest";
import raw from "../../rules/packages/reviewed/tvoed-vka-bt-k/2026-05-r4.json";
import original from "../../rules/packages/reviewed/tvoed-vka-bt-k/2026-05-r3.json";
import { validateRulePackage } from "./validation";
import { RULE_CATALOG_SUPPORTED_ENGINE_CONTRACT_VERSIONS } from "./rule-catalog-engine-support";

const errors = (value: unknown) => {
  const result = validateRulePackage(value);
  return result.ok ? [] : result.issues.map((issue) => issue.code);
};
describe("signed simple tariff table contract", () => {
  it("preserves the existing P rules and all six accepted table families", () => {
    expect(errors(raw)).toEqual([]);
    const { simpleTariffTables, ...rules } = raw.rules;
    expect(rules).toEqual(original.rules);
    expect(new Set(simpleTariffTables.tables.map((t) => t.tariffId)).size).toBe(6);
    expect(simpleTariffTables.tables).toHaveLength(21);
    expect(simpleTariffTables.tables.reduce((sum, t) => sum + t.entries.length, 0)).toBe(998);
    expect(RULE_CATALOG_SUPPORTED_ENGINE_CONTRACT_VERSIONS).toContain(19);
    expect(RULE_CATALOG_SUPPORTED_ENGINE_CONTRACT_VERSIONS).not.toContain(12);
    expect(RULE_CATALOG_SUPPORTED_ENGINE_CONTRACT_VERSIONS).not.toContain(13);
    expect(RULE_CATALOG_SUPPORTED_ENGINE_CONTRACT_VERSIONS).not.toContain(16);
  });
  it("retains an independently checked apprentice value and dated boundary", () => {
    const t = raw.rules.simpleTariffTables.tables.find(
      (t) => t.tariffId === "TVAOED_PFLEGE" && t.validFrom === "2026-05-01",
    )!;
    expect(t.entries.find((e) => e.groupId === "b" && e.stepId === "s1")?.monthlyCents).toBe(
      149069,
    );
    expect(t.validTo).toBe("2027-03-31");
  });
  it.each(["TVOED_VKA_E", "TVAOED_PFLEGE", "TVL_KR", "TVAL_PFLEGE", "TVH_KR", "TVUK_PUK"])(
    "rejects an incomplete %s table",
    (family) => {
      const p = structuredClone(raw);
      p.rules.simpleTariffTables.tables.find((t) => t.tariffId === family)!.entries.pop();
      expect(errors(p)).not.toEqual([]);
    },
  );
  it("rejects duplicate cells, unknown cells, overlaps and unverified sources", () => {
    for (const change of ["duplicate", "unknown", "overlap", "source"] as const) {
      const p = structuredClone(raw);
      const t = p.rules.simpleTariffTables.tables[0];
      if (change === "duplicate") t.entries.push(t.entries[0]);
      if (change === "unknown") t.entries[0].groupId = "unknown";
      if (change === "overlap") p.rules.simpleTariffTables.tables.push(structuredClone(t));
      if (change === "source") t.sourceIds = ["unknown-source"];
      expect(errors(p)).not.toEqual([]);
    }
  });
  it("rejects missing family, impossible dates, unsafe amounts and hidden properties", () => {
    for (const change of ["family", "date", "amount", "extra"] as const) {
      const p = structuredClone(raw);
      const t = p.rules.simpleTariffTables.tables[0];
      if (change === "family")
        p.rules.simpleTariffTables.tables = p.rules.simpleTariffTables.tables.filter(
          (t) => t.tariffId !== "TVH_KR",
        );
      if (change === "date") t.validFrom = "2026-02-30";
      if (change === "amount") t.entries[0].monthlyCents = 0;
      if (change === "extra") Object.assign(t, { premiumPercentage: 999 });
      expect(errors(p)).not.toEqual([]);
    }
  });
  it("binds the table data to the explicit new contract and original P identity", () => {
    const old = structuredClone(raw);
    old.engineContractVersion = 11;
    expect(errors(old)).toContain("SIMPLE_TABLE_CONTRACT_MISMATCH");
    const absent = structuredClone(raw);
    Reflect.deleteProperty(absent.rules, "simpleTariffTables");
    expect(errors(absent)).toContain("SIMPLE_TABLE_DATA_REQUIRED");
    const wrong = structuredClone(raw);
    wrong.packageId = "other-tariff";
    expect(errors(wrong)).toContain("UNSUPPORTED_TARIFF_SELECTION");
  });
});
