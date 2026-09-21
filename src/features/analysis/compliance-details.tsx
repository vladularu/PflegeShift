import Ionicons from "@expo/vector-icons/Ionicons";
import { Temporal } from "@js-temporal/polyfill";
import { useMemo, useState, type ReactNode } from "react";
import { Pressable, Text, View } from "react-native";
import Animated, { FadeIn, FadeOut, LinearTransition } from "react-native-reanimated";
import type {
  ComplianceIssue,
  ComplianceSeverity,
  MonthlyComplianceResult,
  ShiftEntry,
} from "@/domain/types";
import { AnalysisCoverageNote } from "./analysis-coverage-note";
import { PLANNING_HIDDEN_NOTICE, selectVisibleCompliance } from "./check-visibility";
import { CheckClearStatus } from "./check-summary-card";
import { usePalette } from "@/theme/palette";
import { MOTION } from "@/theme/motion";
import { TEXT_MAX_SCALE, TYPOGRAPHY } from "@/theme/typography";
import { RADII, SPACING } from "@/theme/tokens";
import { CardSeparator } from "@/ui/design-system";
import { selectionFeedback } from "@/ui/haptics";

interface ComplianceIssueGroup {
  readonly rule: string;
  readonly title: string;
  readonly severity: ComplianceSeverity;
  readonly issues: readonly ComplianceIssue[];
}

const COMPLIANCE_SEVERITY_PRIORITY: Readonly<Record<ComplianceSeverity, number>> = {
  critical: 0,
  warning: 1,
  info: 2,
};

const COMPLIANCE_DATE_FORMATTER = new Intl.DateTimeFormat("de-DE", {
  weekday: "short",
  day: "2-digit",
  month: "short",
  timeZone: "UTC",
});

function groupComplianceIssues(
  issues: readonly ComplianceIssue[],
): readonly ComplianceIssueGroup[] {
  const issuesByRule = new Map<string, ComplianceIssue[]>();
  for (const issue of issues) {
    const group = issuesByRule.get(issue.rule) ?? [];
    group.push(issue);
    issuesByRule.set(issue.rule, group);
  }
  return [...issuesByRule.entries()]
    .map(([rule, groupIssues]) => {
      const orderedIssues = [...groupIssues].sort(
        (left, right) => left.date.localeCompare(right.date) || left.id.localeCompare(right.id),
      );
      const representative = orderedIssues[0];
      const severity = orderedIssues.reduce<ComplianceSeverity>(
        (highest, issue) =>
          COMPLIANCE_SEVERITY_PRIORITY[issue.severity] < COMPLIANCE_SEVERITY_PRIORITY[highest]
            ? issue.severity
            : highest,
        representative.severity,
      );
      return {
        rule,
        title: representative.title,
        severity,
        issues: orderedIssues,
      };
    })
    .sort(
      (left, right) =>
        COMPLIANCE_SEVERITY_PRIORITY[left.severity] -
          COMPLIANCE_SEVERITY_PRIORITY[right.severity] ||
        right.issues.length - left.issues.length ||
        left.title.localeCompare(right.title, "de-DE"),
    );
}

function formatComplianceDate(date: string): string {
  const value = Temporal.PlainDate.from(date);
  return COMPLIANCE_DATE_FORMATTER.format(
    new Date(Date.UTC(value.year, value.month - 1, value.day)),
  );
}

function formatComplianceGroupTitle(group: ComplianceIssueGroup): string {
  return group.rule === "ARBZG_5_REST_10H" ? "Ruhezeitverletzung" : group.title;
}

export function ComplianceDetails({
  compliance,
  shifts,
  embedded = false,
  showPlanning = true,
  hideEmptyLegal = false,
}: {
  readonly compliance: MonthlyComplianceResult;
  readonly heading?: string;
  readonly shifts: readonly ShiftEntry[];
  readonly embedded?: boolean;
  readonly showPlanning?: boolean;
  readonly hideEmptyLegal?: boolean;
}) {
  const legal = selectVisibleCompliance(compliance, false);
  const planning = selectVisibleCompliance(
    { ...compliance, issues: compliance.issues.filter((issue) => issue.kind === "PLANNING") },
    true,
  );
  if (hideEmptyLegal && legal.issues.length === 0 && showPlanning && planning.issues.length === 0)
    return null;
  return (
    <View style={{ gap: SPACING.xl }}>
      {!showPlanning && !embedded ? (
        <AnalysisCoverageNote message={PLANNING_HIDDEN_NOTICE} />
      ) : null}
      {legal.issues.length > 0 || !hideEmptyLegal ? (
        <ComplianceIssueList
          compliance={legal}
          heading="Gesetzliche Prüfung"
          shifts={shifts}
          embedded={embedded}
        />
      ) : null}
      {showPlanning && planning.issues.length > 0 ? (
        <ComplianceIssueList
          compliance={planning}
          heading="Freiwillige Planung"
          shifts={shifts}
          embedded={embedded}
        />
      ) : null}
    </View>
  );
}

function ComplianceIssueList({
  compliance,
  heading,
  shifts,
  embedded = false,
}: {
  readonly compliance: MonthlyComplianceResult;
  readonly heading?: string;
  readonly shifts: readonly ShiftEntry[];
  readonly embedded?: boolean;
}) {
  const palette = usePalette();
  const [expandedRule, setExpandedRule] = useState<string | null>(null);
  const groups = useMemo(() => groupComplianceIssues(compliance.issues), [compliance.issues]);
  const shiftsById = useMemo(() => new Map(shifts.map((shift) => [shift.id, shift])), [shifts]);
  if (compliance.issues.length === 0) {
    return (
      <DetailContainer embedded={embedded}>
        <CheckClearStatus title={heading ?? "Arbeitszeitregeln"} />
      </DetailContainer>
    );
  }
  return (
    <DetailContainer embedded={embedded}>
      <Text
        accessibilityRole="header"
        maxFontSizeMultiplier={TEXT_MAX_SCALE}
        selectable
        style={{ color: palette.text, ...TYPOGRAPHY.sectionTitle }}
      >
        {heading ?? (embedded ? "Arbeitszeitregeln" : "Prüfung")}
      </Text>
      <View style={{ gap: SPACING.sm }}>
        {groups.map((group) => {
          const expanded = expandedRule === group.rule;
          const accent =
            group.severity === "critical"
              ? palette.danger
              : group.severity === "warning"
                ? palette.warning
                : palette.primary;
          const displayTitle = formatComplianceGroupTitle(group);
          const accessibleCountLabel = `${group.issues.length} ${
            group.issues.length === 1 ? "Meldung" : "Meldungen"
          }`;
          return (
            <Animated.View
              key={group.rule}
              layout={LinearTransition.duration(MOTION.duration.normal).reduceMotion(
                MOTION.reduceMotion,
              )}
              style={{
                overflow: "hidden",
                borderWidth: embedded ? 0 : 1,
                borderColor: palette.separator,
                borderRadius: embedded ? 0 : RADII.card,
                borderCurve: "continuous",
                backgroundColor: embedded ? "transparent" : palette.surface,
              }}
            >
              <Pressable
                accessibilityLabel={`${displayTitle}, ${accessibleCountLabel}`}
                accessibilityRole="button"
                accessibilityState={{ expanded }}
                accessibilityHint={
                  group.severity === "critical"
                    ? "Kritische Meldung. Öffnet die betroffenen Dienste."
                    : group.severity === "warning"
                      ? "Warnung. Öffnet die betroffenen Dienste."
                      : "Hinweis. Öffnet die betroffenen Dienste."
                }
                onPress={() => {
                  setExpandedRule((current) => (current === group.rule ? null : group.rule));
                  selectionFeedback();
                }}
                style={({ pressed }) => ({
                  minHeight: 64,
                  flexDirection: "row",
                  alignItems: "center",
                  gap: SPACING.sm,
                  backgroundColor: pressed ? palette.surfaceMuted : "transparent",
                  opacity: pressed ? 0.78 : 1,
                  paddingHorizontal: SPACING.lg,
                  paddingVertical: SPACING.lg,
                })}
              >
                <Ionicons
                  accessibilityElementsHidden
                  importantForAccessibility="no"
                  color={accent}
                  name={
                    group.severity === "critical"
                      ? "alert-circle-outline"
                      : group.severity === "warning"
                        ? "warning-outline"
                        : "information-circle-outline"
                  }
                  size={20}
                />
                <View style={{ minWidth: 0, flex: 1 }}>
                  <Text
                    maxFontSizeMultiplier={TEXT_MAX_SCALE}
                    selectable
                    style={{ color: palette.text, ...TYPOGRAPHY.bodyStrong }}
                  >
                    {displayTitle}
                  </Text>
                </View>
                {group.issues.length > 1 ? (
                  <Text
                    accessibilityElementsHidden
                    importantForAccessibility="no"
                    maxFontSizeMultiplier={TEXT_MAX_SCALE}
                    style={{
                      color: palette.textMuted,
                      ...TYPOGRAPHY.label,
                      fontVariant: ["tabular-nums"],
                    }}
                  >
                    {group.issues.length}
                  </Text>
                ) : null}
                <Ionicons
                  accessibilityElementsHidden
                  color={palette.textMuted}
                  name={expanded ? "chevron-up" : "chevron-down"}
                  size={18}
                />
              </Pressable>
              {expanded ? (
                <Animated.View
                  entering={FadeIn.duration(MOTION.duration.fast).reduceMotion(MOTION.reduceMotion)}
                  exiting={FadeOut.duration(MOTION.duration.instant).reduceMotion(
                    MOTION.reduceMotion,
                  )}
                >
                  <CardSeparator inset={SPACING.lg} />
                  <View style={{ paddingHorizontal: SPACING.lg }}>
                    {group.issues.map((item, index) => {
                      const relatedShifts = item.relatedShiftIds
                        .map((id) => shiftsById.get(id))
                        .filter((shift): shift is ShiftEntry => shift !== undefined);
                      return (
                        <View
                          key={item.id}
                          style={{
                            gap: SPACING.sm,
                            borderTopWidth: index > 0 ? 1 : 0,
                            borderTopColor: palette.separator,
                            paddingVertical: SPACING.md,
                          }}
                        >
                          <Text
                            maxFontSizeMultiplier={TEXT_MAX_SCALE}
                            selectable
                            style={{ color: palette.text, ...TYPOGRAPHY.bodyStrong }}
                          >
                            {formatComplianceDate(item.date)}
                          </Text>
                          <Text
                            maxFontSizeMultiplier={TEXT_MAX_SCALE}
                            selectable
                            style={{ color: palette.textSecondary, ...TYPOGRAPHY.caption }}
                          >
                            {item.description}
                          </Text>
                          {relatedShifts.length > 0 ? (
                            <View
                              style={{
                                marginTop: SPACING.sm,
                              }}
                            >
                              <Text
                                maxFontSizeMultiplier={TEXT_MAX_SCALE}
                                style={{ color: palette.textMuted, ...TYPOGRAPHY.caption }}
                              >
                                Betroffene Dienste
                              </Text>
                              {relatedShifts.map((shift, shiftIndex) => (
                                <View
                                  key={shift.id}
                                  style={{
                                    flexDirection: "row",
                                    flexWrap: "wrap",
                                    justifyContent: "space-between",
                                    alignItems: "center",
                                    gap: SPACING.sm,
                                    minHeight: 56,
                                    paddingVertical: SPACING.md,
                                    borderTopWidth: shiftIndex > 0 ? 1 : 0,
                                    borderTopColor: palette.separator,
                                  }}
                                >
                                  <View style={{ gap: SPACING.xxs, flexShrink: 1 }}>
                                    <Text
                                      maxFontSizeMultiplier={TEXT_MAX_SCALE}
                                      selectable
                                      style={{ color: palette.text, ...TYPOGRAPHY.label }}
                                    >
                                      {shift.title}
                                    </Text>
                                    <Text
                                      maxFontSizeMultiplier={TEXT_MAX_SCALE}
                                      style={{ color: palette.textMuted, ...TYPOGRAPHY.caption }}
                                    >
                                      {formatComplianceDate(shift.date)}
                                    </Text>
                                  </View>
                                  <Text
                                    maxFontSizeMultiplier={TEXT_MAX_SCALE}
                                    selectable
                                    style={{
                                      color: palette.textMuted,
                                      ...TYPOGRAPHY.label,
                                      fontVariant: ["tabular-nums"],
                                    }}
                                  >
                                    {shift.startTime ?? "ganztägig"}
                                    {shift.endTime ? `–${shift.endTime}` : ""}
                                  </Text>
                                </View>
                              ))}
                            </View>
                          ) : null}
                        </View>
                      );
                    })}
                  </View>
                </Animated.View>
              ) : null}
            </Animated.View>
          );
        })}
      </View>
    </DetailContainer>
  );
}

function DetailContainer({
  embedded,
  children,
}: {
  readonly embedded: boolean;
  readonly children: ReactNode;
}) {
  return (
    <View style={{ gap: SPACING.md, ...(embedded ? { padding: SPACING.lg } : {}) }}>
      {children}
    </View>
  );
}
