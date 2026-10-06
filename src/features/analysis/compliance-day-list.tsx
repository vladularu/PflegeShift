import Ionicons from "@expo/vector-icons/Ionicons";
import { useMemo } from "react";
import { Text, View } from "react-native";
import type { MonthlyComplianceResult, ShiftEntry } from "@/domain/types";
import { usePalette } from "@/theme/palette";
import { SPACING } from "@/theme/tokens";
import { TYPOGRAPHY } from "@/theme/typography";
import { AnalysisCoverageNote } from "./analysis-coverage-note";
import { PLANNING_HIDDEN_NOTICE, selectVisibleCompliance } from "./check-visibility";
import {
  ComplianceIssueContent,
  issueCategory,
  issueSeverity,
  checkDate,
} from "./compliance-issue-content";
import { complianceTimeline } from "./compliance-timeline";
const PRIORITY = { critical: 0, warning: 1, info: 2 };

export function ComplianceDayList({
  compliance,
  shifts,
  showPlanning,
  timeZone,
}: {
  readonly compliance: MonthlyComplianceResult;
  readonly shifts: readonly ShiftEntry[];
  readonly showPlanning: boolean;
  readonly timeZone: string;
}) {
  const palette = usePalette();
  const issues = useMemo(
    () =>
      [...selectVisibleCompliance(compliance, showPlanning).issues].sort(
        (a, b) =>
          a.date.localeCompare(b.date) ||
          PRIORITY[a.severity] - PRIORITY[b.severity] ||
          a.id.localeCompare(b.id),
      ),
    [compliance, showPlanning],
  );
  const days = [...new Set(issues.map((issue) => issue.date))];
  return (
    <View style={{ gap: SPACING.xxl, flexGrow: issues.length ? undefined : 1 }}>
      {!showPlanning ? <AnalysisCoverageNote message={PLANNING_HIDDEN_NOTICE} /> : null}
      {!issues.length ? (
        <View
          testID="check-complete"
          style={{
            flexGrow: 1,
            minHeight: 280,
            justifyContent: "center",
            alignItems: "center",
            gap: SPACING.md,
          }}
        >
          <Ionicons
            name="checkmark-circle-outline"
            color={palette.success}
            size={104}
            accessibilityElementsHidden
            importantForAccessibility="no"
          />
          <Text
            accessibilityRole="header"
            style={{ color: palette.text, ...TYPOGRAPHY.sectionTitle }}
          >
            {showPlanning ? "Prüfung abgeschlossen" : "Gesetzliche Prüfung"}
          </Text>
          <Text style={{ color: palette.textMuted, ...TYPOGRAPHY.body }}>
            Keine Auffälligkeiten
          </Text>
        </View>
      ) : null}
      {days.map((date) => {
        const dayIssues = issues.filter((issue) => issue.date === date);
        const sharedCategory = dayIssues.every((issue) => issue.kind === dayIssues[0].kind);
        return (
          <View key={date} style={{ gap: SPACING.md }}>
            <View
              style={{
                flexDirection: "row",
                flexWrap: "wrap",
                alignItems: "baseline",
                justifyContent: "space-between",
                gap: SPACING.sm,
              }}
            >
              <Text
                accessibilityRole="header"
                style={{ color: palette.text, ...TYPOGRAPHY.sectionTitle }}
              >
                {checkDate(date, false)}
              </Text>
              {sharedCategory ? (
                <Text style={{ color: palette.textMuted, ...TYPOGRAPHY.body }}>
                  {issueCategory(dayIssues[0])}
                </Text>
              ) : null}
            </View>
            {dayIssues.map((issue) => {
              const model = complianceTimeline(issue, shifts, timeZone);
              return (
                <View key={issue.id} style={{ gap: SPACING.md }}>
                  {!model.series || !sharedCategory ? (
                    <View
                      style={{ flexDirection: "row", alignItems: "flex-start", gap: SPACING.sm }}
                    >
                      <Ionicons
                        name={
                          issue.severity === "critical"
                            ? "alert-circle-outline"
                            : issue.severity === "warning"
                              ? "warning-outline"
                              : "information-circle-outline"
                        }
                        size={20}
                        color={
                          issue.severity === "critical"
                            ? palette.danger
                            : issue.severity === "warning"
                              ? palette.warning
                              : palette.primary
                        }
                        accessibilityElementsHidden
                        importantForAccessibility="no"
                      />
                      <View style={{ flex: 1, minWidth: 0, gap: SPACING.xxs }}>
                        {!model.series ? (
                          <Text
                            accessibilityLabel={`${model.title}, ${issueCategory(issue)}, ${issueSeverity(issue)}`}
                            style={{ color: palette.text, ...TYPOGRAPHY.bodyStrong }}
                          >
                            {model.title}
                          </Text>
                        ) : null}
                        {!sharedCategory ? (
                          <Text style={{ color: palette.textMuted, ...TYPOGRAPHY.body }}>
                            {issueCategory(issue)}
                          </Text>
                        ) : null}
                      </View>
                    </View>
                  ) : null}
                  <ComplianceIssueContent issue={issue} shifts={shifts} timeZone={timeZone} />
                </View>
              );
            })}
          </View>
        );
      })}
    </View>
  );
}
