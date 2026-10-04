import { Temporal } from "@js-temporal/polyfill";
import type { ComplianceAssessmentRange, ComplianceIssue, ShiftEntry } from "@/domain/types";

/** Missing or malformed bounds are not evidence for an adult-only period. */
export function isAdultAssessmentRange(
  range: ComplianceAssessmentRange,
  isAdultOn: (date: string) => boolean,
): boolean {
  try {
    const first = Temporal.PlainDate.from(range.from);
    const last = Temporal.PlainDate.from(range.through);
    if (Temporal.PlainDate.compare(first, last) > 0) return false;
    for (
      let date = first;
      Temporal.PlainDate.compare(date, last) <= 0;
      date = date.add({ days: 1 })
    )
      if (!isAdultOn(date.toString())) return false;
    return true;
  } catch {
    return false;
  }
}

export function isAdultAssessmentFinding(
  finding: ComplianceIssue,
  shifts: readonly ShiftEntry[],
  isAdultOn: (date: string) => boolean,
): boolean {
  if (finding.kind !== "LEGAL" || !isAdultOn(finding.date) || !finding.assessmentRanges?.length)
    return false;
  if (!finding.assessmentRanges.every((range) => isAdultAssessmentRange(range, isAdultOn)))
    return false;
  return finding.relatedShiftIds.every((id) => {
    const candidates = shifts.filter((shift) => shift.id === id && shift.deletedAt === null);
    if (candidates.length !== 1 || !isAdultOn(candidates[0].date)) return false;
    const { date, startTime, endTime } = candidates[0];
    return (
      startTime === null ||
      endTime === null ||
      endTime > startTime ||
      endTime === "00:00" ||
      isAdultOn(Temporal.PlainDate.from(date).add({ days: 1 }).toString())
    );
  });
}

// These checks depend only on the referenced services, not on a whole adult
// month/year, night-worker qualification or a compensation window.
const SERVICE_SCOPED_ADULT_RULES = new Set([
  "ARBZG_3_MAX_10H",
  "ARBZG_4_BREAK",
  "ARBZG_4_INTERRUPTION",
  "ARBZG_4_CONTINUOUS",
  "ARBZG_5_REST_10H",
  "TIME_PLAUSIBILITY",
]);

/** Preserve evidence, but never use a report's display date as its whole legal scope. */
export function isAdultServiceFinding(
  finding: ComplianceIssue,
  shifts: readonly ShiftEntry[],
  isAdultOn: (date: string) => boolean,
): boolean {
  if (
    finding.kind !== "LEGAL" ||
    !SERVICE_SCOPED_ADULT_RULES.has(finding.rule) ||
    !isAdultOn(finding.date) ||
    finding.relatedShiftIds.length === 0
  )
    return false;
  return finding.relatedShiftIds.every((id) => {
    const candidates = shifts.filter((shift) => shift.id === id && shift.deletedAt === null);
    if (candidates.length !== 1) return false;
    const shift = candidates[0];
    if (!isAdultOn(shift.date) || shift.startTime === null || shift.endTime === null) return false;
    // A service ending at midnight does not occupy the following calendar day.
    if (shift.endTime <= shift.startTime && shift.endTime !== "00:00")
      return isAdultOn(Temporal.PlainDate.from(shift.date).add({ days: 1 }).toString());
    return true;
  });
}
