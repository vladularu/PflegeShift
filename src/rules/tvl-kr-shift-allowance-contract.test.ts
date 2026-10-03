import { describe, expect, it } from "vitest";
import oldValue from "../../rules/packages/reviewed/tvl-kr-tdl/2025-11.json";
import currentValue from "../../rules/packages/reviewed/tvl-kr-tdl/2026-04.json";
import nextValue from "../../rules/packages/reviewed/tvl-kr-tdl/2027-03.json";
import futureValue from "../../rules/packages/reviewed/tvl-kr-tdl/2028-01.json";
import type { RuleTariffPackage } from "./contracts.generated";
import { validateRulePackage } from "./validation";
import { candidate } from "@/engine/remuneration-test-fixtures";

const copy = () => structuredClone(currentValue) as RuleTariffPackage;
const codes = (pkg: RuleTariffPackage) => {
  const result = validateRulePackage(pkg);
  return result.ok ? [] : result.issues.map((issue) => issue.code);
};
describe("dated TV-L shift allowance contract", () => {
  it.each([oldValue, currentValue, nextValue, futureValue])(
    "validates package $versionId without claiming complete allowances",
    (value) => {
      const pkg = value as RuleTariffPackage;
      expect(codes(pkg)).toEqual([]);
      expect(pkg.rules.selection!.capabilities.allowances).toBe("UNSUPPORTED");
      for (const p of pkg.rules.tvlShiftAllowancePolicy!.periods)
        expect([
          p.shiftMonthlyCents,
          p.shiftHourlyCents,
          p.alternatingMonthlyCents,
          p.alternatingHourlyCents,
        ]).toEqual(p.validFrom < "2026-07-01" ? [6000, 24, 15000, 63] : [10000, 60, 25000, 149]);
    },
  );
  it.each(["gap", "overlap", "duplicate", "outside", "invalid", "open"] as const)(
    "rejects %s coverage",
    (mode) => {
      const pkg = copy(),
        periods = pkg.rules.tvlShiftAllowancePolicy!.periods;
      if (mode === "gap") periods[1].validFrom = "2026-07-02";
      if (mode === "overlap") periods[1].validFrom = "2026-06-30";
      if (mode === "duplicate") periods.push({ ...periods[0] });
      if (mode === "outside") periods[0].validFrom = "2026-03-31";
      if (mode === "invalid") periods[0].validTo = "2026-02-30";
      if (mode === "open") periods[1].validTo = null;
      expect(codes(pkg)).toContain("TVL_KR_SHIFT_ALLOWANCE_COVERAGE");
    },
  );
  it("requires sources, rejects foreign contracts, permits older unsupported drafts", () => {
    const pkg = copy();
    pkg.rules.tvlShiftAllowancePolicy!.sourceIds = ["missing"];
    expect(codes(pkg)).toContain("UNKNOWN_SOURCE_ID");
    const other = structuredClone(candidate);
    other.rules.tvlShiftAllowancePolicy = copy().rules.tvlShiftAllowancePolicy;
    expect(codes(other)).toContain("UNSUPPORTED_TVL_SHIFT_ALLOWANCE_POLICY");
    delete pkg.rules.tvlShiftAllowancePolicy;
    expect(codes(pkg)).toEqual([]);
  });
});
