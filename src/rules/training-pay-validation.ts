import type { RuleTariffPackage } from "./contracts.generated";
import type { ValidationIssue } from "./validation";

/** Contract 10 adds explicit training categories; it cannot be disguised as employee pay. */
export function trainingPayIssues(rulePackage: RuleTariffPackage): ValidationIssue[] {
  const { trainingPay, selection, payTables, selector } = rulePackage.rules;
  const issues: ValidationIssue[] = [];
  const add = (code: string, path: string, message: string) => issues.push({ code, path, message });
  if (
    rulePackage.engineContractVersion !== 10 &&
    !(rulePackage.engineContractVersion === 11 && selection?.employmentKind === "APPRENTICE")
  ) {
    if (trainingPay !== undefined)
      add(
        "UNSUPPORTED_TRAINING_PAY",
        "/rules/trainingPay",
        "Training pay requires training contract 10 or 11.",
      );
    return issues;
  }
  if (!trainingPay || selection?.employmentKind !== "APPRENTICE") {
    add(
      "MISSING_TRAINING_PAY",
      "/rules/trainingPay",
      "Training contracts 10 and 11 require training pay and APPRENTICE selection.",
    );
    return issues;
  }
  const sources = new Set(rulePackage.sources.map((source) => source.id));
  const checkSources = (ids: readonly string[], path: string) => {
    for (const id of ids)
      if (!sources.has(id)) add("UNKNOWN_SOURCE_ID", path, `Unknown source reference: ${id}.`);
  };
  checkSources(trainingPay.sourceIds, "/rules/trainingPay/sourceIds");
  const overtime = rulePackage.rules.premiumRules.filter((rule) => rule.premiumType === "OVERTIME");
  if (rulePackage.rules.overtimeBaseRule !== undefined)
    add(
      "TRAINING_OVERTIME_BASIS_INVALID",
      "/rules/overtimeBaseRule",
      "Training years must not be capped by an employee table step.",
    );
  if (selection.capabilities.overtime === "SUPPORTED") {
    if (overtime.length !== 1)
      add(
        "TRAINING_OVERTIME_INCOMPLETE",
        "/rules/premiumRules",
        "Supported training overtime requires exactly one explicit rate.",
      );
    for (const rule of overtime) {
      const c = rule.conditions;
      if (
        rule.rateBasis !== "INDIVIDUAL_HOURLY" ||
        rule.referenceStepId !== null ||
        rule.timeWindow !== null ||
        c.payGroups !== null ||
        c.sectors !== null ||
        c.tariffRegions != null ||
        c.federalStates !== null ||
        c.holidayPremiumModes !== null ||
        c.allowanceStatuses !== null ||
        c.monthDays !== null ||
        c.requiresShiftTypes.length !== 0 ||
        c.excludesShiftTypes.length !== 0 ||
        !Number.isSafeInteger(rule.percentageBasisPoints) ||
        rule.percentageBasisPoints < 0 ||
        rulePackage.rules.combinationRules.some((combination) =>
          combination.memberRuleIds.includes(rule.id),
        )
      )
        add(
          "TRAINING_OVERTIME_BASIS_INVALID",
          "/rules/premiumRules",
          "Training overtime uses individual training pay, without employee conditions or calendar-premium combinations.",
        );
    }
  }
  if (selection.capabilities.timePremiums === "SUPPORTED") {
    const premiums = rulePackage.rules.premiumRules.filter(
      (rule) => rule.premiumType !== "OVERTIME",
    );
    const types = [
      "NIGHT",
      "SUNDAY",
      "SATURDAY",
      "PRE_HOLIDAY",
      "HOLIDAY_WITH_TIME_OFF",
      "HOLIDAY_WITHOUT_TIME_OFF",
    ] as const;
    if (types.some((type) => premiums.filter((rule) => rule.premiumType === type).length !== 1))
      add(
        "TRAINING_PREMIUMS_INCOMPLETE",
        "/rules/premiumRules",
        "Supported training premiums require each time-premium type exactly once.",
      );
    for (const rule of premiums) {
      const conditions = rule.conditions;
      if (
        rule.rateBasis !== "INDIVIDUAL_HOURLY" ||
        rule.referenceStepId !== null ||
        conditions.payGroups !== null ||
        conditions.sectors !== null ||
        conditions.tariffRegions != null ||
        conditions.allowanceStatuses !== null
      )
        add(
          "TRAINING_PREMIUM_BASIS_INVALID",
          "/rules/premiumRules",
          "Training premiums cannot use employee steps or employee-only conditions.",
        );
    }
    const calendarIds = premiums
      .filter((rule) => rule.premiumType !== "NIGHT")
      .map((rule) => rule.id);
    const combinations = rulePackage.rules.combinationRules.filter((rule) =>
      rule.memberRuleIds.some((id) => premiums.some((premium) => premium.id === id)),
    );
    if (
      combinations.length !== 1 ||
      combinations[0].mode !== "EXCLUSIVE_HIGHEST" ||
      combinations[0].memberRuleIds.length !== calendarIds.length ||
      calendarIds.some((id) => !combinations[0].memberRuleIds.includes(id))
    )
      add(
        "TRAINING_PREMIUM_COMBINATION_INVALID",
        "/rules/combinationRules",
        "Calendar premiums use the highest rate; night premiums remain additive.",
      );
  }
  const pairs = new Set<string>();
  for (const rule of rulePackage.rules.allowanceRules) {
    if (rule.allowanceType === "care") {
      if (
        rule.id !== "training-special-duty-pe1" ||
        rule.amountKind !== "FIXED_MONTHLY" ||
        !rule.prorateByPartTime ||
        rule.conditions.payGroups !== null ||
        rule.conditions.requiresShiftTypes.length !== 0 ||
        rule.conditions.excludesShiftTypes.length !== 0 ||
        rule.conditions.allowanceStatuses !== null ||
        rule.conditions.holidayPremiumModes !== null ||
        rule.conditions.monthDays !== null
      )
        add(
          "TRAINING_SPECIAL_ALLOWANCE_INVALID",
          "/rules/allowanceRules",
          "Training special-duty allowance needs explicit personal eligibility, not employee or shift-status conditions.",
        );
      continue;
    }
    if (rule.allowanceType !== "shift" && rule.allowanceType !== "alternating-shift") continue;
    const expectedStatus =
      rule.allowanceType === "shift"
        ? rule.amountKind === "FIXED_MONTHLY"
          ? "SHIFT_MONTHLY"
          : "SHIFT_HOURLY"
        : rule.amountKind === "FIXED_MONTHLY"
          ? "ALTERNATING_MONTHLY"
          : "ALTERNATING_HOURLY";
    if (
      rule.conditions.payGroups !== null ||
      rule.conditions.requiresShiftTypes.length !== 0 ||
      rule.conditions.excludesShiftTypes.length !== 0 ||
      rule.conditions.allowanceStatuses?.length !== 1 ||
      rule.conditions.allowanceStatuses[0] !== expectedStatus ||
      (rule.amountKind === "FIXED_HOURLY" && rule.prorateByPartTime)
    )
      add(
        "TRAINING_ALLOWANCE_BASIS_INVALID",
        "/rules/allowanceRules",
        "Training shift allowances need their own status and must not reduce worked-hour amounts by part-time again.",
      );
  }
  const groups = new Set<string>();
  for (const [index, category] of trainingPay.categories.entries()) {
    const path = `/rules/trainingPay/categories/${index}`;
    if (groups.has(category.groupId))
      add("DUPLICATE_TRAINING_CATEGORY", path, "Training category identifiers must be unique.");
    groups.add(category.groupId);
    checkSources(category.sourceIds, path + "/sourceIds");
    for (const year of category.years) pairs.add(category.groupId + ":s" + year);
  }
  const table = payTables.find((entry) => entry.id === selector.payTableId);
  if (table) {
    for (const pair of pairs) {
      if (table.entries.filter((entry) => entry.groupId + ":" + entry.stepId === pair).length !== 1)
        add(
          "TRAINING_TABLE_INCOMPLETE",
          "/rules/payTables",
          `Expected exactly one training amount for ${pair}.`,
        );
    }
    for (const entry of table.entries)
      if (!pairs.has(entry.groupId + ":" + entry.stepId))
        add(
          "UNDECLARED_TRAINING_YEAR",
          "/rules/payTables",
          "Every training row needs a declared category and year.",
        );
  }
  return issues;
}
