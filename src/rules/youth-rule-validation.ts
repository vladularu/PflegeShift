import { Temporal } from "@js-temporal/polyfill";
import type { RuleLegalPackage } from "./contracts.generated";
import type { ValidationIssue } from "./validation";

export function youthRuleIssues(rulePackage: RuleLegalPackage): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const rules = rulePackage.rules.youthProtection;
  const adult = rulePackage.rules.adultTraining;
  if (rulePackage.engineContractVersion >= 9 && adult === undefined)
    issues.push({
      code: "MISSING_TRAINING_RULES",
      path: "/rules/adultTraining",
      message: "Legal contract v9 requires explicit adult training rules.",
    });
  if (adult !== undefined) {
    if (rulePackage.engineContractVersion < 9)
      issues.push({
        code: "UNSUPPORTED_TRAINING_RULES",
        path: "/rules/adultTraining",
        message: "Adult training rules require contract v9.",
      });
    if (
      adult.minimumAge !== rules?.adultAge ||
      adult.bbig.school.blockLessonCount < adult.bbig.school.protectedDayLessonCount
    )
      issues.push({
        code: "INCONSISTENT_TRAINING_RULES",
        path: "/rules/adultTraining",
        message: "Adult eligibility or school thresholds are inconsistent.",
      });
    if (rulePackage.engineContractVersion >= 10 && adult.bbig.exam === undefined)
      issues.push({
        code: "MISSING_BBIG_EXAM_RULES",
        path: "/rules/adultTraining/bbig/exam",
        message: "Legal contract v10 requires explicit BBiG exam rules.",
      });
    if (rulePackage.engineContractVersion < 10 && adult.bbig.exam !== undefined)
      issues.push({
        code: "UNSUPPORTED_BBIG_EXAM_RULES",
        path: "/rules/adultTraining/bbig/exam",
        message: "BBiG exam rules require legal contract v10.",
      });
    if (
      adult.bbig.exam !== undefined &&
      (!adult.bbig.exam.releaseRequiredOutsideParticipation ||
        !adult.bbig.exam.releasePrecedingWrittenFinalWorkday ||
        !adult.bbig.exam.creditParticipationBreaksNecessaryTravel ||
        !adult.bbig.exam.creditPrecedingAverageDay)
    )
      issues.push({
        code: "INCOMPLETE_BBIG_EXAM_RULES",
        path: "/rules/adultTraining/bbig/exam",
        message: "The § 15 BBiG exam contract is incomplete.",
      });
    if (rulePackage.engineContractVersion >= 10 && adult.pflbg.examRelease !== true)
      issues.push({
        code: "MISSING_PFLBG_EXAM_RELEASE",
        path: "/rules/adultTraining/pflbg/examRelease",
        message: "Legal contract v10 requires explicit PflBG exam release.",
      });
    if (rulePackage.engineContractVersion < 10 && adult.pflbg.examRelease !== undefined)
      issues.push({
        code: "UNSUPPORTED_PFLBG_EXAM_RELEASE",
        path: "/rules/adultTraining/pflbg/examRelease",
        message: "PflBG exam release requires legal contract v10.",
      });
  }
  const fail = (code: string, suffix: string, message: string) =>
    issues.push({ code, path: "/rules/youthProtection" + suffix, message });
  if (rules === undefined) {
    if (rulePackage.engineContractVersion >= 9)
      fail("MISSING_YOUTH_RULES", "", "Legal contract v9 requires youth rules.");
    return issues;
  }
  if (rulePackage.engineContractVersion < 9)
    fail("UNSUPPORTED_YOUTH_RULES", "", "Youth rules require legal contract v9.");
  if (rulePackage.engineContractVersion >= 10 && rules.exam === undefined)
    fail("MISSING_YOUTH_EXAM_RULES", "/exam", "Legal contract v10 requires exam rules.");
  if (rulePackage.engineContractVersion < 10 && rules.exam !== undefined)
    fail("UNSUPPORTED_YOUTH_EXAM_RULES", "/exam", "Exam rules require legal contract v10.");
  if (
    rules.exam !== undefined &&
    (!rules.exam.releaseRequiredOutsideParticipation ||
      !rules.exam.releasePrecedingWrittenFinalWorkday ||
      !rules.exam.creditParticipationBreaksNecessaryTravel ||
      !rules.exam.creditPrecedingAverageDay)
  )
    fail("INCOMPLETE_YOUTH_EXAM_RULES", "/exam", "The § 10 exam contract is incomplete.");
  if (rules.minimumAge >= rules.adultAge)
    fail("INVALID_YOUTH_AGES", "", "Minimum youth age must precede adulthood.");
  const work = rules.workingTime,
    window = rules.employmentWindow;
  if (
    work.reducedWeekDailyMinutes < work.dailyMinutes ||
    work.shiftSpanMinutes < work.reducedWeekDailyMinutes ||
    work.weeklyMinutes < work.dailyMinutes
  )
    fail(
      "INVALID_YOUTH_WORK_LIMITS",
      "/workingTime",
      "Youth work duration limits are inconsistent.",
    );
  if (
    window.startMinute >= window.endMinute ||
    window.multiShiftEndMinute < window.endMinute ||
    window.multiShiftMinimumAge < rules.minimumAge ||
    window.multiShiftMinimumAge >= rules.adultAge
  )
    fail(
      "INVALID_YOUTH_EMPLOYMENT_WINDOW",
      "/employmentWindow",
      "Youth employment windows or age limits are inconsistent.",
    );
  let previousThreshold = -1,
    previousRequired = -1;
  for (const [index, tier] of rules.breaks.tiers.entries()) {
    if (
      tier.overMinutes <= previousThreshold ||
      tier.requiredMinutes < previousRequired ||
      tier.requiredMinutes < rules.breaks.minimumSegmentMinutes
    )
      fail(
        "INVALID_YOUTH_BREAK_TIERS",
        `/breaks/tiers/${index}`,
        "Youth break thresholds must increase and required breaks must not decrease.",
      );
    previousThreshold = tier.overMinutes;
    previousRequired = tier.requiredMinutes;
  }
  for (const field of ["absoluteFixedHolidays", "shortEveDays"] as const) {
    for (const [index, date] of rules.daysOff[field].entries()) {
      try {
        Temporal.PlainDate.from("2000-" + date);
      } catch {
        fail(
          "INVALID_YOUTH_CALENDAR_DATE",
          `/daysOff/${field}/${index}`,
          "Invalid recurring calendar date.",
        );
      }
    }
  }
  if (rules.school.blockLessonCount < rules.school.protectedDayLessonCount)
    fail(
      "INVALID_YOUTH_SCHOOL_COUNTS",
      "/school",
      "Block lesson threshold must not be smaller than the protected day threshold.",
    );
  return issues;
}
