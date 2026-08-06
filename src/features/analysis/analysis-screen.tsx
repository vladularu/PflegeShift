import Ionicons from "@expo/vector-icons/Ionicons";
import { Temporal } from "@js-temporal/polyfill";
import { useIsFocused } from "@react-navigation/native";
import * as Haptics from "expo-haptics";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { SymbolView, type SymbolViewProps } from "expo-symbols";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentProps,
  type ReactNode,
} from "react";
import { Pressable, Text, View, useWindowDimensions } from "react-native";

import {
  usePflegeShiftEntries,
  usePflegeShiftProfile,
  usePflegeShiftStatus,
  usePflegeShiftTariff,
  usePflegeShiftTestData,
} from "@/application/pflegeshift-provider";
import {
  SHIFT_TYPE_LABELS,
  type AllowanceStatus,
  type MonthlyComplianceResult,
  type ShiftEntry,
  type ShiftType,
} from "@/domain/types";
import { formatDateTitle, formatMonthTitle } from "@/engine/calendar";
import { calculateMonthlyPayEstimate } from "@/engine/pay";
import { calculateMonthlySummary } from "@/engine/monthly-summary";
import { formatMinutes, formatSignedMinutes } from "@/engine/working-time";
import {
  EMPTY_ANALYSIS_ENTRY_WINDOW,
  selectAnalysisEntryWindow,
  type AnalysisEntryWindow,
} from "@/features/analysis/analysis-data";
import {
  AnalysisPeriodPicker,
  AnnualReportScreen,
  type AnalysisPeriod,
} from "@/features/analysis/annual-report-view";
import { useAnnualReportInputs } from "@/features/analysis/use-annual-report-inputs";
import { useDeferredAnnualReport } from "@/features/analysis/use-annual-report";
import { useDeferredMonthlyCompliance } from "@/features/analysis/use-monthly-compliance";
import { buildShiftTypeDistribution } from "@/features/calendar/calendar-metrics";
import { complianceDetailsRoute, tariffAssessmentRoute } from "@/navigation/routes";
import { parseMonthRouteParam, type RouteParam } from "@/navigation/route-params";
import { useActiveMonthCoordinator } from "@/navigation/active-month";
import { SHIFT_TYPE_COLORS, usePalette } from "@/theme/palette";
import { TEXT_MAX_SCALE, TYPOGRAPHY } from "@/theme/typography";
import { RADII, SPACING } from "@/theme/tokens";
import { EmptyState, SectionHeader, SurfaceCard } from "@/ui/design-system";
import { LoadFailureView, LoadingView } from "@/ui/loading-view";
import { MonthNavigator } from "@/ui/month-navigator";
import { ReportPeriodContent, ReportScrollView, ReportTestBadge } from "@/ui/report-layout";

const ALLOWANCE_LABELS: Readonly<Record<AllowanceStatus, string>> = {
  NONE: "Keine Zulage",
  SHIFT_MONTHLY: "Ständige Schichtarbeit",
  SHIFT_HOURLY: "Nichtständige Schichtarbeit",
  ALTERNATING_MONTHLY: "Ständige Wechselschicht",
  ALTERNATING_HOURLY: "Nichtständige Wechselschicht",
};

export function AnalysisScreen() {
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
  const entryWindowCache = useRef<AnalysisEntryWindow | null>(null);
  const parsedMonth = parseMonthRouteParam(params.month);
  const routeMonth = parsedMonth.status === "valid" ? parsedMonth.value : null;

  useEffect(() => {
    if (routeMonth !== null) {
      activeMonthCoordinator.setMonth(routeMonth);
      setMonth(routeMonth);
    }
  }, [activeMonthCoordinator, routeMonth]);

  useFocusEffect(
    useCallback(() => {
      const activeMonth = activeMonthCoordinator.getMonth();
      setMonth((current) => (current === activeMonth ? current : activeMonth));
      setYear((current) =>
        current === Number(activeMonth.slice(0, 4)) ? current : Number(activeMonth.slice(0, 4)),
      );
    }, [activeMonthCoordinator]),
  );

  const entryWindow = useMemo(() => {
    if (!isFocused) return entryWindowCache.current;
    const nextWindow = selectAnalysisEntryWindow(entries, month);
    entryWindowCache.current = nextWindow;
    return nextWindow;
  }, [entries, isFocused, month]);
  const { monthEntries, monthShifts, complianceShifts, allowanceShifts } =
    entryWindow ?? EMPTY_ANALYSIS_ENTRY_WINDOW;
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
  const distribution = useMemo(
    () => buildShiftTypeDistribution(month, monthEntries),
    [month, monthEntries],
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
    entryWindow === null ||
    !ready ||
    profile === null ||
    compliance === null ||
    pay === null ||
    summary === null
  ) {
    return <LoadingView />;
  }

  function changePeriod(nextPeriod: AnalysisPeriod) {
    setPeriod(nextPeriod);
    if (nextPeriod === "YEAR") setYear(Number(month.slice(0, 4)));
    if (process.env.EXPO_OS === "ios") void Haptics.selectionAsync();
  }

  function selectAnnualMonth(nextMonth: string) {
    activeMonthCoordinator.setMonth(nextMonth);
    setMonth(nextMonth);
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
        onChangePeriod={changePeriod}
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
    if (process.env.EXPO_OS === "ios") void Haptics.selectionAsync();
  }

  function moveYear(delta: number) {
    const nextYear = year + delta;
    const nextMonth = `${nextYear}-${month.slice(5, 7)}`;
    activeMonthCoordinator.setMonth(nextMonth);
    setMonth(nextMonth);
    setYear(nextYear);
    if (process.env.EXPO_OS === "ios") void Haptics.selectionAsync();
  }

  const complianceIsClear = compliance.criticalCount === 0 && compliance.warningCount === 0;
  const allowanceTitle = decision
    ? ALLOWANCE_LABELS[decision.allowanceStatus]
    : pay.assessment.suggestedAllowance !== "NONE"
      ? `${ALLOWANCE_LABELS[pay.assessment.suggestedAllowance]} · erkannt`
      : pay.assessment.requiresConfirmation
        ? "Angaben bestätigen"
        : "Noch nicht eindeutig";
  return (
    <ReportScrollView>
      <MonthNavigator
        label={formatMonthTitle(month)}
        onNext={() => moveMonth(1)}
        onPrevious={() => moveMonth(-1)}
      />
      <AnalysisPeriodPicker value={period} onChange={changePeriod} />
      <ReportPeriodContent>
        {testMonths.includes(month) ? <ReportTestBadge /> : null}

        <WorktimeSummary
          actual={formatMinutes(summary.actualMinutes)}
          balance={formatSignedMinutes(summary.balanceMinutes)}
          balanceAccent={summary.balanceMinutes < 0 ? palette.danger : palette.success}
          target={formatMinutes(summary.targetMinutes)}
        />

        <SurfaceCard>
          <StatusCard
            accent={
              complianceIsClear
                ? palette.success
                : compliance.criticalCount > 0
                  ? palette.danger
                  : palette.warning
            }
            icon={complianceIsClear ? "checkmark.shield.fill" : "exclamationmark.shield.fill"}
            fallbackIcon={complianceIsClear ? "checkmark-circle-outline" : "alert-circle-outline"}
            label="Arbeitszeitregeln"
            title={
              complianceIsClear
                ? "Keine Auffälligkeiten"
                : compliance.criticalCount > 0
                  ? `${compliance.criticalCount} kritisch`
                  : `${compliance.warningCount} Hinweise`
            }
            onPress={() => router.push(complianceDetailsRoute(month))}
          />
          <View style={{ height: 1, marginLeft: 60, backgroundColor: palette.separator }} />
          <StatusCard
            accent={decision ? palette.success : palette.warning}
            icon={decision ? "checkmark.seal.fill" : "sparkles"}
            fallbackIcon={decision ? "ribbon-outline" : "sparkles-outline"}
            label="Schichtzulage"
            title={allowanceTitle}
            onPress={() => router.push(tariffAssessmentRoute(month))}
          />
        </SurfaceCard>

        <View style={{ gap: SPACING.sm }}>
          <SectionHeader title="Dienstverteilung" />
          <DistributionChart distribution={distribution} />
        </View>
      </ReportPeriodContent>
    </ReportScrollView>
  );
}

function DistributionChart({
  distribution,
}: {
  readonly distribution: ReadonlyMap<ShiftType, number>;
}) {
  const palette = usePalette();
  const items = [...distribution.entries()].filter(([, count]) => count > 0);
  const total = items.reduce((sum, [, count]) => sum + count, 0);
  if (total === 0) {
    return (
      <SurfaceCard>
        <EmptyState
          message="Trage Dienste ein, um ihre Verteilung zu sehen."
          title="Noch keine Dienste"
        />
      </SurfaceCard>
    );
  }
  return (
    <SurfaceCard
      accessibilityLabel={`${total} Dienste insgesamt`}
      style={{ gap: SPACING.lg, padding: SPACING.lg }}
    >
      <View
        style={{
          flexDirection: "row",
          alignItems: "baseline",
          justifyContent: "space-between",
          gap: SPACING.md,
        }}
      >
        <Text
          maxFontSizeMultiplier={TEXT_MAX_SCALE}
          selectable
          style={{ color: palette.text, ...TYPOGRAPHY.sectionTitle }}
        >
          {total} {total === 1 ? "Dienst" : "Dienste"}
        </Text>
        <Text
          maxFontSizeMultiplier={TEXT_MAX_SCALE}
          selectable
          style={{ color: palette.textMuted, ...TYPOGRAPHY.caption }}
        >
          im Monat
        </Text>
      </View>
      <View style={{ gap: SPACING.md }}>
        {items.map(([type, count]) => (
          <View key={type} style={{ gap: SPACING.xs }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: SPACING.sm }}>
              <View
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: 4,
                  backgroundColor: SHIFT_TYPE_COLORS[type],
                }}
              />
              <Text
                maxFontSizeMultiplier={TEXT_MAX_SCALE}
                selectable
                style={{ flex: 1, color: palette.textSecondary, ...TYPOGRAPHY.label }}
              >
                {SHIFT_TYPE_LABELS[type]}
              </Text>
              <Text
                maxFontSizeMultiplier={TEXT_MAX_SCALE}
                selectable
                style={{
                  color: palette.text,
                  ...TYPOGRAPHY.label,
                  fontWeight: "700",
                  fontVariant: ["tabular-nums"],
                }}
              >
                {count}
              </Text>
            </View>
            <View
              style={{
                height: 5,
                overflow: "hidden",
                borderRadius: 3,
                backgroundColor: palette.surfaceMuted,
              }}
            >
              <View
                style={{
                  width: `${(count / total) * 100}%`,
                  height: "100%",
                  borderRadius: 3,
                  backgroundColor: SHIFT_TYPE_COLORS[type],
                }}
              />
            </View>
          </View>
        ))}
      </View>
    </SurfaceCard>
  );
}

function WorktimeSummary({
  target,
  actual,
  balance,
  balanceAccent,
}: {
  readonly target: string;
  readonly actual: string;
  readonly balance: string;
  readonly balanceAccent: string;
}) {
  const palette = usePalette();
  const { fontScale } = useWindowDimensions();
  const stacked = fontScale >= 1.6;
  const values = [
    { label: "Soll", value: target, accent: palette.text },
    { label: "Ist", value: actual, accent: palette.text },
    { label: "Saldo", value: balance, accent: balanceAccent },
  ];
  return (
    <SurfaceCard style={{ flexDirection: stacked ? "column" : "row", paddingVertical: SPACING.md }}>
      {values.map((item, index) => (
        <View
          key={item.label}
          accessibilityLabel={`${item.label}: ${item.value}`}
          accessible
          style={{
            minWidth: 0,
            flex: 1,
            gap: SPACING.xs,
            borderLeftWidth: !stacked && index > 0 ? 1 : 0,
            borderLeftColor: palette.separator,
            borderTopWidth: stacked && index > 0 ? 1 : 0,
            borderTopColor: palette.separator,
            paddingHorizontal: SPACING.md,
            paddingVertical: stacked ? SPACING.sm : 0,
          }}
        >
          <Text
            maxFontSizeMultiplier={TEXT_MAX_SCALE}
            selectable
            style={{ color: palette.textMuted, ...TYPOGRAPHY.caption }}
          >
            {item.label}
          </Text>
          <Text
            selectable
            style={{
              color: item.accent,
              fontSize: 18,
              fontWeight: "700",
              fontVariant: ["tabular-nums"],
              letterSpacing: -0.3,
            }}
          >
            {item.value}
          </Text>
        </View>
      ))}
    </SurfaceCard>
  );
}

export function ComplianceDetails({
  compliance,
  shifts,
}: {
  readonly compliance: MonthlyComplianceResult;
  readonly shifts: readonly ShiftEntry[];
}) {
  const palette = usePalette();
  const [expandedIssueId, setExpandedIssueId] = useState<string | null>(null);
  if (compliance.issues.length === 0) {
    return (
      <Card>
        <Text
          maxFontSizeMultiplier={TEXT_MAX_SCALE}
          selectable
          style={{ color: palette.primary, ...TYPOGRAPHY.sectionTitle }}
        >
          Keine Auffälligkeiten
        </Text>
      </Card>
    );
  }
  return (
    <Card>
      <Text
        maxFontSizeMultiplier={TEXT_MAX_SCALE}
        selectable
        style={{ color: palette.text, ...TYPOGRAPHY.sectionTitle }}
      >
        Prüfung
      </Text>
      {compliance.issues.map((item) => {
        const expanded = expandedIssueId === item.id;
        const relatedShifts = shifts.filter((shift) => item.relatedShiftIds.includes(shift.id));
        return (
          <View key={item.id} style={{ borderTopWidth: 1, borderTopColor: palette.border }}>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ expanded }}
              onPress={() =>
                setExpandedIssueId((current) => (current === item.id ? null : item.id))
              }
              style={({ pressed }) => ({
                minHeight: 58,
                flexDirection: "row",
                alignItems: "center",
                gap: 11,
                backgroundColor: pressed ? palette.surfaceMuted : "transparent",
                opacity: pressed ? 0.72 : 1,
                paddingVertical: 10,
              })}
            >
              <View
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: 4,
                  backgroundColor: item.severity === "critical" ? palette.danger : palette.warning,
                }}
              />
              <View style={{ flex: 1, gap: 2 }}>
                <Text
                  maxFontSizeMultiplier={TEXT_MAX_SCALE}
                  selectable
                  style={{ color: palette.text, ...TYPOGRAPHY.bodyStrong }}
                >
                  {item.title}
                </Text>
                <Text
                  maxFontSizeMultiplier={TEXT_MAX_SCALE}
                  selectable
                  style={{ color: palette.textMuted, ...TYPOGRAPHY.caption }}
                >
                  {formatDateTitle(item.date)} · {item.kind === "LEGAL" ? "ArbZG" : "Planung"}
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
              <View
                style={{
                  gap: 10,
                  borderRadius: RADII.control,
                  backgroundColor: palette.surfaceMuted,
                  marginBottom: 10,
                  padding: SPACING.md,
                }}
              >
                <Text
                  maxFontSizeMultiplier={TEXT_MAX_SCALE}
                  selectable
                  style={{ color: palette.textSecondary, ...TYPOGRAPHY.caption }}
                >
                  {item.description}
                </Text>
                {relatedShifts.map((shift) => (
                  <View
                    key={shift.id}
                    style={{
                      flexDirection: "row",
                      flexWrap: "wrap",
                      justifyContent: "space-between",
                      gap: 12,
                    }}
                  >
                    <Text
                      maxFontSizeMultiplier={TEXT_MAX_SCALE}
                      selectable
                      style={{
                        minWidth: 0,
                        flexGrow: 1,
                        color: palette.text,
                        ...TYPOGRAPHY.caption,
                        fontWeight: "600",
                      }}
                    >
                      {shift.title}
                    </Text>
                    <Text
                      maxFontSizeMultiplier={TEXT_MAX_SCALE}
                      selectable
                      style={{
                        color: palette.textMuted,
                        ...TYPOGRAPHY.caption,
                        fontVariant: ["tabular-nums"],
                      }}
                    >
                      {formatDateTitle(shift.date)} · {shift.startTime ?? "ganztägig"}
                      {shift.endTime ? `–${shift.endTime}` : ""}
                    </Text>
                  </View>
                ))}
                <Text
                  maxFontSizeMultiplier={TEXT_MAX_SCALE}
                  selectable
                  style={{ color: palette.textMuted, ...TYPOGRAPHY.footnote }}
                >
                  Regel: {item.rule}
                </Text>
              </View>
            ) : null}
          </View>
        );
      })}
    </Card>
  );
}

function StatusCard({
  label,
  title,
  icon,
  fallbackIcon,
  accent,
  onPress,
}: {
  readonly label: string;
  readonly title: string;
  readonly icon: SymbolViewProps["name"];
  readonly fallbackIcon: ComponentProps<typeof Ionicons>["name"];
  readonly accent: string;
  readonly onPress: () => void;
}) {
  const palette = usePalette();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: 72,
        flexDirection: "row",
        alignItems: "center",
        gap: SPACING.md,
        backgroundColor: "transparent",
        opacity: pressed ? 0.72 : 1,
        paddingHorizontal: SPACING.lg,
        paddingVertical: 10,
      })}
    >
      <StatusIcon accent={accent} fallbackIcon={fallbackIcon} icon={icon} />
      <View style={{ flex: 1, gap: SPACING.xxs }}>
        <Text
          maxFontSizeMultiplier={TEXT_MAX_SCALE}
          selectable
          style={{ color: palette.textMuted, ...TYPOGRAPHY.caption }}
        >
          {label}
        </Text>
        <Text
          maxFontSizeMultiplier={TEXT_MAX_SCALE}
          selectable
          numberOfLines={2}
          style={{ color: palette.text, ...TYPOGRAPHY.bodyStrong }}
        >
          {title}
        </Text>
      </View>
      <Ionicons
        accessibilityElementsHidden
        color={palette.textMuted}
        name="chevron-forward"
        size={18}
      />
    </Pressable>
  );
}

function StatusIcon({
  icon,
  fallbackIcon,
  accent,
}: {
  readonly icon: SymbolViewProps["name"];
  readonly fallbackIcon: ComponentProps<typeof Ionicons>["name"];
  readonly accent: string;
}) {
  return (
    <View
      style={{
        width: 36,
        height: 36,
        alignItems: "center",
        justifyContent: "center",
        borderRadius: RADII.control,
        backgroundColor: `${accent}1F`,
      }}
    >
      {process.env.EXPO_OS === "ios" ? (
        <SymbolView name={icon} size={18} tintColor={accent} weight="semibold" />
      ) : (
        <Ionicons accessibilityElementsHidden color={accent} name={fallbackIcon} size={19} />
      )}
    </View>
  );
}

function Card({ children }: { readonly children: ReactNode }) {
  return <SurfaceCard style={{ gap: SPACING.lg, padding: SPACING.lg }}>{children}</SurfaceCard>;
}
