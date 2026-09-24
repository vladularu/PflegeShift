import { describe, expect, it } from "vitest";

import previous from "../../rules/packages/reviewed/tvoed-vka-bt-k/2026-05.json";
import candidate from "../../rules/packages/reviewed/tvoed-vka-bt-k/2026-05-r3.json";
import { RULE_CATALOG_SUPPORTED_ENGINE_CONTRACT_VERSIONS } from "./rule-catalog-engine-support";
import { validateRulePackage } from "./validation";

const vkaMay2026 = {
  p5: [290718, 314633, 321662, 333409, 342222, 362925],
  p6: [301249, 318741, 336347, 373795, 383341, 401341],
};

describe("Preview contract 11 catalog candidate", () => {
  it("keeps the existing 50 table cells and adds the official P5/P6 values", () => {
    const before = previous.rules.payTables[0].entries;
    const after = candidate.rules.payTables[0].entries;
    expect(before).toHaveLength(50);
    expect(after).toHaveLength(62);
    for (const entry of before) {
      expect(
        after.find((item) => item.groupId === entry.groupId && item.stepId === entry.stepId),
      ).toEqual(entry);
    }
    for (const [groupId, amounts] of Object.entries(vkaMay2026)) {
      expect(
        after.filter((entry) => entry.groupId === groupId).map((entry) => entry.monthlyCents),
      ).toEqual(amounts);
    }
  });

  it("accepts only the supported contract and rejects invalid tariff metadata", () => {
    expect(validateRulePackage(candidate).ok).toBe(true);
    expect(RULE_CATALOG_SUPPORTED_ENGINE_CONTRACT_VERSIONS).toContain(11);
    expect(RULE_CATALOG_SUPPORTED_ENGINE_CONTRACT_VERSIONS).not.toContain(8);

    const wrongEngine = structuredClone(candidate);
    wrongEngine.rules.selection.engineId = "different-engine";
    const result = validateRulePackage(wrongEngine);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues.map((item) => item.code)).toContain("UNSUPPORTED_TARIFF_SELECTION");
    }
  });

  it("rejects annual rules for an unknown region", () => {
    const changed = structuredClone(candidate);
    changed.rules.annualPaymentRules[0].regionIds = ["UNKNOWN"];
    const result = validateRulePackage(changed);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues.map((item) => item.code)).toContain("ANNUAL_PAYMENT_REGION");
    }
  });
});
