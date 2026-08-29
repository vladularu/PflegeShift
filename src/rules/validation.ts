import type {
  PackageDescriptor,
  RuleCatalogPublicationRequest,
  RuleManifest,
  RulePackage,
  Track,
} from "./contracts.generated";
import {
  validateManifestSchema as generatedManifestValidator,
  validateRuleCatalogPublicationRequestSchema as generatedPublicationRequestValidator,
  validateRulePackageSchema as generatedPackageValidator,
} from "./schema-validators.generated";

export interface ValidationIssue {
  code: string;
  path: string;
  message: string;
}

export type ValidationResult<T> = { ok: true; value: T } | { ok: false; issues: ValidationIssue[] };

export interface ValidatedRuleCatalog {
  manifest: RuleManifest;
  packages: RulePackage[];
}

interface SchemaError {
  instancePath?: string;
  keyword?: string;
  message?: string;
}

type SchemaValidator = ((value: unknown) => boolean) & {
  errors?: SchemaError[] | null;
};

type TariffPackage = Extract<RulePackage, { kind: "TARIFF" }>;
type LegalPackage = Extract<RulePackage, { kind: "LEGAL" }>;
type HolidayPackage = Extract<RulePackage, { kind: "HOLIDAY" }>;

const validateManifestSchema = generatedManifestValidator as SchemaValidator;
const validateRulePackageSchema = generatedPackageValidator as SchemaValidator;
const validatePublicationRequestSchema = generatedPublicationRequestValidator as SchemaValidator;
const ISO_DATE = /^\d{4}-(0[1-9]|1[0-2])-([0-2]\d|3[01])$/;

function issue(code: string, path: string, message: string): ValidationIssue {
  return { code, path, message };
}

function schemaIssues(validator: SchemaValidator): ValidationIssue[] {
  return (validator.errors ?? []).map((error) =>
    issue(
      `SCHEMA_${(error.keyword ?? "INVALID").toUpperCase()}`,
      error.instancePath || "/",
      error.message ?? "Schema validation failed.",
    ),
  );
}

function isRealIsoDate(value: string): boolean {
  if (!ISO_DATE.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
}

function isRealUtcTimestamp(value: string): boolean {
  const parsed = new Date(value);
  return isRealIsoDate(value.slice(0, 10)) && !Number.isNaN(parsed.valueOf());
}

function nextIsoDate(value: string): string {
  const parsed = new Date(`${value}T00:00:00.000Z`);
  parsed.setUTCDate(parsed.getUTCDate() + 1);
  return parsed.toISOString().slice(0, 10);
}

function validateDate(value: string, path: string, issues: ValidationIssue[]): void {
  if (!isRealIsoDate(value)) {
    issues.push(issue("INVALID_DATE", path, `Invalid calendar date: ${value}.`));
  }
}

function validateRange(
  validFrom: string,
  validTo: string | null,
  path: string,
  issues: ValidationIssue[],
): void {
  validateDate(validFrom, `${path}/validFrom`, issues);
  if (validTo !== null) {
    validateDate(validTo, `${path}/validTo`, issues);
    if (isRealIsoDate(validFrom) && isRealIsoDate(validTo) && validFrom > validTo) {
      issues.push(issue("INVALID_DATE_RANGE", path, "validFrom must not be later than validTo."));
    }
  }
}

function duplicates(values: string[]): Set<string> {
  const seen = new Set<string>();
  const repeated = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) repeated.add(value);
    seen.add(value);
  }
  return repeated;
}

function reportDuplicates(
  values: string[],
  path: string,
  label: string,
  issues: ValidationIssue[],
): void {
  for (const duplicate of duplicates(values)) {
    issues.push(issue("DUPLICATE_ID", path, `Duplicate ${label}: ${duplicate}.`));
  }
}

function validateSourceReferences(
  sourceIds: readonly string[],
  knownSourceIds: Set<string>,
  path: string,
  issues: ValidationIssue[],
): void {
  for (const sourceId of sourceIds) {
    if (!knownSourceIds.has(sourceId)) {
      issues.push(issue("UNKNOWN_SOURCE_ID", path, `Unknown source reference: ${sourceId}.`));
    }
  }
}

function validateTariffPackage(
  rulePackage: TariffPackage,
  sourceIds: Set<string>,
  issues: ValidationIssue[],
): void {
  const { rules } = rulePackage;
  reportDuplicates(
    rules.payTables.map((table) => table.id),
    "/rules/payTables",
    "pay table id",
    issues,
  );

  const selectedTable = rules.payTables.find((table) => table.id === rules.selector.payTableId);
  if (!selectedTable) {
    issues.push(
      issue(
        "UNKNOWN_PAY_TABLE",
        "/rules/selector/payTableId",
        `Unknown pay table: ${rules.selector.payTableId}.`,
      ),
    );
  }

  const knownStepIds = new Set<string>();
  for (const [tableIndex, table] of rules.payTables.entries()) {
    validateSourceReferences(
      table.sourceIds,
      sourceIds,
      `/rules/payTables/${tableIndex}/sourceIds`,
      issues,
    );
    reportDuplicates(
      table.entries.map((entry) => `${entry.groupId}:${entry.stepId}`),
      `/rules/payTables/${tableIndex}/entries`,
      "group and step combination",
      issues,
    );
    for (const [entryIndex, entry] of table.entries.entries()) {
      knownStepIds.add(entry.stepId);
      if (rulePackage.engineContractVersion >= 3 && entry.hourlyCents !== undefined) {
        issues.push(
          issue(
            "UNEXPECTED_FIXED_HOURLY_RATE",
            `/rules/payTables/${tableIndex}/entries/${entryIndex}/hourlyCents`,
            "Tariff engine contract v3 derives hourly rates from monthly pay and weekly working time.",
          ),
        );
      }
      if (rulePackage.engineContractVersion < 3 && entry.hourlyCents === undefined) {
        issues.push(
          issue(
            "MISSING_FIXED_HOURLY_RATE",
            `/rules/payTables/${tableIndex}/entries/${entryIndex}/hourlyCents`,
            "Tariff engine contracts before v3 require a fixed hourly rate.",
          ),
        );
      }
    }
  }

  const overtimeBaseRule = rules.overtimeBaseRule;
  if (rulePackage.engineContractVersion >= 2 && overtimeBaseRule === undefined) {
    issues.push(
      issue(
        "MISSING_OVERTIME_BASE_RULE",
        "/rules/overtimeBaseRule",
        "Tariff engine contracts v2 and newer require an overtime base rule.",
      ),
    );
  } else if (rulePackage.engineContractVersion === 1 && overtimeBaseRule !== undefined) {
    issues.push(
      issue(
        "UNSUPPORTED_OVERTIME_BASE_RULE",
        "/rules/overtimeBaseRule",
        "Tariff engine contract v1 must not define an overtime base rule.",
      ),
    );
  }
  if (overtimeBaseRule !== undefined) {
    validateSourceReferences(
      overtimeBaseRule.sourceIds,
      sourceIds,
      "/rules/overtimeBaseRule/sourceIds",
      issues,
    );
    if (selectedTable) {
      const missingGroups = [
        ...new Set(selectedTable.entries.map((entry) => entry.groupId)),
      ].filter(
        (groupId) =>
          !selectedTable.entries.some(
            (entry) => entry.groupId === groupId && entry.stepId === overtimeBaseRule.maximumStepId,
          ),
      );
      if (missingGroups.length > 0) {
        issues.push(
          issue(
            "UNKNOWN_OVERTIME_BASE_STEP",
            "/rules/overtimeBaseRule/maximumStepId",
            `Maximum overtime step ${overtimeBaseRule.maximumStepId} is missing for pay groups: ${missingGroups.join(
              ", ",
            )}.`,
          ),
        );
      }
    }
  }

  const weeklyWorkingTimeRules = rules.weeklyWorkingTimeRules;
  const hourlyCalculation = rules.hourlyCalculation;
  if (rulePackage.engineContractVersion >= 3) {
    if (weeklyWorkingTimeRules === undefined) {
      issues.push(
        issue(
          "MISSING_WEEKLY_WORKING_TIME_RULES",
          "/rules/weeklyWorkingTimeRules",
          "Tariff engine contract v3 requires sector and tariff-region working-time rules.",
        ),
      );
    }
    if (hourlyCalculation === undefined) {
      issues.push(
        issue(
          "MISSING_HOURLY_CALCULATION",
          "/rules/hourlyCalculation",
          "Tariff engine contract v3 requires the contractual hourly-rate formula.",
        ),
      );
    }
  } else if (weeklyWorkingTimeRules !== undefined || hourlyCalculation !== undefined) {
    issues.push(
      issue(
        "UNSUPPORTED_TARIFF_V3_RULES",
        "/rules",
        "Tariff contracts before v3 must not define v3 working-time or hourly-rate rules.",
      ),
    );
  }

  if (weeklyWorkingTimeRules !== undefined) {
    reportDuplicates(
      weeklyWorkingTimeRules.map((rule) => rule.id),
      "/rules/weeklyWorkingTimeRules",
      "weekly working-time rule id",
      issues,
    );
    for (const [index, rule] of weeklyWorkingTimeRules.entries()) {
      validateSourceReferences(
        rule.sourceIds,
        sourceIds,
        `/rules/weeklyWorkingTimeRules/${index}/sourceIds`,
        issues,
      );
    }
    for (const sector of ["BT_K", "BT_B"] as const) {
      for (const tariffRegion of ["KAV_BW", "OTHER"] as const) {
        const matches = weeklyWorkingTimeRules.filter(
          (rule) => rule.sectors.includes(sector) && rule.tariffRegions.includes(tariffRegion),
        );
        if (matches.length !== 1) {
          issues.push(
            issue(
              "AMBIGUOUS_WEEKLY_WORKING_TIME",
              "/rules/weeklyWorkingTimeRules",
              `Expected exactly one weekly working-time rule for ${sector}/${tariffRegion}, found ${matches.length}.`,
            ),
          );
        }
      }
    }
  }
  if (hourlyCalculation !== undefined) {
    validateSourceReferences(
      hourlyCalculation.sourceIds,
      sourceIds,
      "/rules/hourlyCalculation/sourceIds",
      issues,
    );
  }

  const premiumIds = rules.premiumRules.map((rule) => rule.id);
  const allowanceIds = rules.allowanceRules.map((rule) => rule.id);
  const combinationIds = rules.combinationRules.map((rule) => rule.id);
  const workPatternIds = rules.workPatternRules.map((rule) => rule.id);
  reportDuplicates(
    [...premiumIds, ...allowanceIds, ...combinationIds, ...workPatternIds],
    "/rules",
    "rule id",
    issues,
  );

  for (const [index, rule] of rules.premiumRules.entries()) {
    const path = `/rules/premiumRules/${index}`;
    validateSourceReferences(rule.sourceIds, sourceIds, `${path}/sourceIds`, issues);
    if (rule.rateBasis === "TABLE_STEP") {
      if (rule.referenceStepId === null || !knownStepIds.has(rule.referenceStepId)) {
        issues.push(
          issue(
            "UNKNOWN_REFERENCE_STEP",
            `${path}/referenceStepId`,
            "TABLE_STEP requires an existing referenceStepId.",
          ),
        );
      }
    } else if (rule.referenceStepId !== null) {
      issues.push(
        issue(
          "UNEXPECTED_REFERENCE_STEP",
          `${path}/referenceStepId`,
          "INDIVIDUAL_HOURLY must not define referenceStepId.",
        ),
      );
    }
    const required = new Set(rule.conditions.requiresShiftTypes);
    for (const excluded of rule.conditions.excludesShiftTypes) {
      if (required.has(excluded)) {
        issues.push(
          issue(
            "CONTRADICTORY_CONDITION",
            `${path}/conditions`,
            `Shift type ${excluded} cannot be required and excluded.`,
          ),
        );
      }
    }
    for (const monthDay of rule.conditions.monthDays ?? []) {
      if (!isRealIsoDate(`2000-${monthDay}`)) {
        issues.push(
          issue(
            "INVALID_MONTH_DAY",
            `${path}/conditions/monthDays`,
            `Invalid recurring calendar date: ${monthDay}.`,
          ),
        );
      }
    }
  }

  for (const [index, rule] of rules.allowanceRules.entries()) {
    const path = `/rules/allowanceRules/${index}`;
    validateSourceReferences(rule.sourceIds, sourceIds, `${path}/sourceIds`, issues);
    validateRange(rule.validFrom, rule.validTo, path, issues);
    if (
      rule.validFrom < rulePackage.validFrom ||
      (rulePackage.validTo !== null &&
        (rule.validTo === null || rule.validTo > rulePackage.validTo))
    ) {
      issues.push(
        issue(
          "ALLOWANCE_OUTSIDE_PACKAGE_RANGE",
          path,
          "Allowance validity must stay inside the package validity.",
        ),
      );
    }
  }

  const combinableRuleIds = new Set([...premiumIds, ...allowanceIds]);
  for (const [index, rule] of rules.combinationRules.entries()) {
    const path = `/rules/combinationRules/${index}`;
    validateSourceReferences(rule.sourceIds, sourceIds, `${path}/sourceIds`, issues);
    for (const memberId of rule.memberRuleIds) {
      if (!combinableRuleIds.has(memberId)) {
        issues.push(
          issue(
            "UNKNOWN_COMBINATION_MEMBER",
            `${path}/memberRuleIds`,
            `Unknown combinable rule: ${memberId}.`,
          ),
        );
      }
    }
    if (rule.mode === "PRIORITY") {
      const priorityIds = new Set(rule.priorityRuleIds);
      if (
        priorityIds.size !== rule.memberRuleIds.length ||
        rule.memberRuleIds.some((memberId) => !priorityIds.has(memberId))
      ) {
        issues.push(
          issue(
            "INVALID_PRIORITY_ORDER",
            `${path}/priorityRuleIds`,
            "PRIORITY requires every member exactly once in priorityRuleIds.",
          ),
        );
      }
    } else if (rule.priorityRuleIds.length > 0) {
      issues.push(
        issue(
          "UNEXPECTED_PRIORITY_ORDER",
          `${path}/priorityRuleIds`,
          "priorityRuleIds is only allowed for PRIORITY mode.",
        ),
      );
    }
  }

  for (const [index, rule] of rules.workPatternRules.entries()) {
    validateSourceReferences(
      rule.sourceIds,
      sourceIds,
      `/rules/workPatternRules/${index}/sourceIds`,
      issues,
    );
  }
  validateSourceReferences(
    rules.workPatternPolicy.sourceIds,
    sourceIds,
    "/rules/workPatternPolicy/sourceIds",
    issues,
  );
  const boundaries = rules.workPatternPolicy.shiftWindowBoundaries;
  if (!(
    boundaries.nightEndMinute < boundaries.earlyEndMinute &&
    boundaries.earlyEndMinute < boundaries.dayEndMinute &&
    boundaries.dayEndMinute < boundaries.nightStartMinute
  )) {
    issues.push(
      issue(
        "INVALID_SHIFT_WINDOW_BOUNDARIES",
        "/rules/workPatternPolicy/shiftWindowBoundaries",
        "Shift-window boundaries must be strictly increasing.",
      ),
    );
  }
  if (
    rules.workPatternPolicy.alternatingMinimumShifts <
      rules.workPatternPolicy.shiftWorkMinimumShifts ||
    rules.workPatternPolicy.alternatingMinimumWindows <
      rules.workPatternPolicy.shiftWorkMinimumWindows
  ) {
    issues.push(
      issue(
        "INVALID_ALTERNATING_PATTERN_LIMITS",
        "/rules/workPatternPolicy",
        "Alternating-shift limits must not be lower than shift-work limits.",
      ),
    );
  }
}

function validateLegalPackage(
  rulePackage: LegalPackage,
  sourceIds: Set<string>,
  issues: ValidationIssue[],
): void {
  const { rules } = rulePackage;
  const workerQualification = rules.nightWork.workerQualification;
  if (rulePackage.engineContractVersion >= 3 && workerQualification === undefined) {
    issues.push(
      issue(
        "MISSING_NIGHT_WORKER_QUALIFICATION",
        "/rules/nightWork/workerQualification",
        "Legal engine contracts v3 and newer require night-worker qualification rules.",
      ),
    );
  } else if (rulePackage.engineContractVersion === 1 && workerQualification !== undefined) {
    issues.push(
      issue(
        "UNSUPPORTED_NIGHT_WORKER_QUALIFICATION",
        "/rules/nightWork/workerQualification",
        "Legal engine contract v1 must not define night-worker qualification rules.",
      ),
    );
  }
  const standardAverage = rules.workingTime.standardAverage;
  if (rulePackage.engineContractVersion >= 4 && standardAverage === undefined) {
    issues.push(
      issue(
        "MISSING_STANDARD_WORKING_TIME_AVERAGE",
        "/rules/workingTime/standardAverage",
        "Legal engine contract v4 and newer require the standard working-time average windows.",
      ),
    );
  } else if (rulePackage.engineContractVersion < 4 && standardAverage !== undefined) {
    issues.push(
      issue(
        "UNSUPPORTED_STANDARD_WORKING_TIME_AVERAGE",
        "/rules/workingTime/standardAverage",
        "Legal engine contracts before v4 must not define standard working-time average windows.",
      ),
    );
  }
  const sundayHolidayRest = rules.sundayHolidayRest;
  if (rulePackage.engineContractVersion >= 5 && sundayHolidayRest === undefined) {
    issues.push(
      issue(
        "MISSING_SUNDAY_HOLIDAY_REST",
        "/rules/sundayHolidayRest",
        "Legal engine contract v5 and newer require Sunday and holiday rest rules.",
      ),
    );
  } else if (rulePackage.engineContractVersion < 5 && sundayHolidayRest !== undefined) {
    issues.push(
      issue(
        "UNSUPPORTED_SUNDAY_HOLIDAY_REST",
        "/rules/sundayHolidayRest",
        "Legal engine contracts before v5 must not define Sunday and holiday rest rules.",
      ),
    );
  }
  if (rules.workingTime.maxDailyMinutes <= rules.workingTime.standardDailyMinutes) {
    issues.push(
      issue(
        "INVALID_WORKING_TIME_LIMITS",
        "/rules/workingTime",
        "maxDailyMinutes must be greater than standardDailyMinutes.",
      ),
    );
  }

  const sourceBearingRules = [
    ["/rules/workingTime/sourceIds", rules.workingTime.sourceIds],
    ["/rules/breaks/sourceIds", rules.breaks.sourceIds],
    ["/rules/nightWork/sourceIds", rules.nightWork.sourceIds],
    ["/rules/restPeriod/sourceIds", rules.restPeriod.sourceIds],
    ...(sundayHolidayRest === undefined
      ? []
      : ([["/rules/sundayHolidayRest/sourceIds", sundayHolidayRest.sourceIds]] as const)),
    ["/rules/planning/sourceIds", rules.planning.sourceIds],
  ] as const;
  for (const [path, references] of sourceBearingRules) {
    validateSourceReferences(references, sourceIds, path, issues);
  }

  let previousOverMinutes = -1;
  let previousRequiredMinutes = -1;
  for (const [index, tier] of rules.breaks.tiers.entries()) {
    if (tier.overMinutes <= previousOverMinutes || tier.requiredMinutes < previousRequiredMinutes) {
      issues.push(
        issue(
          "UNSORTED_BREAK_TIERS",
          `/rules/breaks/tiers/${index}`,
          "Break thresholds must increase and required minutes must not decrease.",
        ),
      );
    }
    previousOverMinutes = tier.overMinutes;
    previousRequiredMinutes = tier.requiredMinutes;
  }

  reportDuplicates(
    rules.restPeriod.deviations.map((deviation) => deviation.id),
    "/rules/restPeriod/deviations",
    "rest deviation id",
    issues,
  );
  for (const [index, deviation] of rules.restPeriod.deviations.entries()) {
    const path = `/rules/restPeriod/deviations/${index}`;
    validateSourceReferences(deviation.sourceIds, sourceIds, `${path}/sourceIds`, issues);
    if (deviation.minimumMinutes >= rules.restPeriod.defaultMinutes) {
      issues.push(
        issue(
          "INVALID_REST_DEVIATION",
          `${path}/minimumMinutes`,
          "A rest deviation must be lower than defaultMinutes.",
        ),
      );
    }
    if (deviation.compensationMinutes <= rules.restPeriod.defaultMinutes) {
      issues.push(
        issue(
          "INVALID_REST_COMPENSATION",
          `${path}/compensationMinutes`,
          "Compensation must be greater than defaultMinutes.",
        ),
      );
    }
    if (
      rulePackage.engineContractVersion >= 6 &&
      deviation.compensationWithinCalendarMonths === undefined
    ) {
      issues.push(
        issue(
          "MISSING_CALENDAR_MONTH_COMPENSATION",
          `${path}/compensationWithinCalendarMonths`,
          "Legal engine contract v6 requires the calendar-month compensation alternative.",
        ),
      );
    }
    if (
      rulePackage.engineContractVersion < 6 &&
      deviation.compensationWithinCalendarMonths !== undefined
    ) {
      issues.push(
        issue(
          "UNSUPPORTED_CALENDAR_MONTH_COMPENSATION",
          `${path}/compensationWithinCalendarMonths`,
          "Legal engine contracts before v6 must not define calendar-month compensation.",
        ),
      );
    }
  }
}

function validateHolidayPackage(
  rulePackage: HolidayPackage,
  sourceIds: Set<string>,
  issues: ValidationIssue[],
): void {
  const { holidays } = rulePackage.rules;
  if (rulePackage.validTo === null && rulePackage.engineContractVersion < 7) {
    issues.push(
      issue(
        "UNSUPPORTED_OPEN_HOLIDAY_PACKAGE_RANGE",
        "/validTo",
        "Open-ended holiday packages require holiday engine contract v7 or later.",
      ),
    );
  }
  reportDuplicates(
    holidays.map((holiday) => holiday.id),
    "/rules/holidays",
    "holiday id",
    issues,
  );

  for (const [index, holiday] of holidays.entries()) {
    const path = `/rules/holidays/${index}`;
    validateRange(holiday.validFrom, holiday.validTo, path, issues);
    validateSourceReferences(holiday.sourceIds, sourceIds, `${path}/sourceIds`, issues);

    if (holiday.validTo === null && rulePackage.engineContractVersion < 7) {
      issues.push(
        issue(
          "UNSUPPORTED_OPEN_HOLIDAY_RANGE",
          `${path}/validTo`,
          "Open-ended holiday rules require holiday engine contract v7 or later.",
        ),
      );
    }

    if (
      holiday.scope === "NATIONWIDE" &&
      (holiday.federalStates !== null || holiday.regionIds != null)
    ) {
      issues.push(
        issue(
          "INVALID_HOLIDAY_SCOPE",
          `${path}/federalStates`,
          "NATIONWIDE holidays must use federalStates and regionIds: null.",
        ),
      );
    }
    if (
      holiday.scope === "STATEWIDE" &&
      (holiday.federalStates === null || holiday.regionIds != null)
    ) {
      issues.push(
        issue(
          "INVALID_HOLIDAY_SCOPE",
          `${path}/federalStates`,
          "STATEWIDE holidays require federal states and must not define regionIds.",
        ),
      );
    }
    if (
      holiday.scope === "REGIONAL" &&
      (holiday.federalStates === null || holiday.regionIds == null)
    ) {
      issues.push(
        issue(
          "INVALID_HOLIDAY_SCOPE",
          `${path}/regionIds`,
          "REGIONAL holidays require at least one federal state and one region id.",
        ),
      );
    }
    if (
      holiday.validFrom < rulePackage.validFrom ||
      (rulePackage.validTo !== null &&
        (holiday.validTo === null || holiday.validTo > rulePackage.validTo))
    ) {
      issues.push(
        issue(
          "HOLIDAY_OUTSIDE_PACKAGE_RANGE",
          path,
          "Holiday validity must stay inside the package validity.",
        ),
      );
    }

    const calculation = holiday.calculation;
    if (
      rulePackage.validTo === null &&
      calculation.type !== "SPECIFIC_DATE" &&
      holiday.validTo !== null
    ) {
      issues.push(
        issue(
          "FINITE_RECURRING_HOLIDAY_IN_OPEN_PACKAGE",
          `${path}/validTo`,
          "Recurring holidays in an open-ended package must also be open-ended.",
        ),
      );
    }
    if (calculation.type === "FIXED_DATE") {
      const sample = `2000-${String(calculation.month).padStart(2, "0")}-${String(
        calculation.day,
      ).padStart(2, "0")}`;
      if (!isRealIsoDate(sample)) {
        issues.push(
          issue(
            "INVALID_FIXED_HOLIDAY_DATE",
            `${path}/calculation`,
            "The fixed month and day do not form a calendar date.",
          ),
        );
      }
    }
    if (calculation.type === "SPECIFIC_DATE") {
      validateDate(calculation.date, `${path}/calculation/date`, issues);
      if (holiday.validTo === null) {
        issues.push(
          issue(
            "OPEN_ENDED_SPECIFIC_HOLIDAY",
            `${path}/validTo`,
            "A specific holiday date must have a finite validity end.",
          ),
        );
      }
      if (
        calculation.date < holiday.validFrom ||
        (holiday.validTo !== null && calculation.date > holiday.validTo)
      ) {
        issues.push(
          issue(
            "SPECIFIC_HOLIDAY_OUTSIDE_RANGE",
            `${path}/calculation/date`,
            "The specific date must stay inside the holiday validity.",
          ),
        );
      }
    }
  }
}

function packageSemanticIssues(rulePackage: RulePackage): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  validateRange(rulePackage.validFrom, rulePackage.validTo, "", issues);
  if (rulePackage.status !== rulePackage.review.status) {
    issues.push(
      issue(
        "REVIEW_STATUS_MISMATCH",
        "/review/status",
        "Package status and review status must match.",
      ),
    );
  }
  if (
    rulePackage.review.reviewedAt !== null &&
    !isRealUtcTimestamp(rulePackage.review.reviewedAt)
  ) {
    issues.push(issue("INVALID_TIMESTAMP", "/review/reviewedAt", "Invalid UTC review timestamp."));
  }

  const sourceIds = new Set(rulePackage.sources.map((source) => source.id));
  reportDuplicates(
    rulePackage.sources.map((source) => source.id),
    "/sources",
    "source id",
    issues,
  );
  for (const [index, source] of rulePackage.sources.entries()) {
    validateDate(source.documentDate, `/sources/${index}/documentDate`, issues);
    try {
      const url = new URL(source.url);
      if (url.protocol !== "https:") throw new Error("not HTTPS");
    } catch {
      issues.push(
        issue("INVALID_SOURCE_URL", `/sources/${index}/url`, "Source URL must be valid HTTPS."),
      );
    }
  }

  switch (rulePackage.kind) {
    case "TARIFF":
      validateTariffPackage(rulePackage, sourceIds, issues);
      break;
    case "LEGAL":
      validateLegalPackage(rulePackage, sourceIds, issues);
      break;
    case "HOLIDAY":
      validateHolidayPackage(rulePackage, sourceIds, issues);
      break;
  }

  return issues;
}

function trackKey(track: Pick<Track, "packageId" | "kind">): string {
  return `${track.packageId}:${track.kind}`;
}

function descriptorIdentity(
  descriptor: Pick<PackageDescriptor, "packageId" | "versionId">,
): string {
  return `${descriptor.packageId}:${descriptor.versionId}`;
}

function manifestSemanticIssues(manifest: RuleManifest): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (!isRealUtcTimestamp(manifest.publishedAt)) {
    issues.push(
      issue("INVALID_TIMESTAMP", "/publishedAt", "publishedAt must be a real UTC timestamp."),
    );
  }
  if (
    manifest.rollbackOfGeneration !== null &&
    manifest.rollbackOfGeneration >= manifest.generation
  ) {
    issues.push(
      issue(
        "INVALID_ROLLBACK_GENERATION",
        "/rollbackOfGeneration",
        "A rollback must point to an earlier generation.",
      ),
    );
  }

  reportDuplicates(manifest.tracks.map(trackKey), "/tracks", "track", issues);
  reportDuplicates(
    manifest.packages.map(descriptorIdentity),
    "/packages",
    "package identity",
    issues,
  );
  reportDuplicates(
    manifest.packages.map((descriptor) => descriptor.path),
    "/packages",
    "package path",
    issues,
  );

  const tracks = new Map(manifest.tracks.map((track) => [trackKey(track), track]));
  for (const [index, track] of manifest.tracks.entries()) {
    validateRange(track.coverageFrom, track.coverageTo, `/tracks/${index}`, issues);
  }
  for (const [index, descriptor] of manifest.packages.entries()) {
    validateRange(descriptor.validFrom, descriptor.validTo, `/packages/${index}`, issues);
    if (!tracks.has(trackKey(descriptor))) {
      issues.push(
        issue(
          "MISSING_TRACK",
          `/packages/${index}`,
          `No matching track for ${descriptor.packageId} (${descriptor.kind}).`,
        ),
      );
    }
  }

  for (const [key, track] of tracks) {
    const descriptors = manifest.packages
      .filter((descriptor) => trackKey(descriptor) === key)
      .sort((left, right) => left.validFrom.localeCompare(right.validFrom));
    if (descriptors.length === 0) {
      issues.push(issue("EMPTY_TRACK", "/tracks", `Track ${key} has no packages.`));
      continue;
    }

    for (const descriptor of descriptors) {
      if (
        descriptor.validFrom < track.coverageFrom ||
        (track.coverageTo !== null &&
          (descriptor.validTo === null || descriptor.validTo > track.coverageTo))
      ) {
        issues.push(
          issue(
            "PACKAGE_OUTSIDE_TRACK",
            "/packages",
            `Package ${descriptorIdentity(descriptor)} exceeds track ${key}.`,
          ),
        );
      }
    }

    for (let index = 1; index < descriptors.length; index += 1) {
      const previous = descriptors[index - 1];
      const current = descriptors[index];
      if (previous.validTo === null || current.validFrom <= previous.validTo) {
        issues.push(
          issue("OVERLAPPING_PACKAGE_RANGE", "/packages", `Packages overlap in track ${key}.`),
        );
      }
    }

    if (track.coverage === "COMPLETE") {
      if (descriptors[0].validFrom !== track.coverageFrom) {
        issues.push(
          issue(
            "INCOMPLETE_TRACK_START",
            "/packages",
            `Track ${key} does not start at coverageFrom.`,
          ),
        );
      }
      for (let index = 1; index < descriptors.length; index += 1) {
        const previous = descriptors[index - 1];
        if (
          previous.validTo === null ||
          descriptors[index].validFrom !== nextIsoDate(previous.validTo)
        ) {
          issues.push(
            issue("INCOMPLETE_TRACK_GAP", "/packages", `Track ${key} contains a validity gap.`),
          );
        }
      }
      const finalValidTo = descriptors.at(-1)?.validTo ?? null;
      if (finalValidTo !== track.coverageTo) {
        issues.push(
          issue("INCOMPLETE_TRACK_END", "/packages", `Track ${key} does not end at coverageTo.`),
        );
      }
    }
  }

  return issues;
}

export function validateManifest(value: unknown): ValidationResult<RuleManifest> {
  if (!validateManifestSchema(value)) {
    return { ok: false, issues: schemaIssues(validateManifestSchema) };
  }
  const manifest = value as RuleManifest;
  const issues = manifestSemanticIssues(manifest);
  return issues.length === 0 ? { ok: true, value: manifest } : { ok: false, issues };
}

export function validateRuleCatalogPublicationRequest(
  value: unknown,
): ValidationResult<RuleCatalogPublicationRequest> {
  if (!validatePublicationRequestSchema(value)) {
    return { ok: false, issues: schemaIssues(validatePublicationRequestSchema) };
  }
  const request = value as RuleCatalogPublicationRequest;
  const issues: ValidationIssue[] = [];
  if (!isRealUtcTimestamp(request.publishedAt)) {
    issues.push(
      issue("INVALID_TIMESTAMP", "/publishedAt", "publishedAt must be a real UTC timestamp."),
    );
  }
  if (request.rollbackOfGeneration !== null && request.rollbackOfGeneration >= request.generation) {
    issues.push(
      issue(
        "INVALID_ROLLBACK_GENERATION",
        "/rollbackOfGeneration",
        "A rollback must point to an earlier generation.",
      ),
    );
  }
  const requiredKeyPrefix = request.channel === "PREVIEW" ? "preview-" : "production-";
  if (!request.signing.keyId.startsWith(requiredKeyPrefix)) {
    issues.push(
      issue(
        "SIGNING_KEY_CHANNEL_MISMATCH",
        "/signing/keyId",
        `${request.channel} key IDs must start with ${requiredKeyPrefix}.`,
      ),
    );
  }
  return issues.length === 0 ? { ok: true, value: request } : { ok: false, issues };
}

export function validateRulePackage(value: unknown): ValidationResult<RulePackage> {
  if (!validateRulePackageSchema(value)) {
    return { ok: false, issues: schemaIssues(validateRulePackageSchema) };
  }
  const rulePackage = value as RulePackage;
  const issues = packageSemanticIssues(rulePackage);
  return issues.length === 0 ? { ok: true, value: rulePackage } : { ok: false, issues };
}

export function validateRuleCatalog(
  manifestValue: unknown,
  packageValues: unknown[],
): ValidationResult<ValidatedRuleCatalog> {
  const manifestResult = validateManifest(manifestValue);
  if (!manifestResult.ok) return manifestResult;

  const packages: RulePackage[] = [];
  const issues: ValidationIssue[] = [];
  for (const [index, value] of packageValues.entries()) {
    const result = validateRulePackage(value);
    if (result.ok) {
      packages.push(result.value);
    } else {
      issues.push(
        ...result.issues.map((entry) => ({
          ...entry,
          path: `/catalogPackages/${index}${entry.path === "/" ? "" : entry.path}`,
        })),
      );
    }
  }
  if (issues.length > 0) return { ok: false, issues };

  const packageByIdentity = new Map(
    packages.map((rulePackage) => [descriptorIdentity(rulePackage), rulePackage]),
  );
  if (packageByIdentity.size !== packages.length) {
    issues.push(
      issue("DUPLICATE_PACKAGE", "/catalogPackages", "Package identities must be unique."),
    );
  }
  if (packages.length !== manifestResult.value.packages.length) {
    issues.push(
      issue(
        "CATALOG_SIZE_MISMATCH",
        "/catalogPackages",
        "Catalog packages must match manifest descriptors exactly.",
      ),
    );
  }

  for (const [index, descriptor] of manifestResult.value.packages.entries()) {
    const rulePackage = packageByIdentity.get(descriptorIdentity(descriptor));
    if (!rulePackage) {
      issues.push(
        issue(
          "MISSING_CATALOG_PACKAGE",
          `/packages/${index}`,
          `Missing package ${descriptorIdentity(descriptor)}.`,
        ),
      );
      continue;
    }
    if (
      rulePackage.kind !== descriptor.kind ||
      rulePackage.engineContractVersion !== descriptor.engineContractVersion ||
      rulePackage.validFrom !== descriptor.validFrom ||
      rulePackage.validTo !== descriptor.validTo
    ) {
      issues.push(
        issue(
          "DESCRIPTOR_PACKAGE_MISMATCH",
          `/packages/${index}`,
          `Descriptor metadata differs from ${descriptorIdentity(descriptor)}.`,
        ),
      );
    }
    if (rulePackage.status !== "PUBLISHED") {
      issues.push(
        issue(
          "UNPUBLISHED_CATALOG_PACKAGE",
          `/catalogPackages/${index}/status`,
          "Only PUBLISHED packages may appear in a signed catalog.",
        ),
      );
    }
  }

  return issues.length === 0
    ? { ok: true, value: { manifest: manifestResult.value, packages } }
    : { ok: false, issues };
}
