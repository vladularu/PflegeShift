import { Temporal } from "@js-temporal/polyfill";
import type { RuleTariffPackage } from "./contracts.generated";
import type { ValidationIssue } from "./validation";

/** Semantic checks shared by app loading and catalog publication. */
export function tvalTimePremiumIssues(pkg: RuleTariffPackage): ValidationIssue[] {
  const policy = pkg.rules.tvalTimePremiumPolicy;
  if (!policy) return [];
  const issues: ValidationIssue[] = [];
  const root = "/rules/tvalTimePremiumPolicy";
  const add = (code: string, path: string, message: string) => issues.push({ code, path, message });
  if (
    pkg.engineContractVersion !== 13 ||
    pkg.packageId !== "tval-pflege-tdl" ||
    pkg.rules.selection?.engineId !== "tval-pflege-v1"
  )
    add("TVAL_PREMIUM_CONTRACT", root, "Training premiums require the TVA-L contract.");
  // This contract intentionally has no legacy night minimum (removed October 2023).
  if (pkg.validFrom < "2023-10-01")
    add("TVAL_PREMIUM_DATE", root, "Earlier coverage requires the historical night-minimum rule.");
  const sources = new Set(pkg.sources.map((source) => source.id));
  for (const id of policy.sourceIds)
    if (!sources.has(id)) add("UNKNOWN_SOURCE_ID", root + "/sourceIds", "Unknown source: " + id);
  for (const window of [policy.nightWindow, policy.preHolidayWindow, policy.saturdayWindow])
    if (window.startMinute === window.endMinute)
      add("TVAL_PREMIUM_WINDOW", root, "Empty or ambiguous premium window.");
  for (const day of policy.preHolidayMonthDays) {
    try {
      if (Temporal.PlainDate.from("2000-" + day).toString() !== "2000-" + day) throw new Error();
    } catch {
      add("TVAL_PREMIUM_MONTH_DAY", root + "/preHolidayMonthDays", "Invalid recurring date.");
    }
  }
  if (policy.holidayWithoutTimeOffBasisPoints < policy.holidayWithTimeOffBasisPoints)
    add("TVAL_PREMIUM_HOLIDAY", root, "Holiday time-off rates are reversed.");
  return issues;
}
