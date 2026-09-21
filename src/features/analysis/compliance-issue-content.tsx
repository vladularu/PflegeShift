import { Text, View } from "react-native";
import { Temporal } from "@js-temporal/polyfill";
import type { ComplianceIssue, ShiftEntry } from "@/domain/types";
import { usePalette } from "@/theme/palette";
import { SPACING } from "@/theme/tokens";
import { TYPOGRAPHY } from "@/theme/typography";
import { ColorBadge } from "@/ui/design-system";
const MONTHS = [
  "Januar",
  "Februar",
  "März",
  "April",
  "Mai",
  "Juni",
  "Juli",
  "August",
  "September",
  "Oktober",
  "November",
  "Dezember",
];
export function checkDate(date: string, includeYear = true): string {
  try {
    const day = Temporal.PlainDate.from(date);
    return String(day.day) + ". " + MONTHS[day.month - 1] + (includeYear ? " " + day.year : "");
  } catch {
    return "Datum nicht verfügbar";
  }
}
export const issueCategory = (issue: ComplianceIssue) =>
  issue.kind === "PLANNING" ? "Planung" : "Gesetzlich";
export const issueSeverity = (issue: ComplianceIssue) =>
  issue.severity === "critical" ? "Kritisch" : issue.severity === "warning" ? "Warnung" : "Hinweis";

export function ComplianceIssueContent({
  issue,
  shifts,
}: {
  readonly issue: ComplianceIssue;
  readonly shifts: readonly ShiftEntry[];
}) {
  const p = usePalette();
  const ids = new Set(issue.relatedShiftIds);
  const related = shifts
    .filter((shift) => ids.has(shift.id) && shift.deletedAt === null)
    .sort(
      (a, b) =>
        a.date.localeCompare(b.date) ||
        (a.startTime ?? "").localeCompare(b.startTime ?? "") ||
        a.id.localeCompare(b.id),
    );
  return (
    <View
      testID={"check-details-" + issue.id}
      style={{ gap: SPACING.md, paddingBottom: SPACING.lg }}
    >
      <Text selectable style={{ color: p.textSecondary, ...TYPOGRAPHY.body }}>
        {issue.description}
      </Text>
      {related.length ? (
        <View style={{ gap: SPACING.sm }}>
          <Text accessibilityRole="header" style={{ color: p.text, ...TYPOGRAPHY.sectionTitle }}>
            Betroffene Dienste
          </Text>
          {related.map((shift) => (
            <View
              key={shift.id}
              style={{
                minHeight: 72,
                flexDirection: "row",
                alignItems: "center",
                gap: SPACING.md,
                paddingVertical: SPACING.md,
                borderBottomWidth: 1,
                borderBottomColor: p.separator,
              }}
            >
              <ColorBadge color={shift.color} label={shift.symbol} size={32} />
              <View style={{ flex: 1, gap: SPACING.xs }}>
                <Text style={{ color: p.text, ...TYPOGRAPHY.bodyStrong }}>{shift.title}</Text>
                <Text style={{ color: p.textMuted, ...TYPOGRAPHY.caption }}>
                  {checkDate(shift.date)}
                </Text>
                <Text
                  style={{
                    color: p.textSecondary,
                    ...TYPOGRAPHY.body,
                    fontVariant: ["tabular-nums"],
                  }}
                >
                  {shift.startTime ?? "Ganztägig"}
                  {shift.endTime ? `–${shift.endTime}` : ""}
                </Text>
              </View>
            </View>
          ))}
        </View>
      ) : null}
      {related.length < ids.size ? (
        <Text style={{ color: p.textMuted, ...TYPOGRAPHY.caption }}>
          Einige zugehörige Dienste sind nicht mehr verfügbar.
        </Text>
      ) : null}
    </View>
  );
}
