import type { RuleTariffPackage } from "./contracts.generated";
import type { ValidationIssue } from "./validation";

/** Shared semantics for the app and signed catalog publication. */
export function tvalOvertimeIssues(pkg: RuleTariffPackage): ValidationIssue[] {
  const policy = pkg.rules.tvalOvertimePolicy;
  if (!policy) return [];
  const issues: ValidationIssue[] = [];
  const path = "/rules/tvalOvertimePolicy";
  if (
    pkg.engineContractVersion !== 13 ||
    pkg.packageId !== "tval-pflege-tdl" ||
    pkg.rules.selection?.engineId !== "tval-pflege-v1"
  )
    issues.push({
      code: "TVAL_OVERTIME_CONTRACT",
      path,
      message: "Training overtime requires the TVA-L contract.",
    });
  for (const id of policy.sourceIds)
    if (!pkg.sources.some((source) => source.id === id))
      issues.push({
        code: "UNKNOWN_SOURCE_ID",
        path: path + "/sourceIds",
        message: "Unknown source: " + id,
      });
  return issues;
}
