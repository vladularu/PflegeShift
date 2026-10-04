import { Temporal } from "@js-temporal/polyfill";
import type { RuleTariffPackage } from "./contracts.generated";
import type { ValidationIssue } from "./validation";
import { tvalShiftAllowanceIssues } from "./tval-shift-allowance-validation";
import { tvalTimePremiumIssues } from "./tval-time-premium-validation";
import { tvalOvertimeIssues } from "./tval-overtime-validation";
import { tvalCareAllowanceIssues } from "./tval-care-allowance-validation";

/** TVA-L Pflege is a separate contract. Never accept a VKA payload by renaming it. */
export function tvalTrainingIssues(pkg: RuleTariffPackage): ValidationIssue[] {
  const issues: ValidationIssue[] = [
    ...tvalShiftAllowanceIssues(pkg),
    ...tvalTimePremiumIssues(pkg),
    ...tvalOvertimeIssues(pkg),
    ...tvalCareAllowanceIssues(pkg),
  ];
  const add = (code: string, path: string, message: string) => issues.push({ code, path, message });
  const {
    tvalTrainingPay: training,
    selection,
    selector,
    employmentWorkingTimeRules: times,
  } = pkg.rules;
  if (pkg.engineContractVersion !== 13) {
    if (training !== undefined)
      add(
        "UNSUPPORTED_TVAL_TRAINING",
        "/rules/tvalTrainingPay",
        "TVA-L training requires contract 13.",
      );
    return issues;
  }
  if (
    pkg.packageId !== "tval-pflege-tdl" ||
    selector.agreementId !== "tva-l-pflege" ||
    selection?.familyId !== "tval-pflege" ||
    selection.engineId !== "tval-pflege-v1" ||
    selection.employmentKind !== "APPRENTICE"
  )
    add(
      "TVAL_IDENTITY",
      "/rules/selection",
      "Contract 13 requires the explicit TVA-L Pflege identity.",
    );
  const parts = "specialPartId" in selector ? [selector.specialPartId] : selector.specialPartIds;
  if (
    parts.length !== 1 ||
    parts[0] !== "pflege" ||
    selection?.variants.length !== 1 ||
    selection.variants[0]?.id !== "CARE" ||
    selection.variants[0]?.specialPartId !== "pflege"
  )
    add("TVAL_VARIANT", "/rules/selection/variants", "TVA-L Pflege needs its own CARE variant.");
  if (
    selection?.capabilities.basePay !== "SUPPORTED" ||
    selection?.capabilities.annualPayment !==
      (pkg.rules.annualPaymentRules ? "SUPPORTED" : "UNSUPPORTED") ||
    selection?.capabilities.timePremiums !==
      (pkg.rules.tvalTimePremiumPolicy ? "SUPPORTED" : "UNSUPPORTED") ||
    selection?.capabilities.overtime !==
      (pkg.rules.tvalOvertimePolicy ? "SUPPORTED" : "UNSUPPORTED") ||
    selection?.capabilities.allowances !== "UNSUPPORTED"
  )
    add(
      "TVAL_COMPONENT_COVERAGE",
      "/rules/selection/capabilities",
      "Only implemented components may be advertised.",
    );
  if (!training) {
    add(
      "TVAL_TRAINING_MISSING",
      "/rules/tvalTrainingPay",
      "Explicit training categories are required.",
    );
    return issues;
  }
  if (
    pkg.rules.trainingPay !== undefined ||
    pkg.rules.hourlyCalculation !== undefined ||
    pkg.rules.overtimeBaseRule !== undefined ||
    pkg.rules.weeklyWorkingTimeRules !== undefined ||
    [
      pkg.rules.premiumRules,
      pkg.rules.allowanceRules,
      pkg.rules.combinationRules,
      pkg.rules.workPatternRules,
    ].some((v) => v.length)
  )
    add(
      "TVAL_FOREIGN_RULES",
      "/rules",
      "Foreign or unimplemented remuneration rules are not allowed.",
    );
  const sources = new Set(pkg.sources.map((s) => s.id));
  const checkSources = (ids: readonly string[], path: string) => {
    for (const id of ids)
      if (!sources.has(id)) add("UNKNOWN_SOURCE_ID", path, "Unknown source: " + id);
  };
  checkSources(training.sourceIds, "/rules/tvalTrainingPay/sourceIds");
  const expectedGroups = pkg.validFrom < "2027-01-01" ? ["regular"] : ["regular", "assistant"];
  if (pkg.validFrom < "2027-01-01" && (pkg.validTo === null || pkg.validTo >= "2027-01-01"))
    add(
      "TVAL_CATEGORY_BOUNDARY",
      "/validTo",
      "Split package coverage at the 2027 training-category change.",
    );
  const pairs = new Set<string>();
  if (
    training.categories.length !== expectedGroups.length ||
    expectedGroups.some((id) => training.categories.filter((c) => c.groupId === id).length !== 1)
  )
    add(
      "TVAL_CATEGORIES",
      "/rules/tvalTrainingPay/categories",
      "Categories must match their dated legal scope.",
    );
  for (const category of training.categories) {
    const expected = category.groupId === "regular" ? ["1", "2", "3"] : ["1", "2"];
    if (
      category.periodKind !==
        (category.groupId === "regular" ? "TRAINING_YEAR" : "TRAINING_MONTH_BRACKET") ||
      category.levels.length !== expected.length ||
      expected.some((id) => category.levels.filter((l) => l.id === id).length !== 1)
    )
      add(
        "TVAL_LEVELS",
        "/rules/tvalTrainingPay/categories",
        "Regular years and assistant month brackets must remain distinct.",
      );
    for (const level of category.levels) pairs.add(category.groupId + ":" + level.id);
    checkSources(category.sourceIds, "/rules/tvalTrainingPay/categories/sourceIds");
  }
  const table = pkg.rules.payTables[0];
  if (pkg.rules.payTables.length !== 1 || table?.id !== selector.payTableId)
    add("TVAL_TABLE", "/rules/payTables", "Exactly one selected training table is required.");
  for (const entry of table?.entries ?? []) {
    if (!pairs.delete(entry.groupId + ":" + entry.stepId) || entry.monthlyCents <= 0)
      add(
        "TVAL_TABLE_CELL",
        "/rules/payTables",
        "Unknown, duplicate or non-positive training amount.",
      );
  }
  if (pairs.size)
    add(
      "TVAL_TABLE_INCOMPLETE",
      "/rules/payTables",
      "Every declared training period needs one amount.",
    );
  const regions = selection?.variants[0]?.regions.map((r) => r.id) ?? [];
  if (
    regions.length !== 3 ||
    ["WEST_38_5", "EAST", "EAST_UNIVERSITY_HOSPITAL"].some((id) => !regions.includes(id))
  )
    add(
      "TVAL_REGIONS",
      "/rules/selection/variants/regions",
      "Require explicit supported training working-time regions.",
    );
  const date = (s: string): boolean => {
    try {
      return Temporal.PlainDate.from(s).toString() === s;
    } catch {
      return false;
    }
  };
  const after = (s: string | null) =>
    s === null ? null : Temporal.PlainDate.from(s).add({ days: 1 }).toString();
  if (!date(pkg.validFrom) || (pkg.validTo !== null && !date(pkg.validTo))) return issues;
  const seen = new Set<string>();
  for (const t of times ?? []) {
    checkSources(t.sourceIds, "/rules/employmentWorkingTimeRules/sourceIds");
    if (seen.has(t.id) || t.variantId !== "CARE" || !regions.includes(t.regionId))
      add(
        "TVAL_WORKING_TIME_IDENTITY",
        "/rules/employmentWorkingTimeRules",
        "Duplicate or foreign working-time rule.",
      );
    seen.add(t.id);
  }
  for (const region of regions) {
    let next: string | null = pkg.validFrom;
    const rows = (times ?? [])
      .filter((t) => t.regionId === region)
      .sort((a, b) => a.validFrom.localeCompare(b.validFrom));
    let valid = rows.length > 0;
    for (const t of rows) {
      if (
        !date(t.validFrom) ||
        (t.validTo !== null && (!date(t.validTo) || t.validTo < t.validFrom))
      ) {
        valid = false;
        continue;
      }
      if (next === null || t.validFrom !== next) valid = false;
      next = after(t.validTo);
    }
    if (!valid || next !== after(pkg.validTo))
      add(
        "TVAL_WORKING_TIME_COVERAGE",
        "/rules/employmentWorkingTimeRules",
        "Working time must cover every package day exactly once per region.",
      );
  }
  return issues;
}
