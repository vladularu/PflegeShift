import type { CalendarEntry, ComplianceIssue, ShiftEntry, UserProfile } from "@/domain/types";
import { calculateMonthlyCompliance } from "@/engine/compliance";
import type { RuleResolver } from "@/rules/rule-resolver";

export function criticalIssueForSavedShift(
  saved: ShiftEntry,
  entries: readonly CalendarEntry[],
  profile: UserProfile,
  ruleResolver: RuleResolver,
): ComplianceIssue | null {
  const shifts = entries
    .filter((entry): entry is ShiftEntry => entry.kind === "SHIFT" && entry.id !== saved.id)
    .concat(saved);
  return (
    calculateMonthlyCompliance(saved.date.slice(0, 7), shifts, profile.timeZone, {
      allEmploymentWorkRecorded: profile.allEmploymentWorkRecorded,
      federalState: profile.federalState,
      holidayRegion: profile.holidayRegion,
      regularRotatingNightWork: profile.regularRotatingNightWork,
      ruleResolver,
      sundayHolidayWorkEligible: profile.sundayHolidayWorkEligible,
      weeklyMinutes: profile.weeklyMinutes,
    }).issues.find(
      (issue) => issue.severity === "critical" && issue.relatedShiftIds.includes(saved.id),
    ) ?? null
  );
}
