import { describe, expect, it } from "vitest";

import holidayPackageFixture from "../../rules/examples/holiday-package.valid.json";
import legalPackageFixture from "../../rules/examples/legal-package.valid.json";
import manifestFixture from "../../rules/examples/manifest.valid.json";
import tariffPackageFixture from "../../rules/examples/tariff-package.valid.json";
import {
  validateManifest,
  validateRuleCatalog,
  validateRulePackage,
  type ValidationResult,
} from "./validation";

function clone<T>(value: T): T {
  return structuredClone(value);
}

function issueCodes(result: ValidationResult<unknown>): string[] {
  expect(result.ok).toBe(false);
  return result.ok ? [] : result.issues.map((entry) => entry.code);
}

describe("rule contract validation", () => {
  it("accepts the versioned example catalog", () => {
    expect(validateRulePackage(tariffPackageFixture).ok).toBe(true);
    expect(validateRulePackage(legalPackageFixture).ok).toBe(true);
    expect(validateRulePackage(holidayPackageFixture).ok).toBe(true);
    expect(validateManifest(manifestFixture).ok).toBe(true);
    expect(
      validateRuleCatalog(manifestFixture, [
        tariffPackageFixture,
        legalPackageFixture,
        holidayPackageFixture,
      ]).ok,
    ).toBe(true);
  });

  it("rejects executable or otherwise unknown fields", () => {
    const rulePackage = clone(tariffPackageFixture) as Record<string, unknown>;
    rulePackage.script = "return user.salary * 2";

    expect(issueCodes(validateRulePackage(rulePackage))).toContain("SCHEMA_ADDITIONALPROPERTIES");
  });

  it("rejects fractional money values", () => {
    const rulePackage = clone(tariffPackageFixture);
    rulePackage.rules.payTables[0].entries[0].monthlyCents = 367500.5;

    expect(issueCodes(validateRulePackage(rulePackage))).toContain("SCHEMA_TYPE");
  });

  it("rejects non-HTTPS sources and impossible dates", () => {
    const insecurePackage = clone(legalPackageFixture);
    insecurePackage.sources[0].url = "http://example.test/rules";
    expect(issueCodes(validateRulePackage(insecurePackage))).toContain("SCHEMA_PATTERN");

    const impossibleDatePackage = clone(legalPackageFixture);
    impossibleDatePackage.validFrom = "2026-02-31";
    expect(issueCodes(validateRulePackage(impossibleDatePackage))).toContain("INVALID_DATE");

    const impossibleTimestampManifest = clone(manifestFixture);
    impossibleTimestampManifest.publishedAt = "2026-02-31T12:00:00Z";
    expect(issueCodes(validateManifest(impossibleTimestampManifest))).toContain(
      "INVALID_TIMESTAMP",
    );
  });

  it("requires review evidence for reviewed and published packages", () => {
    const rulePackage = clone(legalPackageFixture);
    rulePackage.review.reviewedBy = null as never;

    expect(issueCodes(validateRulePackage(rulePackage))).toContain("SCHEMA_TYPE");
  });

  it("accepts a solo owner review without a legal name, role, or second reviewer", () => {
    const rulePackage = clone(legalPackageFixture);
    rulePackage.review.reviewedBy = "project-owner";

    expect(validateRulePackage(rulePackage).ok).toBe(true);
    expect(rulePackage.review).not.toHaveProperty("role");
  });

  it("rejects complete tracks with gaps or overlaps", () => {
    const gapManifest = clone(manifestFixture);
    gapManifest.packages[0].validTo = "2026-12-31";
    gapManifest.packages.splice(1, 0, {
      ...clone(gapManifest.packages[0]),
      versionId: "2027-02",
      validFrom: "2027-02-01",
      validTo: "2027-03-31",
      path: "packages/tvoed-vka-bt-k/2027-02.json",
      sha256: "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd",
    });
    expect(issueCodes(validateManifest(gapManifest))).toContain("INCOMPLETE_TRACK_GAP");

    const overlapManifest = clone(gapManifest);
    overlapManifest.packages[1].validFrom = "2026-12-15";
    expect(issueCodes(validateManifest(overlapManifest))).toContain("OVERLAPPING_PACKAGE_RANGE");
  });

  it("rejects dangling source and combination references", () => {
    const unknownSourcePackage = clone(tariffPackageFixture);
    unknownSourcePackage.rules.premiumRules[0].sourceIds = ["missing-source"];
    expect(issueCodes(validateRulePackage(unknownSourcePackage))).toContain("UNKNOWN_SOURCE_ID");

    const unknownMemberPackage = clone(tariffPackageFixture);
    unknownMemberPackage.rules.combinationRules[0].memberRuleIds = ["night", "missing-rule"];
    expect(issueCodes(validateRulePackage(unknownMemberPackage))).toContain(
      "UNKNOWN_COMBINATION_MEMBER",
    );
  });

  it("enforces the tariff overtime-base contract for engine v2", () => {
    type VersionedTariffFixture = typeof tariffPackageFixture & {
      engineContractVersion: number;
      rules: typeof tariffPackageFixture.rules & {
        overtimeBaseRule?: { maximumStepId: string; sourceIds: string[] };
      };
    };
    const v2Package = clone(tariffPackageFixture) as VersionedTariffFixture;
    v2Package.engineContractVersion = 2;
    v2Package.rules.overtimeBaseRule = {
      maximumStepId: "s2",
      sourceIds: ["tvoed-vka-2026"],
    };
    expect(validateRulePackage(v2Package).ok).toBe(true);
    const v2Manifest = clone(manifestFixture);
    v2Manifest.packages[0].engineContractVersion = 2;
    expect(
      validateRuleCatalog(v2Manifest, [v2Package, legalPackageFixture, holidayPackageFixture]).ok,
    ).toBe(true);

    const missingRule = clone(v2Package);
    delete missingRule.rules.overtimeBaseRule;
    expect(issueCodes(validateRulePackage(missingRule))).toContain("MISSING_OVERTIME_BASE_RULE");

    const missingStep = clone(v2Package);
    missingStep.rules.overtimeBaseRule!.maximumStepId = "s4";
    expect(issueCodes(validateRulePackage(missingStep))).toContain("UNKNOWN_OVERTIME_BASE_STEP");

    const v1WithRule = clone(v2Package);
    v1WithRule.engineContractVersion = 1;
    expect(issueCodes(validateRulePackage(v1WithRule))).toContain("UNSUPPORTED_OVERTIME_BASE_RULE");
  });

  it("enforces night-worker qualification for legal engine v3 and newer", () => {
    type VersionedLegalFixture = typeof legalPackageFixture & {
      engineContractVersion: number;
      rules: typeof legalPackageFixture.rules & {
        workingTime: typeof legalPackageFixture.rules.workingTime & {
          standardAverage?: {
            calendarMonths: number;
            weeks: number;
            assessmentMode: "FORWARD_FROM_EXTENDED_WORKDAY";
            neutralAbsenceTypes: ["VACATION", "SICK"];
          };
        };
        nightWork: typeof legalPackageFixture.rules.nightWork & {
          workerQualification?: {
            regularRotatingNightWorkRequiresConfirmation: true;
            annualNightWorkDaysThreshold: number;
          };
        };
      };
    };
    const v3Package = clone(legalPackageFixture) as VersionedLegalFixture;
    v3Package.engineContractVersion = 3;
    v3Package.rules.nightWork.workerQualification = {
      regularRotatingNightWorkRequiresConfirmation: true,
      annualNightWorkDaysThreshold: 48,
    };
    expect(validateRulePackage(v3Package).ok).toBe(true);

    const missingQualification = clone(v3Package);
    delete missingQualification.rules.nightWork.workerQualification;
    expect(issueCodes(validateRulePackage(missingQualification))).toContain(
      "MISSING_NIGHT_WORKER_QUALIFICATION",
    );

    const v1WithQualification = clone(v3Package);
    v1WithQualification.engineContractVersion = 1;
    expect(issueCodes(validateRulePackage(v1WithQualification))).toContain(
      "UNSUPPORTED_NIGHT_WORKER_QUALIFICATION",
    );

    const v4Package = clone(v3Package);
    v4Package.engineContractVersion = 4;
    v4Package.rules.workingTime.standardAverage = {
      calendarMonths: 6,
      weeks: 24,
      assessmentMode: "FORWARD_FROM_EXTENDED_WORKDAY",
      neutralAbsenceTypes: ["VACATION", "SICK"],
    };
    expect(validateRulePackage(v4Package).ok).toBe(true);

    const v4MissingQualification = clone(v4Package);
    delete v4MissingQualification.rules.nightWork.workerQualification;
    expect(issueCodes(validateRulePackage(v4MissingQualification))).toContain(
      "MISSING_NIGHT_WORKER_QUALIFICATION",
    );

    const v4MissingAverage = clone(v4Package);
    delete v4MissingAverage.rules.workingTime.standardAverage;
    expect(issueCodes(validateRulePackage(v4MissingAverage))).toContain(
      "MISSING_STANDARD_WORKING_TIME_AVERAGE",
    );

    const v3WithAverage = clone(v4Package);
    v3WithAverage.engineContractVersion = 3;
    expect(issueCodes(validateRulePackage(v3WithAverage))).toContain(
      "UNSUPPORTED_STANDARD_WORKING_TIME_AVERAGE",
    );
  });

  it("rejects invalid allowance ranges and work-pattern boundaries", () => {
    const allowanceOutsidePackage = clone(tariffPackageFixture);
    allowanceOutsidePackage.rules.allowanceRules[0].validFrom = "2026-04-30";
    expect(issueCodes(validateRulePackage(allowanceOutsidePackage))).toContain(
      "ALLOWANCE_OUTSIDE_PACKAGE_RANGE",
    );

    const invalidBoundaries = clone(tariffPackageFixture);
    invalidBoundaries.rules.workPatternPolicy.shiftWindowBoundaries.dayEndMinute = 1300;
    expect(issueCodes(validateRulePackage(invalidBoundaries))).toContain(
      "INVALID_SHIFT_WINDOW_BOUNDARIES",
    );

    const impossibleMonthDay = clone(tariffPackageFixture);
    impossibleMonthDay.rules.premiumRules[0].conditions.monthDays = ["02-31"] as never;
    expect(issueCodes(validateRulePackage(impossibleMonthDay))).toContain("INVALID_MONTH_DAY");
  });

  it("enforces holiday scope semantics", () => {
    const rulePackage = clone(holidayPackageFixture);
    rulePackage.rules.holidays[0].federalStates = ["BY"];

    expect(issueCodes(validateRulePackage(rulePackage))).toContain("INVALID_HOLIDAY_SCOPE");
  });

  it("rejects manifest descriptors that differ from their package", () => {
    const manifest = clone(manifestFixture);
    manifest.tracks[0].coverageTo = "2027-04-30";
    manifest.packages[0].validTo = "2027-04-30";

    expect(
      issueCodes(
        validateRuleCatalog(manifest, [
          tariffPackageFixture,
          legalPackageFixture,
          holidayPackageFixture,
        ]),
      ),
    ).toContain("DESCRIPTOR_PACKAGE_MISMATCH");
  });
});
