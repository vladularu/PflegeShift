import Ionicons from "@expo/vector-icons/Ionicons";
import { Temporal } from "@js-temporal/polyfill";
import { router, useFocusEffect, useIsFocused, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { Pressable, Text, View } from "react-native";
import Animated, { FadeIn, FadeInDown, FadeOut, LinearTransition } from "react-native-reanimated";

import {
  usePflegeShiftEntries,
  usePflegeShiftProfile,
  usePflegeShiftStatus,
  usePflegeShiftTariff,
  usePflegeShiftTestData,
} from "@/application/pflegeshift-provider";
import type {
  ComplianceIssue,
  ComplianceSeverity,
  MonthlyComplianceResult,
  ShiftEntry,
} from "@/domain/types";
import { calculateMonthlyPayEstimate } from "@/engine/pay";
import { calculateMonthlySummary } from "@/engine/monthly-summary";
import { formatMinutes, formatSignedMinutes } from "@/engine/working-time";
import { selectAnalysisEntryWindow } from "@/features/analysis/analysis-data";
import { buildMonthlyShiftTypeAnalysis } from "@/features/analysis/analysis-metrics";
import {
  AnalysisMonthHeader,
  ExpandableHighlightCard,
  formatMonthRangeLabel,
  ReportCardTitle,
  SalarySummaryCard,
  ShiftTypeCountCard,
  ShiftTypeHoursCard,
  WorktimeCard,
} from "@/features/analysis/analysis-overview-cards";
import { AnnualReportScreen, type AnalysisPeriod } from "@/features/analysis/annual-report-view";
import { useAnnualReportInputs } from "@/features/analysis/use-annual-report-inputs";
import { useDeferredAnnualReport } from "@/features/analysis/use-annual-report";
import { useDeferredMonthlyCompliance } from "@/features/analysis/use-monthly-compliance";
import { tariffAssessmentRoute } from "@/navigation/routes";
import { parseMonthRouteParam, type RouteParam } from "@/navigation/route-params";
import { useActiveMonthCoordinator } from "@/navigation/active-month";
import { usePalette } from "@/theme/palette";
import { MOTION } from "@/theme/motion";
import { TEXT_MAX_SCALE, TYPOGRAPHY } from "@/theme/typography";
import { RADII, SPACING } from "@/theme/tokens";
import { CardSeparator, EmptyState, SurfaceCard } from "@/ui/design-system";
import { LoadFailureView, LoadingView } from "@/ui/loading-view";
import { selectionFeedback } from "@/ui/haptics";
import {
  ReportFootnote,
  ReportPeriodContent,
  ReportScrollView,
  ReportTestBadge,
} from "@/ui/report-layout";

export type AnalysisExpandedCard = "CHECK" | "PAY";

export function AnalysisScreen({
  initialExpandedCard = null,
}: {
  readonly initialExpandedCard?: AnalysisExpandedCard | null;
}) {
  const palette = usePalette();
  const isFocused = useIsFocused();
  const activeMonthCoordinator = useActiveMonthCoordinator();
  const params = useLocalSearchParams<{ month?: RouteParam }>();
  const { error, ready, reload } = usePflegeShiftStatus();
  const { profile } = usePflegeShiftProfile();
  const { entries } = usePflegeShiftEntries();
  const { tariffDecisions, workPatternSettings } = usePflegeShiftTariff();
  const { testMonths } = usePflegeShiftTestData();
  const [month, setMonth] = useState(() => activeMonthCoordinator.getMonth());
  const [period, setPeriod] = useState<AnalysisPeriod>("MONTH");
  const [year, setYear] = useState(() => Number(activeMonthCoordinator.getMonth().slice(0, 4)));
  const [expandedCard, setExpandedCard] = useState<AnalysisExpandedCard | null>(
    initialExpandedCard,
  );
  const parsedMonth = parseMonthRouteParam(params.month);
  const routeMonth = parsedMonth.status === "valid" ? parsedMonth.value : null;

  useEffect(() => {
    if (routeMonth !== null) {
      activeMonthCoordinator.setMonth(routeMonth);
      setMonth(routeMonth);
    }
  }, [activeMonthCoordinator, routeMonth]);

  useEffect(() => {
    setExpandedCard(initialExpandedCard);
  }, [initialExpandedCard]);

  useFocusEffect(
    useCallback(() => {
      const activeMonth = activeMonthCoordinator.getMonth();
      setMonth((current) => (current === activeMonth ? current : activeMonth));
      setYear((current) =>
        current === Number(activeMonth.slice(0, 4)) ? current : Number(activeMonth.slice(0, 4)),
      );
    }, [activeMonthCoordinator]),
  );

  const entryWindow = useMemo(() => selectAnalysisEntryWindow(entries, month), [entries, month]);
  const { monthEntries, monthShifts, complianceShifts, allowanceShifts } = entryWindow;
  const decision = tariffDecisions.find((item) => item.month === month) ?? null;
  const monthlyCompliance = useDeferredMonthlyCompliance({
    enabled: isFocused,
    month,
    profile,
    shifts: complianceShifts,
  });
  const compliance = monthlyCompliance.result;
  const pay = useMemo(
    () =>
      profile
        ? calculateMonthlyPayEstimate(
            month,
            monthShifts,
            profile,
            decision,
            allowanceShifts,
            workPatternSettings,
          )
        : null,
    [allowanceShifts, decision, month, monthShifts, profile, workPatternSettings],
  );
  const summary = useMemo(
    () => (profile ? calculateMonthlySummary(month, monthShifts, profile) : null),
    [month, monthShifts, profile],
  );
  const shiftTypeAnalysis = useMemo(
    () => (profile === null ? null : buildMonthlyShiftTypeAnalysis(month, monthEntries, profile)),
    [month, monthEntries, profile],
  );
  const annualInputs = useAnnualReportInputs(year, entries, tariffDecisions);
  const annualReport = useDeferredAnnualReport({
    enabled: isFocused && period === "YEAR",
    entries: annualInputs.entries,
    profile,
    tariffDecisions: annualInputs.tariffDecisions,
    workPatternSettings,
    year,
  });

  if (ready && error) {
    return <LoadFailureView message={error} onRetry={() => void reload()} />;
  }
  if (monthlyCompliance.error) {
    return (
      <LoadFailureView
        message={monthlyCompliance.error}
        onRetry={monthlyCompliance.retry}
        title="Arbeitszeitprüfung fehlgeschlagen"
      />
    );
  }

  if (
    !ready ||
    profile === null ||
    compliance === null ||
    pay === null ||
    summary === null ||
    shiftTypeAnalysis === null
  ) {
    return <LoadingView />;
  }

  function changePeriod(nextPeriod: AnalysisPeriod) {
    setPeriod(nextPeriod);
    if (nextPeriod === "YEAR") setYear(Number(month.slice(0, 4)));
    selectionFeedback();
  }

  function selectAnnualMonth(nextMonth: string, nextExpandedCard?: "CHECK") {
    activeMonthCoordinator.setMonth(nextMonth);
    setMonth(nextMonth);
    if (nextExpandedCard) setExpandedCard(nextExpandedCard);
    setPeriod("MONTH");
  }

  if (period === "YEAR") {
    if (annualReport.error) {
      return (
        <LoadFailureView
          message={annualReport.error}
          onRetry={annualReport.retry}
          title="Jahresauswertung nicht verfügbar"
        />
      );
    }
    if (annualReport.report === null)
      return <LoadingView label="Jahresauswertung wird berechnet …" />;
    return (
      <AnnualReportScreen
        report={annualReport.report}
        testMonths={testMonths}
        onBackToMonth={() => changePeriod("MONTH")}
        onMoveYear={moveYear}
        onSelectMonth={selectAnnualMonth}
      />
    );
  }

  function moveMonth(delta: number) {
    const nextMonth = Temporal.PlainDate.from(`${month}-01`)
      .add({ months: delta })
      .toString()
      .slice(0, 7);
    activeMonthCoordinator.setMonth(nextMonth);
    setMonth(nextMonth);
    selectionFeedback();
  }

  function moveYear(delta: number) {
    const nextYear = year + delta;
    const nextMonth = `${nextYear}-${month.slice(5, 7)}`;
    activeMonthCoordinator.setMonth(nextMonth);
    setMonth(nextMonth);
    setYear(nextYear);
    selectionFeedback();
  }

  function toggleExpandedCard(nextCard: AnalysisExpandedCard) {
    setExpandedCard((current) => (current === nextCard ? null : nextCard));
    selectionFeedback();
  }

  return (
    <View style={{ flex: 1, backgroundColor: palette.groupedBackground }}>
      <AnalysisMonthHeader
        label={formatMonthRangeLabel(month)}
        onOpenYear={() => changePeriod("YEAR")}
        onNext={() => moveMonth(1)}
        onPrevious={() => moveMonth(-1)}
      />
      <ReportScrollView>
        <Animated.View
          key={`month-analysis-${month}`}
          entering={FadeIn.duration(MOTION.duration.normal).reduceMotion(MOTION.reduceMotion)}
        >
          <ReportPeriodContent>
            {testMonths.includes(month) ? <ReportTestBadge /> : null}

            <AssessmentSummaryCard
              compliance={compliance}
              expanded={expandedCard === "CHECK"}
              onToggle={() => toggleExpandedCard("CHECK")}
              shifts={complianceShifts}
            />

            <SalarySummaryCard
              expanded={expandedCard === "PAY"}
              onOpenAllowance={() => router.push(tariffAssessmentRoute(month))}
              onSetup={() => router.push("/more")}
              onToggle={() => toggleExpandedCard("PAY")}
              pay={pay}
              tariffReady={profile.tariff !== null}
            />

            <WorktimeCard
              actual={formatMinutes(summary.actualMinutes)}
              balance={formatSignedMinutes(summary.balanceMinutes)}
              balanceAccent={summary.balanceMinutes < 0 ? palette.danger : palette.success}
              target={formatMinutes(summary.targetMinutes)}
            />

            {shiftTypeAnalysis.totalCount === 0 ? (
              <SurfaceCard>
                <ReportCardTitle title="Schichten zählen" />
                <CardSeparator inset={0} />
                <EmptyState
                  message="Trage Dienste ein, um den Monat auszuwerten."
                  title="Noch keine Dienste"
                />
              </SurfaceCard>
            ) : (
              <>
                <ShiftTypeCountCard analysis={shiftTypeAnalysis} />
                <ShiftTypeHoursCard analysis={shiftTypeAnalysis} />
              </>
            )}

            <ReportFootnote>Unverbindliche Schätzung · keine Lohnabrechnung</ReportFootnote>
          </ReportPeriodContent>
        </Animated.View>
      </ReportScrollView>
    </View>
  );
}

export function AssessmentSummaryCard({
  compliance,
  shifts,
  expanded,
  onToggle,
}: {
  readonly compliance: MonthlyComplianceResult;
  readonly shifts: readonly ShiftEntry[];
  readonly expanded: boolean;
  readonly onToggle: () => void;
}) {
  const palette = usePalette();
  const messageCount = compliance.criticalCount + compliance.warningCount + compliance.infoCount;
  const clear = messageCount === 0;
  const accent = clear
    ? palette.success
    : compliance.criticalCount > 0
      ? palette.danger
      : compliance.warningCount > 0
        ? palette.warning
        : palette.primary;

  return (
    <ExpandableHighlightCard
      accent={accent}
      countBadge={messageCount}
      expanded={expanded}
      icon={clear ? "shield-checkmark-outline" : "warning-outline"}
      onToggle={onToggle}
      title="Prüfung"
      value={messageCount === 1 ? "Meldung" : "Meldungen"}
    >
      <ComplianceDetails compliance={compliance} embedded shifts={shifts} />
    </ExpandableHighlightCard>
  );
}

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
}: {
  readonly compliance: MonthlyComplianceResult;
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
        <Text
          maxFontSizeMultiplier={TEXT_MAX_SCALE}
          selectable
          style={{ color: palette.success, ...TYPOGRAPHY.sectionTitle }}
        >
          Arbeitszeitregeln · keine Auffälligkeiten
        </Text>
      </DetailContainer>
    );
  }
  return (
    <DetailContainer embedded={embedded}>
      <Text
        maxFontSizeMultiplier={TEXT_MAX_SCALE}
        selectable
        style={{ color: palette.text, ...TYPOGRAPHY.sectionTitle }}
      >
        {embedded ? "Arbeitszeitregeln" : "Prüfung"}
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
                borderWidth: 1,
                borderColor: palette.separator,
                borderRadius: RADII.control,
                backgroundColor: palette.surface,
              }}
            >
              <Pressable
                accessibilityLabel={`${displayTitle}, ${accessibleCountLabel}`}
                accessibilityRole="button"
                accessibilityState={{ expanded }}
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
                  paddingHorizontal: SPACING.md,
                  paddingVertical: 10,
                })}
              >
                <View
                  accessibilityElementsHidden
                  style={{
                    width: 28,
                    height: 28,
                    alignItems: "center",
                    justifyContent: "center",
                    borderRadius: RADII.small,
                    backgroundColor: `${accent}1F`,
                  }}
                >
                  <Ionicons
                    color={accent}
                    name={
                      group.severity === "critical" ? "alert-circle-outline" : "warning-outline"
                    }
                    size={16}
                  />
                </View>
                <View style={{ minWidth: 0, flex: 1 }}>
                  <Text
                    maxFontSizeMultiplier={TEXT_MAX_SCALE}
                    selectable
                    style={{ color: palette.text, ...TYPOGRAPHY.bodyStrong }}
                  >
                    {displayTitle}
                  </Text>
                </View>
                <View
                  accessibilityElementsHidden
                  style={{
                    minWidth: 28,
                    height: 24,
                    alignItems: "center",
                    justifyContent: "center",
                    borderRadius: RADII.pill,
                    backgroundColor: `${accent}1F`,
                    paddingHorizontal: SPACING.xs,
                  }}
                >
                  <Text
                    style={{
                      color: accent,
                      ...TYPOGRAPHY.label,
                      fontVariant: ["tabular-nums"],
                    }}
                  >
                    {group.issues.length}
                  </Text>
                </View>
                <Ionicons
                  accessibilityElementsHidden
                  color={palette.textMuted}
                  name={expanded ? "chevron-up" : "chevron-down"}
                  size={18}
                />
              </Pressable>
              {expanded ? (
                <Animated.View
                  entering={FadeInDown.duration(MOTION.duration.fast).reduceMotion(
                    MOTION.reduceMotion,
                  )}
                  exiting={FadeOut.duration(MOTION.duration.instant).reduceMotion(
                    MOTION.reduceMotion,
                  )}
                >
                  <CardSeparator inset={0} />
                  <View style={{ paddingHorizontal: SPACING.md }}>
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
                                gap: SPACING.xs,
                                borderRadius: RADII.small,
                                backgroundColor: palette.surfaceMuted,
                                padding: 10,
                              }}
                            >
                              {relatedShifts.map((shift) => (
                                <View
                                  key={shift.id}
                                  style={{
                                    flexDirection: "row",
                                    flexWrap: "wrap",
                                    justifyContent: "space-between",
                                    gap: SPACING.sm,
                                  }}
                                >
                                  <Text
                                    maxFontSizeMultiplier={TEXT_MAX_SCALE}
                                    selectable
                                    style={{ color: palette.text, ...TYPOGRAPHY.caption }}
                                  >
                                    {shift.title}
                                  </Text>
                                  <Text
                                    maxFontSizeMultiplier={TEXT_MAX_SCALE}
                                    selectable
                                    style={{
                                      color: palette.textMuted,
                                      ...TYPOGRAPHY.footnote,
                                      fontVariant: ["tabular-nums"],
                                    }}
                                  >
                                    {formatComplianceDate(shift.date)} ·{" "}
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
  if (!embedded) return <Card>{children}</Card>;
  return <View style={{ gap: SPACING.md, padding: SPACING.lg }}>{children}</View>;
}

function Card({ children }: { readonly children: ReactNode }) {
  return <SurfaceCard style={{ gap: SPACING.lg, padding: SPACING.lg }}>{children}</SurfaceCard>;
}
