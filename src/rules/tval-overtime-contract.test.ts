import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { RuleTariffPackage } from "./contracts.generated";
import { validateRulePackage } from "./validation";
import { tvalOvertimeIssues } from "./tval-overtime-validation";

function candidate(version = "2026-04"): RuleTariffPackage {
  return JSON.parse(
    readFileSync(
      new URL(`../../rules/packages/reviewed/tval-pflege-tdl/${version}.json`, import.meta.url),
      "utf8",
    ),
  );
}

describe("TVA-L cash-payable overtime contract", () => {
  it.each(["2025-11", "2026-04", "2027-01", "2027-03", "2028-01"])(
    "%s declares the independent training policy without claiming review",
    (version) => {
      const pkg = candidate(version);
      expect(validateRulePackage(pkg).ok).toBe(true);
      expect(pkg.status).toBe("DRAFT");
      expect(pkg.review.reviewedBy).toBeNull();
      expect(pkg.rules.selection!.capabilities.overtime).toBe("SUPPORTED");
      expect(pkg.rules.tvalOvertimePolicy).toEqual({
        hourlyBasis: "TRAINING_TABLE_FULL_TIME",
        monthlyFactorThousandths: 4348,
        rounding: "HOURLY_THEN_PREMIUM_THEN_TOTAL",
        percentageBasisPoints: 3000,
        paymentScope: "CONFIRMED_CASH_PAYABLE_BASE_AND_PREMIUM",
        sourceIds: ["tdl-tval-pflege-2026", "tdl-tv-l-2026"],
      });
    },
  );
  it.each([
    ["referenceStepId", "3"],
    ["maximumBaseStepId", "4"],
    ["hourlyBasis", "KR_STAGE_3"],
    ["rounding", "TOTAL_ONLY"],
    ["paymentScope", "ALL_POSITIVE_BALANCES"],
    ["monthlyFactorThousandths", 0],
    ["percentageBasisPoints", -1],
    ["percentageBasisPoints", 30.5],
    ["sourceIds", []],
    ["sourceIds", ["unknown"]],
  ])("rejects foreign/invalid %s = %j", (key, value) => {
    const raw = JSON.parse(JSON.stringify(candidate()));
    raw.rules.tvalOvertimePolicy[key] = value;
    expect(validateRulePackage(raw).ok).toBe(false);
  });
  it.each(["version", "package", "engine"])("rejects foreign %s", (field) => {
    const pkg = candidate();
    if (field === "version") pkg.engineContractVersion = 12;
    if (field === "package") pkg.packageId = "tvl-kr-tdl";
    if (field === "engine") pkg.rules.selection!.engineId = "tvl-kr-v1";
    expect(tvalOvertimeIssues(pkg).map((issue) => issue.code)).toContain("TVAL_OVERTIME_CONTRACT");
    expect(validateRulePackage(pkg).ok).toBe(false);
  });
  it("accepts old drafts only with truthful missing-policy capabilities", () => {
    const pkg = candidate();
    delete pkg.rules.tvalOvertimePolicy;
    expect(validateRulePackage(pkg).ok).toBe(false);
    pkg.rules.selection!.capabilities.overtime = "UNSUPPORTED";
    expect(validateRulePackage(pkg).ok).toBe(true);
  });
  it("does not silently ignore a policy by claiming unsupported", () => {
    const pkg = candidate();
    pkg.rules.selection!.capabilities.overtime = "UNSUPPORTED";
    expect(validateRulePackage(pkg).ok).toBe(false);
  });
});
