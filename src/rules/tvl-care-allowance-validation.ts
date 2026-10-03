import type { RuleTariffPackage } from "./contracts.generated";
import type { ValidationIssue } from "./validation";

/** The rule id fixes the eligibility procedure; amounts remain versioned catalogue data. */
export function tvlCareAllowanceIssues(pkg: RuleTariffPackage): ValidationIssue[] {
  const policy = pkg.rules.tvlCareAllowancePolicy;
  if (!policy) return [];
  const path = "/rules/tvlCareAllowancePolicy";
  const issues: ValidationIssue[] = [];
  const add = (code: string, message: string) => issues.push({ code, path, message });
  if (pkg.engineContractVersion !== 12 || pkg.packageId !== "tvl-kr-tdl")
    add("UNSUPPORTED_TVL_CARE_ALLOWANCE_POLICY", "Care allowances require the TV-L/KR contract.");
  const sources = new Set(pkg.sources.map((source) => source.id));
  for (const id of policy.sourceIds)
    if (!sources.has(id)) add("UNKNOWN_SOURCE_ID", "Unknown care allowance source.");
  // Table IV numbers 2–7 correspond to thresholds fixed by Part IV section 2 note 9.
  const thresholds = new Map([
    [2, 900],
    [3, 600],
    [4, 300],
    [5, 150],
    [6, 75],
    [7, 0],
  ]);
  for (const tier of policy.leadershipTiers) {
    if (thresholds.get(tier.annexFNumber) !== tier.minimumNursingStaff)
      add("TVL_KR_CARE_LEADERSHIP_TIERS", "Duplicate or incorrect leadership threshold.");
    thresholds.delete(tier.annexFNumber);
  }
  if (thresholds.size)
    add("TVL_KR_CARE_LEADERSHIP_TIERS", "Incomplete leadership threshold coverage.");
  const sorted = [...policy.leadershipTiers].sort(
    (a, b) => a.minimumNursingStaff - b.minimumNursingStaff,
  );
  if (sorted.some((tier, i) => i > 0 && tier.monthlyCents < sorted[i - 1].monthlyCents))
    add("TVL_KR_CARE_RATE_ORDER", "Leadership amounts must not decrease with staff size.");
  if (policy.clinicalLowerMonthlyCents > policy.clinicalHigherMonthlyCents)
    add("TVL_KR_CARE_RATE_ORDER", "The higher clinical rate cannot be lower.");
  return issues;
}
