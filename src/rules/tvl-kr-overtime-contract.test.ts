import { describe, expect, it } from "vitest";
import current from "../../rules/packages/reviewed/tvl-kr-tdl/2026-04.json";
import type { RuleTariffPackage } from "./contracts.generated";
import { validateRulePackage } from "./validation";
import { candidate as tvoed } from "@/engine/remuneration-test-fixtures";

const copy = () => structuredClone(current) as RuleTariffPackage;
const codes = (pkg: RuleTariffPackage) => {
  const result = validateRulePackage(pkg);
  return result.ok ? [] : result.issues.map((issue) => issue.code);
};
describe("TV-L/KR overtime policy contract", () => {
  it("has the official group mapping, independent from P groups", () => {
    const pkg = copy(),
      policy = pkg.rules.tvlOvertimePolicy!;
    expect(codes(pkg)).toEqual([]);
    expect(policy.maximumBaseStepId).toBe("4");
    expect(policy.premiumReferenceStepId).toBe("3");
    expect(policy.monthlyFactorThousandths).toBe(4348);
    expect(policy.rounding).toBe("HOURLY_THEN_TOTAL");
    expect(policy.groupRates).toEqual(
      Array.from({ length: 13 }, (_, i) => ({
        groupId: "kr" + (i + 5),
        percentageBasisPoints: i < 8 ? 3000 : 1500,
      })),
    );
  });
  it("accepts old base-only coverage without claiming overtime", () => {
    const pkg = copy();
    delete pkg.rules.tvlOvertimePolicy;
    pkg.rules.selection!.capabilities.overtime = "UNSUPPORTED";
    expect(codes(pkg)).toEqual([]);
  });
  it.each(["missing", "disabled"] as const)("rejects %s capability drift", (mode) => {
    const pkg = copy();
    if (mode === "missing") delete pkg.rules.tvlOvertimePolicy;
    else pkg.rules.selection!.capabilities.overtime = "UNSUPPORTED";
    expect(codes(pkg)).toContain("TVL_KR_COMPONENT_COVERAGE");
  });
  it.each(["duplicate", "missing", "foreign"] as const)("rejects %s groups", (mode) => {
    const pkg = copy(),
      groups = pkg.rules.tvlOvertimePolicy!.groupRates;
    if (mode === "duplicate") groups.push({ ...groups[0] });
    if (mode === "missing") groups.pop();
    if (mode === "foreign") groups[0].groupId = "p5";
    expect(codes(pkg)).toContain("TVL_KR_OVERTIME_GROUPS");
  });
  it.each(["maximumBaseStepId", "premiumReferenceStepId"] as const)("rejects missing %s", (key) => {
    const pkg = copy();
    pkg.rules.tvlOvertimePolicy![key] = "s3";
    expect(codes(pkg)).toContain("TVL_KR_OVERTIME_REFERENCE");
  });
  it("requires referenced sources and a consistent hourly divisor", () => {
    const pkg = copy();
    pkg.rules.tvlOvertimePolicy!.sourceIds = ["unknown"];
    expect(codes(pkg)).toContain("UNKNOWN_SOURCE_ID");
    pkg.rules.tvlOvertimePolicy!.monthlyFactorThousandths = 4000;
    expect(codes(pkg)).toContain("TVL_KR_HOURLY_FACTOR");
  });
  it("rejects the policy on other contracts", () => {
    const pkg = structuredClone(tvoed);
    pkg.rules.tvlOvertimePolicy = copy().rules.tvlOvertimePolicy;
    expect(codes(pkg)).toContain("UNSUPPORTED_TVL_OVERTIME_POLICY");
  });
  it("requires the declared rounding mode and rejects extra fields", () => {
    for (const malformed of [
      { ...copy().rules.tvlOvertimePolicy, rounding: "FINAL_ONLY" },
      { ...copy().rules.tvlOvertimePolicy, executable: "not allowed" },
    ]) {
      const pkg = copy();
      Object.assign(pkg.rules, { tvlOvertimePolicy: malformed });
      expect(validateRulePackage(pkg).ok).toBe(false);
    }
  });
});
