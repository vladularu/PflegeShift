import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import oldRaw from "../../rules/packages/reviewed/tvoed-vka-sue-bt-b/2025-04-01-draft1.json";
import currentRaw from "../../rules/packages/reviewed/tvoed-vka-sue-bt-b/2026-05-01-draft1.json";
import type { RuleTariffPackage } from "./contracts.generated";
import { RULE_CATALOG_SUPPORTED_ENGINE_CONTRACT_VERSIONS } from "./rule-catalog-engine-support";
import { validateRulePackage } from "./validation";

const periods = [
  {
    period: "2025-04",
    pkg: oldRaw as RuleTariffPackage,
    sha256: "405e15ef6e9c626122243ec10ce142a15bd226125ae176088dd59b98fe33609d",
    validFrom: "2025-04-01",
    validTo: "2026-04-30",
    s18Stage1: 459195,
    s2Stage6: 334795,
  },
  {
    period: "2026-05",
    pkg: currentRaw as RuleTariffPackage,
    sha256: "0dbac9ad287d44f9bfb7adb446539cd9652bf508e0fae4b897350745e3d29181",
    validFrom: "2026-05-01",
    validTo: "2027-03-31",
    s18Stage1: 472052,
    s2Stage6: 344169,
  },
] as const;

function transcribedCells(period: string) {
  const path = fileURLToPath(
    new URL(`../../docs/tvoed-vka-sue-bt-b-${period}.csv`, import.meta.url),
  );
  const bytes = readFileSync(path);
  const [, ...rows] = bytes.toString("utf8").trim().split(/\r?\n/u);
  return {
    digest: createHash("sha256").update(bytes).digest("hex"),
    entries: rows.flatMap((row) => {
      const [groupId, ...amounts] = row.split(";");
      return amounts.map((amount, index) => ({
        groupId,
        stepId: `s${index + 1}`,
        monthlyCents: Number(amount.replace(".", "").replace(",", "")),
      }));
    }),
  };
}

describe("TVöD-VKA SuE BT-B Anlage C source candidates", () => {
  it.each(periods)("preserves every printed cell in the $period table", (period) => {
    const { pkg } = period;
    const source = transcribedCells(period.period);
    expect(source.digest).toBe(period.sha256);
    expect(validateRulePackage(pkg)).toEqual({ ok: true, value: pkg });
    expect(pkg).toMatchObject({
      packageId: "tvoed-vka-sue-bt-b",
      engineContractVersion: 18,
      status: "DRAFT",
      validFrom: period.validFrom,
      validTo: period.validTo,
    });
    expect(pkg.rules.payTables[0].entries).toHaveLength(96);
    expect(pkg.rules.payTables[0].entries).toEqual(source.entries);
    expect(pkg.rules.payTables[0].entries[0].monthlyCents).toBe(period.s18Stage1);
    expect(pkg.rules.payTables[0].entries.at(-1)?.monthlyCents).toBe(period.s2Stage6);
    expect(pkg.rules.payTables[0].entries.some((entry) => entry.groupId === "s10")).toBe(false);
    expect(pkg.rules.payTables[0].entries.some((entry) => entry.groupId === "s6")).toBe(false);
    expect(pkg.rules.payTables[0].entries.some((entry) => entry.groupId === "s5")).toBe(false);
    expect(Object.values(pkg.rules.selection!.capabilities)).toEqual(Array(5).fill("UNSUPPORTED"));
    expect(RULE_CATALOG_SUPPORTED_ENGINE_CONTRACT_VERSIONS).not.toContain(18);
  });

  it("rejects missing or invented cells and wrong BT identity", () => {
    const missing = structuredClone(currentRaw) as RuleTariffPackage;
    missing.rules.payTables[0].entries.splice(0, 1);
    const missingResult = validateRulePackage(missing);
    expect(missingResult.ok).toBe(false);
    if (!missingResult.ok)
      expect(missingResult.issues.map((issue) => issue.code)).toContain("TVOED_SUE_MISSING_CELL");

    const invented = structuredClone(currentRaw) as RuleTariffPackage;
    invented.rules.payTables[0].entries.push({ groupId: "s10", stepId: "s1", monthlyCents: 100 });
    const inventedResult = validateRulePackage(invented);
    expect(inventedResult.ok).toBe(false);
    if (!inventedResult.ok)
      expect(inventedResult.issues.map((issue) => issue.code)).toContain("TVOED_SUE_CELL");

    const wrong = structuredClone(currentRaw) as RuleTariffPackage;
    if (!("specialPartId" in wrong.rules.selector)) throw new Error("Expected BT-B selector.");
    wrong.rules.selector.specialPartId = "bt-k";
    const wrongResult = validateRulePackage(wrong);
    expect(wrongResult.ok).toBe(false);
    if (!wrongResult.ok)
      expect(wrongResult.issues.map((issue) => issue.code)).toContain("TVOED_SUE_IDENTITY");
  });

  it("rejects a draft that claims reviewed or executable pay", () => {
    const executable = structuredClone(currentRaw) as RuleTariffPackage;
    executable.rules.selection!.capabilities.basePay = "SUPPORTED";
    const result = validateRulePackage(executable);
    expect(result.ok).toBe(false);
    if (!result.ok)
      expect(result.issues.map((issue) => issue.code)).toContain("TVOED_SUE_NOT_ACTIVATABLE");

    const reviewed = structuredClone(currentRaw) as RuleTariffPackage;
    reviewed.status = "REVIEWED";
    const reviewedResult = validateRulePackage(reviewed);
    expect(reviewedResult.ok).toBe(false);
    if (!reviewedResult.ok)
      expect(reviewedResult.issues.map((issue) => issue.code)).toContain(
        "TVOED_SUE_NOT_ACTIVATABLE",
      );
  });

  it("rejects missing, inflated or misclassified SuE allowance rules", () => {
    const missing = structuredClone(currentRaw) as RuleTariffPackage;
    delete missing.rules.tvoedSueAllowancePolicy;
    const missingResult = validateRulePackage(missing);
    expect(missingResult.ok).toBe(false);
    if (!missingResult.ok)
      expect(missingResult.issues.map((issue) => issue.code)).toContain(
        "TVOED_SUE_ALLOWANCE_POLICY",
      );

    const invented = structuredClone(currentRaw) as RuleTariffPackage;
    invented.rules.tvoedSueAllowancePolicy!.bands[0].monthlyCents = 25000;
    const inventedResult = validateRulePackage(invented);
    expect(inventedResult.ok).toBe(false);
    if (!inventedResult.ok)
      expect(inventedResult.issues.map((issue) => issue.code)).toContain(
        "TVOED_SUE_ALLOWANCE_POLICY",
      );

    const wrongCase = structuredClone(currentRaw) as RuleTariffPackage;
    wrongCase.rules.tvoedSueAllowancePolicy!.bands[2].caseGroup = null;
    const caseResult = validateRulePackage(wrongCase);
    expect(caseResult.ok).toBe(false);
    if (!caseResult.ok)
      expect(caseResult.issues.map((issue) => issue.code)).toContain("TVOED_SUE_ALLOWANCE_POLICY");
  });
});
