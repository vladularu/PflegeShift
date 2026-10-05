import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { Temporal } from "@js-temporal/polyfill";
import type { ComplianceIssue, ShiftEntry } from "@/domain/types";
import { usePalette } from "@/theme/palette";
import { MINIMUM_TOUCH_TARGET, SPACING } from "@/theme/tokens";
import { TYPOGRAPHY } from "@/theme/typography";
import { ColorBadge } from "@/ui/design-system";
import { selectionFeedback } from "@/ui/haptics";
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

const VISIBLE_SHIFT_COUNT = 3;

function compactShiftDate(date: string): string {
  try {
    const day = Temporal.PlainDate.from(date);
    return `${String(day.day).padStart(2, "0")}.${String(day.month).padStart(2, "0")}.${day.year}`;
  } catch {
    return "Datum nicht verfügbar";
  }
}

export function ComplianceIssueContent({
  issue,
  shifts,
}: {
  readonly issue: ComplianceIssue;
  readonly shifts: readonly ShiftEntry[];
}) {
  const p = usePalette();
  const [showAllShifts, setShowAllShifts] = useState(false);
  const ids = new Set(issue.relatedShiftIds);
  const related = shifts
    .filter((shift) => ids.has(shift.id) && shift.deletedAt === null)
    .sort(
      (a, b) =>
        a.date.localeCompare(b.date) ||
        (a.startTime ?? "").localeCompare(b.startTime ?? "") ||
        a.id.localeCompare(b.id),
    );
  const visibleShifts = showAllShifts ? related : related.slice(0, VISIBLE_SHIFT_COUNT);
  return (
    <View
      testID={"check-details-" + issue.id}
      style={{ gap: SPACING.sm, paddingBottom: SPACING.md }}
    >
      <Text selectable style={{ color: p.textSecondary, ...TYPOGRAPHY.body }}>
        {issue.description}
      </Text>
      {related.length ? (
        <View style={{ gap: SPACING.xs }}>
          <Text accessibilityRole="header" style={{ color: p.textMuted, ...TYPOGRAPHY.label }}>
            Betroffene Dienste · {related.length}
          </Text>
          {visibleShifts.map((shift, index) => {
            const time = shift.startTime
              ? `${shift.startTime}${shift.endTime ? `–${shift.endTime}` : ""}`
              : "Ganztägig";
            return (
              <View
                key={shift.id}
                testID={"check-shift-" + shift.id}
                accessible
                accessibilityLabel={`${shift.title}, ${checkDate(shift.date)}, ${time}`}
                style={{
                  minHeight: 48,
                  flexDirection: "row",
                  flexWrap: "wrap",
                  alignItems: "center",
                  gap: SPACING.sm,
                  paddingVertical: SPACING.xs,
                  borderTopWidth: index > 0 ? 1 : 0,
                  borderTopColor: p.separator,
                }}
              >
                <ColorBadge color={shift.color} label={shift.symbol} size={24} />
                <View style={{ flex: 1, minWidth: 0, gap: SPACING.xxs }}>
                  <Text style={{ color: p.text, ...TYPOGRAPHY.label }}>{shift.title}</Text>
                  <View
                    style={{
                      flexDirection: "row",
                      flexWrap: "wrap",
                      justifyContent: "space-between",
                      columnGap: SPACING.md,
                      rowGap: SPACING.xxs,
                    }}
                  >
                    <Text
                      style={{
                        color: p.textMuted,
                        ...TYPOGRAPHY.caption,
                        maxWidth: "100%",
                        fontVariant: ["tabular-nums"],
                      }}
                    >
                      {compactShiftDate(shift.date)}
                    </Text>
                    <Text
                      style={{
                        color: p.textSecondary,
                        ...TYPOGRAPHY.caption,
                        maxWidth: "100%",
                        fontVariant: ["tabular-nums"],
                      }}
                    >
                      {time}
                    </Text>
                  </View>
                </View>
              </View>
            );
          })}
          {related.length > VISIBLE_SHIFT_COUNT ? (
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ expanded: showAllShifts }}
              onPress={() => {
                selectionFeedback();
                setShowAllShifts((current) => !current);
              }}
              style={({ pressed }) => ({
                minHeight: MINIMUM_TOUCH_TARGET,
                justifyContent: "center",
                paddingVertical: SPACING.xs,
                opacity: pressed ? 0.6 : 1,
              })}
            >
              <Text style={{ color: p.primary, ...TYPOGRAPHY.label }}>
                {showAllShifts
                  ? "Weniger Dienste anzeigen"
                  : `Alle ${related.length} Dienste anzeigen`}
              </Text>
            </Pressable>
          ) : null}
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
