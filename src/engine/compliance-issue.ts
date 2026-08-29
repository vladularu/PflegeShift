import type {
  ComplianceIssue,
  ComplianceKind,
  ComplianceSeverity,
  ShiftEntry,
} from "@/domain/types";

function stableId(rule: string, date: string, shiftIds: readonly string[]): string {
  return `${rule}:${date}:${[...shiftIds].sort().join(",")}`;
}

export function createComplianceIssue(
  severity: ComplianceSeverity,
  kind: ComplianceKind,
  rule: string,
  title: string,
  description: string,
  related: readonly ShiftEntry[],
  date = related.at(-1)?.date ?? "0000-00-00",
): ComplianceIssue {
  const relatedShiftIds = related.map((shift) => shift.id);
  return {
    id: stableId(rule, date, relatedShiftIds),
    severity,
    kind,
    rule,
    title,
    description,
    relatedShiftIds,
    date,
  };
}
