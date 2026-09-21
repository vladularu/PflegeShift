import Ionicons from "@expo/vector-icons/Ionicons";
import { useEffect, useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";
import type { MonthlyComplianceResult, ShiftEntry } from "@/domain/types";
import { usePalette } from "@/theme/palette";
import { SPACING } from "@/theme/tokens";
import { TYPOGRAPHY } from "@/theme/typography";
import { selectionFeedback } from "@/ui/haptics";
import { AnalysisCoverageNote } from "./analysis-coverage-note";
import Animated, { FadeIn, LinearTransition } from "react-native-reanimated";
import { MOTION } from "@/theme/motion";
import { PLANNING_HIDDEN_NOTICE, selectVisibleCompliance } from "./check-visibility";
import {
  ComplianceIssueContent,
  issueCategory,
  issueSeverity,
  checkDate,
} from "./compliance-issue-content";

const PRIORITY = { critical: 0, warning: 1, info: 2 };

export function ComplianceDayList({
  compliance,
  shifts,
  showPlanning,
}: {
  readonly compliance: MonthlyComplianceResult;
  readonly shifts: readonly ShiftEntry[];
  readonly showPlanning: boolean;
}) {
  const p = usePalette();
  const [selectedId, setSelectedId] = useState<string | null>(null);
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
  useEffect(() => {
    if (selectedId && !issues.some((issue) => issue.id === selectedId)) setSelectedId(null);
  }, [issues, selectedId]);
  const days = [...new Set(issues.map((issue) => issue.date))];
  return (
    <View style={{ gap: SPACING.xl, flexGrow: issues.length ? 0 : 1 }}>
      {!showPlanning ? <AnalysisCoverageNote message={PLANNING_HIDDEN_NOTICE} /> : null}
      {!issues.length ? (
        <View
          testID="check-complete"
          style={{
            flexGrow: 1,
            minHeight: 280,
            alignItems: "center",
            justifyContent: "center",
            gap: SPACING.lg,
            paddingVertical: SPACING.xxl,
          }}
        >
          <Ionicons
            name="checkmark-circle-outline"
            size={104}
            color={p.success}
            accessibilityElementsHidden
            importantForAccessibility="no"
          />
          <Text
            accessibilityRole="header"
            style={{ color: p.text, textAlign: "center", ...TYPOGRAPHY.sectionTitle }}
          >
            {showPlanning ? "Prüfung abgeschlossen" : "Gesetzliche Prüfung"}
          </Text>
          <Text style={{ color: p.textSecondary, textAlign: "center", ...TYPOGRAPHY.body }}>
            Keine Auffälligkeiten
          </Text>
        </View>
      ) : null}
      {days.map((date) => (
        <View key={date} style={{ gap: SPACING.xs }}>
          <Text accessibilityRole="header" style={{ color: p.text, ...TYPOGRAPHY.sectionTitle }}>
            {checkDate(date, false)}
          </Text>
          {issues
            .filter((issue) => issue.date === date)
            .map((issue, index) => (
              <Animated.View
                key={issue.id}
                layout={LinearTransition.duration(MOTION.duration.normal).reduceMotion(
                  MOTION.reduceMotion,
                )}
              >
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`${checkDate(date)}, ${issue.title}, ${issueCategory(issue)}, ${issueSeverity(issue)}`}
                  accessibilityState={{ expanded: selectedId === issue.id }}
                  accessibilityHint="Klappt Erklärung und betroffene Dienste auf oder zu"
                  onPress={() => {
                    selectionFeedback();
                    setSelectedId((current) => (current === issue.id ? null : issue.id));
                  }}
                  style={({ pressed }) => ({
                    minHeight: 72,
                    paddingVertical: SPACING.md,
                    gap: SPACING.md,
                    flexDirection: "row",
                    alignItems: "center",
                    borderTopWidth: index ? 1 : 0,
                    borderTopColor: p.separator,
                    opacity: pressed ? 0.6 : 1,
                  })}
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
                        ? p.danger
                        : issue.severity === "warning"
                          ? p.warning
                          : p.info
                    }
                    accessibilityElementsHidden
                    importantForAccessibility="no"
                  />
                  <View style={{ flex: 1, minWidth: 0, gap: SPACING.xs }}>
                    <Text style={{ color: p.text, ...TYPOGRAPHY.bodyStrong }}>{issue.title}</Text>
                    {selectedId !== issue.id ? (
                      <Text
                        style={{ color: p.textSecondary, ...TYPOGRAPHY.caption }}
                        numberOfLines={2}
                      >
                        {issue.description}
                      </Text>
                    ) : null}
                    <Text style={{ color: p.textMuted, ...TYPOGRAPHY.caption }}>
                      {issueCategory(issue)}
                    </Text>
                  </View>
                  <Ionicons
                    name={selectedId === issue.id ? "chevron-up" : "chevron-down"}
                    size={18}
                    color={p.textMuted}
                    accessibilityElementsHidden
                    importantForAccessibility="no"
                  />
                </Pressable>
                {selectedId === issue.id ? (
                  <Animated.View
                    entering={FadeIn.duration(MOTION.duration.fast).reduceMotion(
                      MOTION.reduceMotion,
                    )}
                  >
                    <ComplianceIssueContent issue={issue} shifts={shifts} />
                  </Animated.View>
                ) : null}
              </Animated.View>
            ))}
        </View>
      ))}
    </View>
  );
}
