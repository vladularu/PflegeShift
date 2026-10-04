import { describe, expect, it, jest } from "@jest/globals";
import { resolver, shift, work } from "@/engine/remuneration-test-fixtures";
import { createRuleResolver } from "@/rules/rule-resolver";
import { calculateMonthlyAnalysis } from "./monthly-analysis";

describe("monthly work and compliance inputs are pay-independent", () => {
  it("never resolves a tariff or returns legacy pay during work-time analysis", () => {
    const resolveTariff = jest.fn((): never => {
      throw new Error("Unexpected pay calculation");
    });
    const result = calculateMonthlyAnalysis("2026-09", [shift()], work, {
      ...resolver(),
      resolveTariff,
    });
    expect(resolveTariff).not.toHaveBeenCalled();
    expect(result).not.toHaveProperty("pay");
    expect(result.summary.ok).toBe(true);
    expect(result.complianceShifts.ok).toBe(true);
    expect(result.shiftTypeAnalysis.totalMinutes).toBe(120);
  });
  it("retains the identical work-time result when tariff packages are absent", () => {
    const entries = [shift()];
    const complete = calculateMonthlyAnalysis("2026-09", entries, work, resolver());
    const noTariff = calculateMonthlyAnalysis("2026-09", entries, work, resolver([]));
    expect(noTariff).toEqual(complete);
  });
  it("retains counted shifts and timed hours when holiday coverage is missing", () => {
    const noRules = createRuleResolver({ tariff: [], legal: [], holiday: [] });
    const result = calculateMonthlyAnalysis("2026-09", [shift()], work, noRules);
    expect(result.summary.ok).toBe(false);
    expect(result.complianceShifts.ok).toBe(false);
    expect(result.shiftTypeAnalysis.totalCount).toBe(1);
    expect(result.shiftTypeAnalysis.totalMinutes).toBe(120);
    expect(result).not.toHaveProperty("pay");
  });
});
