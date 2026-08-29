import type { ComplianceIssue, FederalState, HolidayRegion } from "@/domain/types";
import { isNightWork } from "@/engine/compliance-night-work";
import type { ComplianceInterval } from "@/engine/compliance-sequences";
import { createComplianceIssue as issue } from "@/engine/compliance-issue";
import type { RuleLegalRules } from "@/rules/contracts.generated";

export interface ComplianceEvidenceOptions {
  readonly allEmploymentWorkRecorded?: boolean | null;
  readonly federalState?: FederalState;
  readonly holidayRegion?: HolidayRegion;
  readonly regularRotatingNightWork?: boolean | null;
}

export function checkEvidenceCompleteness(
  month: string,
  intervals: readonly ComplianceInterval[],
  options: ComplianceEvidenceOptions,
  rules: RuleLegalRules,
): ComplianceIssue[] {
  const monthIntervals = intervals.filter((item) => item.shift.date.startsWith(`${month}-`));
  const firstShift = monthIntervals[0]?.shift;
  if (!firstShift) return [];
  const issues: ComplianceIssue[] = [];
  if (options.allEmploymentWorkRecorded !== true) {
    issues.push(
      issue(
        "warning",
        "LEGAL",
        "ARBZG_DATA_ALL_EMPLOYMENT",
        "Gesamtarbeitszeit noch nicht bestätigt",
        "Die ArbZG-Prüfung ist nur vollständig, wenn Arbeitszeiten aus allen Arbeitsverhältnissen erfasst sind.",
        [firstShift],
      ),
    );
  }
  if (
    options.regularRotatingNightWork == null &&
    monthIntervals.some((item) => isNightWork(item, rules))
  ) {
    issues.push(
      issue(
        "warning",
        "LEGAL",
        "ARBZG_6_NIGHT_STATUS_UNKNOWN",
        "Nachtarbeitnehmer-Status offen",
        "Bitte bestätigen, ob regelmäßig Nacht- oder Wechselschichtarbeit geleistet wird. Ohne diese Angabe kann die strengere Nachtarbeitsprüfung unvollständig sein.",
        [firstShift],
      ),
    );
  }
  if (
    options.holidayRegion === "UNKNOWN" &&
    options.federalState !== undefined &&
    ["BY", "SN", "TH"].includes(options.federalState)
  ) {
    issues.push(
      issue(
        "warning",
        "LEGAL",
        "HOLIDAY_REGION_UNKNOWN",
        "Regionale Feiertage noch nicht festgelegt",
        "Für den Arbeitsort ist offen, ob ein regionaler gesetzlicher Feiertag gilt. Feiertags- und Ersatzruheprüfungen können deshalb unvollständig sein.",
        [firstShift],
      ),
    );
  }
  return issues;
}
