import { Temporal } from "@js-temporal/polyfill";
import type { RuleTariffPackage } from "./contracts.generated";
import type { ValidationIssue } from "./validation";
import { tvlCareAllowanceIssues } from "./tvl-care-allowance-validation";

function validDate(value: string): boolean {
  try {
    return Temporal.PlainDate.from(value).toString() === value;
  } catch {
    return false;
  }
}

/** Contract 12 is a distinct TV-L/KR contract, never a renamed TVöD payload. */
export function tvlKrIssues(pkg: RuleTariffPackage): ValidationIssue[] {
  const { selection, employmentWorkingTimeRules: workingTimes, selector } = pkg.rules;
  const issues: ValidationIssue[] = tvlCareAllowanceIssues(pkg);
  const add = (code: string, path: string, message: string) => issues.push({ code, path, message });
  if (pkg.engineContractVersion !== 12) {
    if (pkg.rules.tvlShiftAllowancePolicy !== undefined)
      add(
        "UNSUPPORTED_TVL_SHIFT_ALLOWANCE_POLICY",
        "/rules/tvlShiftAllowancePolicy",
        "KR shift allowances require contract 12.",
      );
    if (pkg.rules.tvlOvertimePolicy !== undefined)
      add(
        "UNSUPPORTED_TVL_OVERTIME_POLICY",
        "/rules/tvlOvertimePolicy",
        "KR overtime policy requires contract 12.",
      );
    if (pkg.rules.tvlTimePremiumPolicy !== undefined)
      add(
        "UNSUPPORTED_TVL_PREMIUM_POLICY",
        "/rules/tvlTimePremiumPolicy",
        "KR premium policy requires contract 12.",
      );
    if (workingTimes !== undefined && ![13, 14].includes(pkg.engineContractVersion))
      add(
        "UNSUPPORTED_EMPLOYMENT_WORKING_TIME",
        "/rules/employmentWorkingTimeRules",
        "Dated variant/region working-time rules require contract 12.",
      );
    return issues;
  }
  if (
    pkg.packageId !== "tvl-kr-tdl" ||
    selector.agreementId !== "tv-l" ||
    selection?.familyId !== "tvl-kr" ||
    selection.engineId !== "tvl-kr-v1" ||
    selection.employmentKind !== "EMPLOYEE"
  )
    add(
      "TVL_KR_IDENTITY",
      "/rules/selection",
      "Contract 12 requires the explicit TV-L/KR identity.",
    );
  const parts = "specialPartIds" in selector ? selector.specialPartIds : [selector.specialPartId];
  if (
    parts.length !== 1 ||
    parts[0] !== "section-43" ||
    selection?.variants.length !== 1 ||
    selection.variants[0]?.id !== "SECTION_43" ||
    selection.variants[0]?.specialPartId !== "section-43"
  )
    add(
      "TVL_KR_VARIANT",
      "/rules/selection/variants",
      "The current KR contract covers section 43 only.",
    );
  // Further components are implemented in subsequent scoped packages, not inferred from TVöD.
  if (
    selection?.capabilities.basePay !== "SUPPORTED" ||
    selection?.capabilities.timePremiums !==
      (pkg.rules.tvlTimePremiumPolicy ? "SUPPORTED" : "UNSUPPORTED") ||
    selection?.capabilities.overtime !==
      (pkg.rules.tvlOvertimePolicy ? "SUPPORTED" : "UNSUPPORTED") ||
    selection?.capabilities.allowances !== "UNSUPPORTED" ||
    selection?.capabilities.annualPayment !==
      (pkg.rules.annualPaymentRules ? "SUPPORTED" : "UNSUPPORTED")
  )
    add(
      "TVL_KR_COMPONENT_COVERAGE",
      "/rules/selection/capabilities",
      "Declared capabilities must match the implemented KR components.",
    );
  if (
    pkg.rules.overtimeBaseRule !== undefined ||
    pkg.rules.weeklyWorkingTimeRules !== undefined ||
    pkg.rules.hourlyCalculation !== undefined ||
    pkg.rules.trainingPay !== undefined ||
    [
      pkg.rules.premiumRules,
      pkg.rules.allowanceRules,
      pkg.rules.combinationRules,
      pkg.rules.workPatternRules,
    ].some((rules) => rules.length !== 0)
  )
    add(
      "TVL_KR_UNSUPPORTED_RULES",
      "/rules",
      "No foreign or unimplemented component rules are allowed.",
    );

  if (pkg.rules.payTables.length !== 1)
    add(
      "TVL_KR_TABLE_COUNT",
      "/rules/payTables",
      "Each version must contain exactly one KR table.",
    );
  for (const [index, table] of pkg.rules.payTables.entries()) {
    const expected = new Set<string>();
    for (let group = 5; group <= 17; group++)
      for (let step = group <= 6 ? 1 : 2; step <= 6; step++) expected.add(`kr${group}:${step}`);
    for (const entry of table.entries) {
      const key = `${entry.groupId}:${entry.stepId}`;
      if (!expected.delete(key) || entry.monthlyCents <= 0)
        add(
          "TVL_KR_TABLE_CELL",
          `/rules/payTables/${index}/entries`,
          "Unknown, duplicate or non-positive KR group/step cell.",
        );
    }
    if (expected.size !== 0)
      add(
        "TVL_KR_TABLE_INCOMPLETE",
        `/rules/payTables/${index}/entries`,
        "KR5/6 require steps 1–6; KR7–17 require steps 2–6.",
      );
  }
  const root = "/rules/employmentWorkingTimeRules";
  if (!workingTimes?.length) {
    add(
      "TVL_KR_WORKING_TIME_MISSING",
      root,
      "Explicit regional working-time coverage is required.",
    );
    return issues;
  }
  const sources = new Set(pkg.sources.map((source) => source.id));
  const shifts = pkg.rules.tvlShiftAllowancePolicy;
  if (shifts) {
    const path = "/rules/tvlShiftAllowancePolicy";
    for (const id of shifts.sourceIds)
      if (!sources.has(id)) add("UNKNOWN_SOURCE_ID", path, "Unknown shift allowance source.");
    let next: string | null = pkg.validFrom;
    let valid = true;
    for (const period of [...shifts.periods].sort((a, b) =>
      a.validFrom.localeCompare(b.validFrom),
    )) {
      if (
        !validDate(period.validFrom) ||
        (period.validTo !== null &&
          (!validDate(period.validTo) || period.validTo < period.validFrom))
      ) {
        valid = false;
        continue;
      }
      if (period.validFrom !== next) valid = false;
      next =
        period.validTo === null
          ? null
          : Temporal.PlainDate.from(period.validTo).add({ days: 1 }).toString();
    }
    const expected =
      pkg.validTo === null
        ? null
        : validDate(pkg.validTo)
          ? Temporal.PlainDate.from(pkg.validTo).add({ days: 1 }).toString()
          : undefined;
    if (!valid || next !== expected)
      add(
        "TVL_KR_SHIFT_ALLOWANCE_COVERAGE",
        path,
        "Shift allowances must cover the exact package period without gaps or overlaps.",
      );
  }
  const overtime = pkg.rules.tvlOvertimePolicy;
  if (overtime) {
    const root = "/rules/tvlOvertimePolicy";
    for (const id of overtime.sourceIds)
      if (!sources.has(id))
        add("UNKNOWN_SOURCE_ID", root + "/sourceIds", "Unknown overtime source.");
    const expected = new Set(Array.from({ length: 13 }, (_, index) => "kr" + (index + 5)));
    for (const rate of overtime.groupRates) {
      if (!expected.delete(rate.groupId))
        add(
          "TVL_KR_OVERTIME_GROUPS",
          root + "/groupRates",
          "Unknown or duplicate KR overtime group.",
        );
      for (const step of [overtime.maximumBaseStepId, overtime.premiumReferenceStepId])
        if (
          !pkg.rules.payTables[0]?.entries.some(
            (entry) => entry.groupId === rate.groupId && entry.stepId === step,
          )
        )
          add("TVL_KR_OVERTIME_REFERENCE", root, "Missing overtime reference step.");
    }
    if (expected.size)
      add("TVL_KR_OVERTIME_GROUPS", root + "/groupRates", "Incomplete KR overtime group coverage.");
    if (
      pkg.rules.tvlTimePremiumPolicy &&
      pkg.rules.tvlTimePremiumPolicy.monthlyFactorThousandths !== overtime.monthlyFactorThousandths
    )
      add("TVL_KR_HOURLY_FACTOR", root, "Conflicting hourly divisors in the same package.");
  }
  const premium = pkg.rules.tvlTimePremiumPolicy;
  if (premium) {
    for (const id of premium.sourceIds)
      if (!sources.has(id))
        add(
          "UNKNOWN_SOURCE_ID",
          "/rules/tvlTimePremiumPolicy/sourceIds",
          "Unknown premium source.",
        );
    for (const window of [premium.nightWindow, premium.preHolidayWindow, premium.saturdayWindow])
      if (window.startMinute === window.endMinute)
        add(
          "TVL_KR_PREMIUM_WINDOW",
          "/rules/tvlTimePremiumPolicy",
          "Ambiguous premium time window.",
        );
    if (premium.preHolidayMonthDays.some((day) => !validDate("2000-" + day)))
      add("TVL_KR_PREMIUM_DATE", "/rules/tvlTimePremiumPolicy", "Invalid recurring date.");
    for (let group = 5; group <= 17; group++)
      if (
        !pkg.rules.payTables[0]?.entries.some(
          (entry) => entry.groupId === "kr" + group && entry.stepId === premium.referenceStepId,
        )
      )
        add(
          "TVL_KR_PREMIUM_REFERENCE",
          "/rules/tvlTimePremiumPolicy/referenceStepId",
          "Missing KR reference step.",
        );
  }
  const variants = selection?.variants ?? [];
  const validPairs = new Set(
    variants.flatMap((variant) => variant.regions.map((region) => `${variant.id}:${region.id}`)),
  );
  const ids = new Set<string>();
  let invalidRange = !validDate(pkg.validFrom) || (pkg.validTo !== null && !validDate(pkg.validTo));
  for (const [index, rule] of workingTimes.entries()) {
    const path = `${root}/${index}`;
    if (ids.has(rule.id))
      add("DUPLICATE_WORKING_TIME_ID", path + "/id", "Duplicate working-time id.");
    ids.add(rule.id);
    if (!validPairs.has(`${rule.variantId}:${rule.regionId}`))
      add(
        "UNKNOWN_WORKING_TIME_SELECTION",
        path,
        "Working time must reference a declared variant/region.",
      );
    for (const id of rule.sourceIds)
      if (!sources.has(id)) add("UNKNOWN_SOURCE_ID", path + "/sourceIds", `Unknown source: ${id}.`);
    if (
      !validDate(rule.validFrom) ||
      (rule.validTo !== null && (!validDate(rule.validTo) || rule.validTo < rule.validFrom)) ||
      rule.validFrom < pkg.validFrom ||
      (pkg.validTo !== null && (rule.validTo === null || rule.validTo > pkg.validTo))
    ) {
      invalidRange = true;
      add(
        "TVL_KR_WORKING_TIME_RANGE",
        path,
        "Working-time range must be real and inside package validity.",
      );
    }
  }
  const expectedRegions = ["WEST_38_5", "EAST", "EAST_UNIVERSITY_HOSPITAL"];
  if (
    variants[0]?.regions.length !== expectedRegions.length ||
    expectedRegions.some((id) => !variants[0]?.regions.some((region) => region.id === id))
  )
    add(
      "TVL_KR_REGIONS",
      "/rules/selection/variants",
      "Declare West, East and East university hospitals separately.",
    );
  if (invalidRange) return issues;
  for (const pair of validPairs) {
    const rules = workingTimes
      .filter((rule) => `${rule.variantId}:${rule.regionId}` === pair)
      .sort((a, b) => a.validFrom.localeCompare(b.validFrom));
    let next: string | null = pkg.validFrom;
    for (const rule of rules) {
      if (next === null || rule.validFrom !== next)
        add("TVL_KR_WORKING_TIME_COVERAGE", root, `Gap or overlap in ${pair}.`);
      next =
        rule.validTo === null
          ? null
          : Temporal.PlainDate.from(rule.validTo).add({ days: 1 }).toString();
    }
    const expectedEnd =
      pkg.validTo === null
        ? null
        : Temporal.PlainDate.from(pkg.validTo).add({ days: 1 }).toString();
    if (rules.length === 0 || next !== expectedEnd)
      add("TVL_KR_WORKING_TIME_COVERAGE", root, `Incomplete coverage for ${pair}.`);
  }
  return issues;
}
