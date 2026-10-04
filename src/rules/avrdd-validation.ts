import { Temporal } from "@js-temporal/polyfill";
import type { RuleTariffPackage } from "./contracts.generated";
import type { ValidationIssue } from "./validation";

const STAGES = ["entry", "base", "exp1", "exp2", "exp3"] as const;
const GROUPS = Array.from({ length: 13 }, (_, index) => `eg${index + 1}`);

function datedRateIssues(
  pkg: RuleTariffPackage,
  rates:
    | readonly { validFrom: string; validTo: string | null; sourceIds: readonly string[] }[]
    | undefined,
  name: string,
  missingCode: string,
  periodCode: string,
): ValidationIssue[] {
  const path = `/rules/${name}`;
  if (!rates?.length) return [{ code: missingCode, path, message: "Dated AVR.DD rates required." }];
  const issues: ValidationIssue[] = [];
  const knownSources = new Set(pkg.sources.map((source) => source.id));
  let nextStart = pkg.validFrom;
  for (const [index, rate] of rates.entries()) {
    const ratePath = `${path}/${index}`;
    for (const sourceId of rate.sourceIds)
      if (!knownSources.has(sourceId))
        issues.push({
          code: "UNKNOWN_SOURCE_ID",
          path: `${ratePath}/sourceIds`,
          message: sourceId,
        });
    if (rate.validFrom !== nextStart || (rate.validTo !== null && rate.validTo < rate.validFrom)) {
      issues.push({
        code: periodCode,
        path: ratePath,
        message: "Rates must cover the package without gaps or overlap.",
      });
      break;
    }
    if (rate.validTo === null) {
      if (index !== rates.length - 1 || pkg.validTo !== null)
        issues.push({
          code: periodCode,
          path: ratePath,
          message: "An open rate must be the final package rate.",
        });
      nextStart = "OPEN";
    } else {
      try {
        nextStart = Temporal.PlainDate.from(rate.validTo).add({ days: 1 }).toString();
      } catch {
        issues.push({ code: periodCode, path: ratePath, message: "Invalid rate end date." });
        break;
      }
    }
  }
  try {
    if (
      pkg.validTo === null
        ? nextStart !== "OPEN"
        : nextStart !== Temporal.PlainDate.from(pkg.validTo).add({ days: 1 }).toString()
    )
      issues.push({ code: periodCode, path, message: "Rates must reach the package end." });
  } catch {
    issues.push({ code: periodCode, path, message: "Invalid package end date." });
  }
  return issues;
}

function expectedStages(groupId: string): readonly string[] {
  const number = Number(groupId.slice(2));
  if (number <= 2) return STAGES.slice(1, 3);
  if (number <= 4) return STAGES.slice(0, 3);
  if (number <= 6) return STAGES.slice(0, 4);
  return STAGES;
}

/** Source/table contract only. It does not make AVR.DD executable or selectable in the app. */
export function avrddIssues(pkg: RuleTariffPackage): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const add = (code: string, path: string, message: string) => issues.push({ code, path, message });
  const {
    selection,
    selector,
    payTables,
    avrddStagePolicy: stages,
    avrddHourlyRates: hourly,
    avrddTimePremiumPolicy: premium,
    avrddOvertimePolicy: overtime,
    avrddShiftAllowanceRates: shiftRates,
    avrddCareAllowanceRates: careRates,
    avrddAdvancedAllowancePolicies: advancedAllowances,
  } = pkg.rules;
  const claimsAvrdd =
    pkg.packageId === "avr-dd-anlage-1" ||
    selection?.familyId === "avr-dd" ||
    stages !== undefined ||
    hourly !== undefined ||
    premium !== undefined ||
    overtime !== undefined ||
    shiftRates !== undefined ||
    careRates !== undefined ||
    advancedAllowances !== undefined;
  if (pkg.engineContractVersion !== 15) {
    if (claimsAvrdd)
      add("AVRDD_CONTRACT", "/engineContractVersion", "AVR.DD requires tariff contract 15.");
    return issues;
  }

  const parts = "specialPartIds" in selector ? selector.specialPartIds : [selector.specialPartId];
  if (
    pkg.packageId !== "avr-dd-anlage-1" ||
    selector.agreementId !== "avr-dd" ||
    parts.length !== 1 ||
    parts[0] !== "anlage-1" ||
    selection?.familyId !== "avr-dd" ||
    selection.engineId !== "avr-dd-v1" ||
    selection.employmentKind !== "EMPLOYEE"
  )
    add("AVRDD_IDENTITY", "/rules/selection", "Explicit AVR.DD Anlage 1 identity required.");
  if (
    selection?.variants.length !== 1 ||
    selection.variants[0]?.id !== "ANLAGE_1" ||
    selection.variants[0]?.specialPartId !== "anlage-1" ||
    selection.variants[0]?.regions.length !== 1 ||
    selection.variants[0]?.regions[0]?.id !== "AVR_DD" ||
    selection.variants[0]?.regions[0]?.payTableId !== selector.payTableId
  )
    add(
      "AVRDD_SELECTION",
      "/rules/selection/variants",
      "One explicitly mapped AVR.DD Anlage 1 variant required.",
    );
  if (
    pkg.status !== "DRAFT" ||
    Object.values(selection?.capabilities ?? {}).some((value) => value !== "UNSUPPORTED")
  )
    add(
      "AVRDD_NOT_EXECUTABLE",
      "/rules/selection/capabilities",
      "Source-only AVR.DD packages must stay DRAFT with every calculation capability unsupported.",
    );

  const allowed = new Set([
    "selection",
    "selector",
    "payTables",
    "avrddStagePolicy",
    "avrddHourlyRates",
    "avrddTimePremiumPolicy",
    "avrddOvertimePolicy",
    "avrddShiftAllowanceRates",
    "avrddCareAllowanceRates",
    "avrddAdvancedAllowancePolicies",
    "premiumRules",
    "allowanceRules",
    "combinationRules",
    "workPatternRules",
    "workPatternPolicy",
  ]);
  if (
    Object.keys(pkg.rules).some((key) => !allowed.has(key)) ||
    [
      pkg.rules.premiumRules,
      pkg.rules.allowanceRules,
      pkg.rules.combinationRules,
      pkg.rules.workPatternRules,
    ].some((rows) => rows.length > 0)
  )
    add(
      "AVRDD_FOREIGN_RULES",
      "/rules",
      "Foreign or unimplemented calculation rules are forbidden.",
    );

  if (payTables.length !== 1 || payTables[0]?.id !== selector.payTableId)
    add("AVRDD_TABLE_COUNT", "/rules/payTables", "Exactly one mapped Anlage 2 table required.");
  const expected = new Set(
    GROUPS.flatMap((groupId) => expectedStages(groupId).map((stepId) => `${groupId}:${stepId}`)),
  );
  for (const entry of payTables[0]?.entries ?? []) {
    if (!expected.delete(`${entry.groupId}:${entry.stepId}`) || entry.monthlyCents <= 0)
      add(
        "AVRDD_TABLE_ENTRY",
        "/rules/payTables/0/entries",
        "Invalid or duplicate group/stage/value.",
      );
  }
  if (expected.size)
    add(
      "AVRDD_TABLE_INCOMPLETE",
      "/rules/payTables/0/entries",
      "Every actual EG stage is required; missing stages are not zero-valued stages.",
    );

  if (!stages) {
    add(
      "AVRDD_STAGES_MISSING",
      "/rules/avrddStagePolicy",
      "Group-dependent stage progression required.",
    );
  } else {
    const knownSources = new Set(pkg.sources.map((source) => source.id));
    for (const sourceId of stages.sourceIds)
      if (!knownSources.has(sourceId))
        add("UNKNOWN_SOURCE_ID", "/rules/avrddStagePolicy/sourceIds", sourceId);
    const remainingGroups = new Set(GROUPS);
    for (const [index, group] of stages.groups.entries()) {
      const path = `/rules/avrddStagePolicy/groups/${index}`;
      if (!remainingGroups.delete(group.groupId))
        add("AVRDD_STAGE_GROUP", path, "Unknown or duplicate EG group.");
      const expectedOrder = expectedStages(group.groupId);
      if (
        group.stages.length !== expectedOrder.length ||
        group.stages.some(
          (stage, stepIndex) =>
            stage.stepId !== expectedOrder[stepIndex] ||
            (stepIndex === group.stages.length - 1) !== (stage.monthsToNext === null),
        )
      )
        add("AVRDD_STAGE_SEQUENCE", path, "Stages and terminal progression must match the group.");
    }
    if (remainingGroups.size)
      add("AVRDD_STAGE_INCOMPLETE", "/rules/avrddStagePolicy/groups", "All 13 EG groups required.");
  }

  if (hourly) {
    const knownSources = new Set(pkg.sources.map((source) => source.id));
    const remainingGroups = new Set(GROUPS);
    for (const [index, rate] of hourly.entries()) {
      const path = `/rules/avrddHourlyRates/${index}`;
      if (!remainingGroups.delete(rate.groupId))
        add("AVRDD_HOURLY_GROUP", path, "Unknown or duplicate Anlage 9 EG group.");
      for (const sourceId of rate.sourceIds)
        if (!knownSources.has(sourceId)) add("UNKNOWN_SOURCE_ID", `${path}/sourceIds`, sourceId);
    }
    if (remainingGroups.size)
      add("AVRDD_HOURLY_INCOMPLETE", "/rules/avrddHourlyRates", "All 13 Anlage 9 rates required.");
  }
  if (premium) {
    const knownSources = new Set(pkg.sources.map((source) => source.id));
    for (const sourceId of premium.sourceIds)
      if (!knownSources.has(sourceId))
        add("UNKNOWN_SOURCE_ID", "/rules/avrddTimePremiumPolicy/sourceIds", sourceId);
    if (
      premium.nightWindow.startMinute !== 1260 ||
      premium.nightWindow.endMinute !== 360 ||
      premium.saturdayWindow.startMinute !== 780 ||
      premium.saturdayWindow.endMinute !== 1260
    )
      add(
        "AVRDD_PREMIUM_WINDOW",
        "/rules/avrddTimePremiumPolicy",
        "AVR.DD § 9e(4) and § 20a(1) windows must match the source text.",
      );
  }
  if (overtime) {
    const knownSources = new Set(pkg.sources.map((source) => source.id));
    for (const sourceId of overtime.sourceIds)
      if (!knownSources.has(sourceId))
        add("UNKNOWN_SOURCE_ID", "/rules/avrddOvertimePolicy/sourceIds", sourceId);
  }
  issues.push(
    ...datedRateIssues(
      pkg,
      shiftRates,
      "avrddShiftAllowanceRates",
      "AVRDD_SHIFT_RATES_MISSING",
      "AVRDD_SHIFT_RATE_PERIOD",
    ),
  );
  issues.push(
    ...datedRateIssues(
      pkg,
      careRates,
      "avrddCareAllowanceRates",
      "AVRDD_CARE_RATES_MISSING",
      "AVRDD_CARE_RATE_PERIOD",
    ),
  );
  issues.push(
    ...datedRateIssues(
      pkg,
      advancedAllowances,
      "avrddAdvancedAllowancePolicies",
      "AVRDD_ADVANCED_ALLOWANCES_MISSING",
      "AVRDD_ADVANCED_ALLOWANCE_PERIOD",
    ),
  );
  for (const [index, policy] of advancedAllowances?.entries() ?? []) {
    const legacy = policy.validFrom < "2026-07-01";
    if (
      (legacy && (policy.validTo === null || policy.validTo >= "2026-07-01")) ||
      policy.phase !== (legacy ? "LEGACY_EFG" : "POST_2026_07_EFGH") ||
      policy.practiceMode !== (legacy ? "HALF_EG8_DIFFERENCE" : "FIXED_MONTHLY") ||
      (legacy ? policy.practiceMonthlyCents !== null : policy.practiceMonthlyCents === null)
    )
      add(
        "AVRDD_ADVANCED_ALLOWANCE_PHASE",
        `/rules/avrddAdvancedAllowancePolicies/${index}`,
        "§ 14(2) letter assignment and practice mode change on 01.07.2026.",
      );
  }
  return issues;
}
