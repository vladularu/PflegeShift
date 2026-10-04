import type { RuleTariffPackage } from "./contracts.generated";
import type { ValidationIssue } from "./validation";

/** Do not reinterpret employee care/leadership allowances as training entitlements. */
export function tvalCareAllowanceIssues(pkg: RuleTariffPackage): ValidationIssue[] {
  const policy = pkg.rules.tvalCareAllowancePolicy;
  if (!policy) return [];
  const issues: ValidationIssue[] = [];
  const path = "/rules/tvalCareAllowancePolicy";
  const add = (code: string, message: string) => issues.push({ code, path, message });
  if (
    pkg.engineContractVersion !== 13 ||
    pkg.packageId !== "tval-pflege-tdl" ||
    pkg.rules.selection?.engineId !== "tval-pflege-v1"
  )
    add("TVAL_CARE_CONTRACT", "Activity allowances require the TVA-L training contract.");
  for (const id of policy.sourceIds)
    if (!pkg.sources.some((source) => source.id === id))
      add("UNKNOWN_SOURCE_ID", "Unknown activity-allowance source: " + id);
  if (policy.clinicalLowerMonthlyCents > policy.clinicalHigherMonthlyCents)
    add("TVAL_CARE_RATE_ORDER", "The higher clinical rate cannot be lower.");
  return issues;
}
