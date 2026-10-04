import { describe, expect, it } from "vitest";
import oldValue from "../../rules/packages/reviewed/tvaoed-pflege-vka/2025-04.json";
import newValue from "../../rules/packages/reviewed/tvaoed-pflege-vka/2026-05.json";
import type { RuleTariffPackage } from "./contracts.generated";
import { validateRulePackage } from "./validation";
import { RULE_CATALOG_SUPPORTED_ENGINE_CONTRACT_VERSIONS } from "./rule-catalog-engine-support";
import { candidate } from "@/engine/remuneration-test-fixtures";

describe("training pay contract", () => {
  it.each([
    "missing",
    "duplicate",
    "table-step",
    "employee-cap",
    "calendar-combination",
    "region",
  ] as const)("rejects invalid training overtime: %s", (change) => {
    const next = structuredClone(newValue) as RuleTariffPackage;
    const rule = next.rules.premiumRules.find((r) => r.premiumType === "OVERTIME")!;
    if (change === "missing")
      next.rules.premiumRules = next.rules.premiumRules.filter((r) => r !== rule);
    if (change === "duplicate") next.rules.premiumRules.push({ ...rule, id: "duplicate-overtime" });
    if (change === "table-step") rule.referenceStepId = "s3";
    if (change === "employee-cap")
      next.rules.overtimeBaseRule = {
        maximumStepId: "s3",
        sourceIds: ["vka-tvaoed-at-2025"],
      };
    if (change === "calendar-combination")
      next.rules.combinationRules[0].memberRuleIds.push(rule.id);
    if (change === "region") rule.conditions.tariffRegions = ["KAV_BW"];
    expect(validateRulePackage(next).ok).toBe(false);
  });
  it.each(["id", "hourly", "employee", "shift", "proration"] as const)(
    "rejects an unsafe special-duty rule: %s",
    (change) => {
      const next = structuredClone(newValue) as RuleTariffPackage;
      const rule = next.rules.allowanceRules.find((entry) => entry.allowanceType === "care")!;
      if (change === "id") rule.id = "employee-care";
      if (change === "hourly") rule.amountKind = "FIXED_HOURLY";
      if (change === "employee") rule.conditions.payGroups = ["p5"];
      if (change === "shift") rule.conditions.allowanceStatuses = ["SHIFT_MONTHLY"];
      if (change === "proration") rule.prorateByPartTime = false;
      expect(validateRulePackage(next).ok).toBe(false);
    },
  );
  it.each(["employee-group", "hourly-part-time", "wrong-status"] as const)(
    "rejects an invalid training allowance: %s",
    (change) => {
      const next = structuredClone(newValue) as RuleTariffPackage;
      const rule = next.rules.allowanceRules.find((entry) => entry.amountKind === "FIXED_HOURLY")!;
      if (change === "employee-group") rule.conditions.payGroups = ["p5"];
      if (change === "hourly-part-time") rule.prorateByPartTime = true;
      if (change === "wrong-status") rule.conditions.allowanceStatuses = ["ALTERNATING_MONTHLY"];
      expect(validateRulePackage(next).ok).toBe(false);
    },
  );
  it.each([oldValue, newValue])(
    "validates the real draft $versionId without claiming approval",
    (value) => {
      expect(validateRulePackage(value)).toMatchObject({ ok: true });
      expect(value.engineContractVersion).toBe(10);
      expect(value.review).toEqual({
        status: "DRAFT",
        reviewedBy: null,
        reviewedAt: null,
        gitCommit: null,
      });
      expect(value.rules.selection.employmentKind).toBe("APPRENTICE");
      expect(value.rules.trainingPay.minimumNightHourlyCents).toBe(128);
      expect(RULE_CATALOG_SUPPORTED_ENGINE_CONTRACT_VERSIONS).toContain(10);
    },
  );
  it("rejects training metadata hidden inside the previous contract", () => {
    expect(validateRulePackage({ ...newValue, engineContractVersion: 8 }).ok).toBe(false);
    expect(validateRulePackage({ ...candidate, engineContractVersion: 10 }).ok).toBe(false);
  });
  it.each([
    "employee-step",
    "missing-type",
    "duplicate-type",
    "employee-condition",
    "stack-calendar",
    "drop-night-stack",
  ] as const)("rejects invalid training premiums: %s", (change) => {
    const next = structuredClone(newValue) as RuleTariffPackage;
    if (change === "employee-step") {
      next.rules.premiumRules[0].rateBasis = "TABLE_STEP";
      next.rules.premiumRules[0].referenceStepId = "s3";
    }
    if (change === "missing-type")
      next.rules.premiumRules = next.rules.premiumRules.filter(
        (rule) => rule.premiumType !== "NIGHT",
      );
    if (change === "duplicate-type")
      next.rules.premiumRules.push({
        ...next.rules.premiumRules[0],
        id: "another-night",
      });
    if (change === "employee-condition") next.rules.premiumRules[0].conditions.payGroups = ["p5"];
    if (change === "stack-calendar") next.rules.combinationRules[0].mode = "STACK";
    if (change === "drop-night-stack") next.rules.combinationRules[0].memberRuleIds.push("night");
    expect(validateRulePackage(next).ok).toBe(false);
  });
  it.each([
    "missing-row",
    "extra-year",
    "duplicate-category",
    "unknown-source",
    "employee",
  ] as const)("rejects %s instead of inventing a complete training table", (change) => {
    const next = structuredClone(newValue) as RuleTariffPackage;
    if (change === "missing-row") next.rules.payTables[0].entries.pop();
    if (change === "extra-year")
      next.rules.payTables[0].entries.push({ groupId: "b", stepId: "s4", monthlyCents: 1 });
    if (change === "duplicate-category")
      next.rules.trainingPay!.categories.push(next.rules.trainingPay!.categories[0]);
    if (change === "unknown-source") next.rules.trainingPay!.categories[0].sourceIds = ["missing"];
    if (change === "employee") next.rules.selection!.employmentKind = "EMPLOYEE";
    expect(validateRulePackage(next).ok).toBe(false);
  });
});
