import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { RuleTariffPackage } from "./contracts.generated";
import { validateRulePackage } from "./validation";
import { tvalCareAllowanceIssues } from "./tval-care-allowance-validation";

function candidate(version = "2026-04"): RuleTariffPackage {
  return JSON.parse(
    readFileSync(
      new URL(`../../rules/packages/reviewed/tval-pflege-tdl/${version}.json`, import.meta.url),
      "utf8",
    ),
  );
}

describe("TVA-L Part IV activity allowance contract", () => {
  // Independently transcribed employee rates, not derived from KR package contents.
  it.each([
    ["2025-11", 181],
    ["2026-04", 186],
    ["2027-01", 186],
    ["2027-03", 190],
    ["2028-01", 192],
  ])("%s preserves the training share and dated burn rate %i", (version, burn) => {
    const pkg = candidate(String(version));
    expect(validateRulePackage(pkg).ok).toBe(true);
    expect(pkg.status).toBe("DRAFT");
    expect(pkg.review.reviewedBy).toBeNull();
    expect(pkg.rules.selection!.capabilities.allowances).toBe("UNSUPPORTED");
    expect(pkg.rules.tvalCareAllowancePolicy).toEqual({
      eligibilityRule: "TVAL_PART_IV_NOTES_9_TO_11",
      shareBasisPoints: 5000,
      clinicalLowerMonthlyCents: 9000,
      clinicalHigherMonthlyCents: 15000,
      burnCareFullHourCents: burn,
      burnUnit: "FULL_WORKED_HOURS",
      competition: "HIGHEST_CLINICAL_LESS_MONTH_BURN",
      rounding: "RATE_SHARE_THEN_PERSONAL_THEN_TOTAL",
      sourceIds: [
        "tdl-tval-pflege-2026",
        "tdl-tvl-annex-a-care",
        "tdl-tvl-annex-f-care",
        "tdl-tv-l-2026",
      ],
    });
    expect(pkg.sources.find((s) => s.id === "tdl-tvl-annex-a-care")?.sha256).toBe(
      "e33de71f9abb6c1762a1288a0f742da5e2fc2d860282660c1dfe14b4f3e25bcf",
    );
    expect(pkg.sources.find((s) => s.id === "tdl-tvl-annex-f-care")?.sha256).toBe(
      "800f80cbd4adfbd255a154df891b3049da3c8d2100b5855f8e2875115a019495",
    );
  });
  it.each([
    ["nursingMonthlyCents", 16351],
    ["instructorMonthlyCents", 9149],
    ["leadershipTiers", []],
    ["eligibilityRule", "TVL_PART_IV_V1"],
    ["shareBasisPoints", 0],
    ["shareBasisPoints", 10001],
    ["clinicalLowerMonthlyCents", -1],
    ["clinicalHigherMonthlyCents", 0],
    ["burnCareFullHourCents", 1.86],
    ["burnUnit", "ALL_SHIFT_MINUTES"],
    ["competition", "ADD_ALL"],
    ["rounding", "TOTAL_ONLY"],
    ["sourceIds", []],
    ["sourceIds", ["missing"]],
  ])("rejects unknown/invalid %s", (key, value) => {
    const raw = JSON.parse(JSON.stringify(candidate()));
    raw.rules.tvalCareAllowancePolicy[key] = value;
    expect(validateRulePackage(raw).ok).toBe(false);
  });
  it.each(["version", "package", "engine", "rates"])("rejects semantic drift: %s", (kind) => {
    const pkg = candidate();
    if (kind === "version") pkg.engineContractVersion = 12;
    if (kind === "package") pkg.packageId = "tvl-kr-tdl";
    if (kind === "engine") pkg.rules.selection!.engineId = "tvl-kr-v1";
    if (kind === "rates") pkg.rules.tvalCareAllowancePolicy!.clinicalHigherMonthlyCents = 8999;
    expect(tvalCareAllowanceIssues(pkg).length).toBeGreaterThan(0);
    expect(validateRulePackage(pkg).ok).toBe(false);
  });
  it("preserves older drafts without the optional policy", () => {
    const pkg = candidate();
    delete pkg.rules.tvalCareAllowancePolicy;
    expect(validateRulePackage(pkg).ok).toBe(true);
  });
  it("does not turn the schema addition into complete allowance support", () => {
    const pkg = candidate();
    pkg.rules.selection!.capabilities.allowances = "SUPPORTED";
    expect(validateRulePackage(pkg).ok).toBe(false);
  });
});
