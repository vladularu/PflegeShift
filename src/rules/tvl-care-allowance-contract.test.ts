import { describe, expect, it } from "vitest";
import oldValue from "../../rules/packages/reviewed/tvl-kr-tdl/2025-11.json";
import currentValue from "../../rules/packages/reviewed/tvl-kr-tdl/2026-04.json";
import nextValue from "../../rules/packages/reviewed/tvl-kr-tdl/2027-03.json";
import futureValue from "../../rules/packages/reviewed/tvl-kr-tdl/2028-01.json";
import { candidate } from "@/engine/remuneration-test-fixtures";
import type { RuleTariffPackage } from "./contracts.generated";
import { validateRulePackage } from "./validation";

const copy = () => structuredClone(currentValue) as RuleTariffPackage;
const codes = (pkg: RuleTariffPackage) => {
  const result = validateRulePackage(pkg);
  return result.ok ? [] : result.issues.map((issue) => issue.code);
};

describe("TV-L/KR care allowance catalogue contract", () => {
  // Independent transcription of Anlage F IV, page 4, rows 1–9.
  it.each([
    [oldValue, [181, 62536, 58028, 53813, 49902, 46301, 42969, 15906, 8900]],
    [currentValue, [186, 64287, 59653, 55320, 51299, 47597, 44172, 16351, 9149]],
    [nextValue, [190, 65573, 60846, 56426, 52325, 48549, 45055, 16678, 9332]],
    [futureValue, [192, 66229, 61454, 56990, 52848, 49034, 45506, 16845, 9425]],
  ] as const)("contains all nine reference amounts for $0.versionId", (value, expected) => {
    const pkg = value as RuleTariffPackage;
    expect(codes(pkg)).toEqual([]);
    const p = pkg.rules.tvlCareAllowancePolicy!;
    expect([
      p.burnCareFullHourCents,
      ...[...p.leadershipTiers]
        .sort((a, b) => a.annexFNumber - b.annexFNumber)
        .map((tier) => tier.monthlyCents),
      p.nursingMonthlyCents,
      p.instructorMonthlyCents,
    ]).toEqual(expected);
    expect(p.leadershipTiers.map((tier) => tier.minimumNursingStaff)).toEqual([
      900, 600, 300, 150, 75, 0,
    ]);
    expect([p.clinicalLowerMonthlyCents, p.clinicalHigherMonthlyCents]).toEqual([9000, 15000]);
    expect(p.functionMonthlyCents).toBe(4500); // §43 Nr.8; not indexed with Anlage F.
    expect(p.sourceIds).toContain("tdl-tv-l-2026");
    expect(pkg.sources.find((source) => source.id === "tdl-tv-l-2026")?.section).toContain("Nr. 8");
    expect(pkg.rules.selection!.capabilities.allowances).toBe("UNSUPPORTED");
    expect(pkg.review.status).toBe("DRAFT");
    expect(pkg.review.reviewedBy).toBeNull();
    expect(p.sourceIds).toContain("tdl-tvl-annex-a-care");
    expect(p.sourceIds).toContain("tdl-tvl-annex-f-care");
  });

  it.each(["threshold", "duplicate", "missing", "reverse-rate", "clinical-order"] as const)(
    "rejects ambiguous %s data",
    (mode) => {
      const pkg = copy();
      const p = pkg.rules.tvlCareAllowancePolicy!;
      if (mode === "threshold") p.leadershipTiers[0].minimumNursingStaff = 901;
      if (mode === "duplicate") p.leadershipTiers[0] = { ...p.leadershipTiers[1] };
      if (mode === "missing") p.leadershipTiers.pop();
      if (mode === "reverse-rate") p.leadershipTiers[0].monthlyCents = 1;
      if (mode === "clinical-order") p.clinicalLowerMonthlyCents = p.clinicalHigherMonthlyCents + 1;
      expect(validateRulePackage(pkg).ok).toBe(false);
    },
  );
  it.each(["negative", "fractional", "excessive", "missing-field", "unknown-procedure"] as const)(
    "rejects %s schema data",
    (mode) => {
      const pkg = copy();
      const p = pkg.rules.tvlCareAllowancePolicy!;
      if (mode === "negative") p.burnCareFullHourCents = -1;
      if (mode === "fractional") p.nursingMonthlyCents = 163.51;
      if (mode === "excessive") p.instructorMonthlyCents = 1000001;
      if (mode === "missing-field") Reflect.deleteProperty(p, "instructorMonthlyCents");
      if (mode === "unknown-procedure") Object.assign(p, { eligibilityRule: "AUTOMATIC_ALL_KR" });
      expect(validateRulePackage(pkg).ok).toBe(false);
    },
  );
  it("requires resolvable sources", () => {
    const pkg = copy();
    pkg.rules.tvlCareAllowancePolicy!.sourceIds.push("missing");
    expect(codes(pkg)).toContain("UNKNOWN_SOURCE_ID");
  });
  it.each([-1, 0.5, 1000001, null, "4500"])("rejects invalid function rate %s", (rate) => {
    const pkg = copy();
    Object.assign(pkg.rules.tvlCareAllowancePolicy!, { functionMonthlyCents: rate });
    expect(validateRulePackage(pkg).ok).toBe(false);
  });
  it("accepts older care contracts without a function rate, without fabricating a value", () => {
    const pkg = copy();
    delete pkg.rules.tvlCareAllowancePolicy!.functionMonthlyCents;
    expect(codes(pkg)).toEqual([]);
  });
  it("does not inject KR data into a foreign tariff contract", () => {
    const pkg = structuredClone(candidate);
    pkg.rules.tvlCareAllowancePolicy = copy().rules.tvlCareAllowancePolicy;
    expect(codes(pkg)).toContain("UNSUPPORTED_TVL_CARE_ALLOWANCE_POLICY");
  });
  it("keeps previous incomplete drafts readable without invented care support", () => {
    const pkg = copy();
    delete pkg.rules.tvlCareAllowancePolicy;
    expect(codes(pkg)).toEqual([]);
    expect(pkg.rules.selection!.capabilities.allowances).toBe("UNSUPPORTED");
  });
  it("accepts unordered tiers and future rate updates without hardcoding the table into code", () => {
    const pkg = copy();
    const p = pkg.rules.tvlCareAllowancePolicy!;
    p.nursingMonthlyCents = 17000;
    p.instructorMonthlyCents = 9900;
    p.functionMonthlyCents = 6000;
    p.leadershipTiers.reverse();
    p.leadershipTiers.forEach((tier) => {
      tier.monthlyCents += 100;
    });
    expect(codes(pkg)).toEqual([]);
  });
});
