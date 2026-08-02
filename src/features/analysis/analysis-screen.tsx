import { Temporal } from "@js-temporal/polyfill";
import { useIsFocused } from "@react-navigation/native";
import * as Haptics from "expo-haptics";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { SymbolView, type SymbolViewProps } from "expo-symbols";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  Pressable,
  Text,
  View,
} from "react-native";

import {
  useMediShiftEntries,
  useMediShiftProfile,
  useMediShiftStatus,
  useMediShiftTariff,
  useMediShiftTestData,
} from "@/application/medishift-provider";
import {
  SHIFT_TYPE_LABELS,
  type AllowanceStatus,
  type ShiftEntry,
  type ShiftType,
} from "@/domain/types";
import { formatDateTitle, formatMonthTitle } from "@/engine/calendar";
import { calculateMonthlyCompliance } from "@/engine/compliance";
import { calculateMonthlyPayEstimate } from "@/engine/pay";
import { calculateMonthlySummary } from "@/engine/monthly-summary";
import { formatMinutes, formatSignedMinutes } from "@/engine/working-time";
import {
  EMPTY_ANALYSIS_ENTRY_WINDOW,
  selectAnalysisEntryWindow,
  type AnalysisEntryWindow,
} from "@/features/analysis/analysis-data";
import { buildAnnualReport } from "@/features/analysis/annual-report";
import {
  AnalysisPeriodPicker,
  AnnualReportScreen,
  type AnalysisPeriod,
} from "@/features/analysis/annual-report-view";
import { buildShiftTypeDistribution } from "@/features/calendar/calendar-metrics";
import { complianceDetailsRoute, tariffAssessmentRoute } from "@/navigation/routes";
import { useActiveMonthCoordinator } from "@/navigation/active-month";
import { SHIFT_TYPE_COLORS, usePalette } from "@/theme/palette";
import { EmptyState, SectionHeader, SurfaceCard } from "@/ui/design-system";
import { LoadFailureView, LoadingView } from "@/ui/loading-view";
import { MonthNavigator } from "@/ui/month-navigator";
import {
  ReportFootnote,
  ReportPeriodContent,
  ReportScrollView,
  ReportTestBadge,
} from "@/ui/report-layout";

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
  const params = useLocalSearchParams<{ month?: string }>();
  const { error, ready, reload } = useMediShiftStatus();
  const { profile } = useMediShiftProfile();
  const { entries } = useMediShiftEntries();
  const { tariffDecisions, workPatternSettings } = useMediShiftTariff();
  const { testMonths } = useMediShiftTestData();
  const [month, setMonth] = useState(() => activeMonthCoordinator.getMonth());
  const [period, setPeriod] = useState<AnalysisPeriod>("MONTH");
  const [year, setYear] = useState(() => Number(activeMonthCoordinator.getMonth().slice(0, 4)));
  const entryWindowCache = useRef<AnalysisEntryWindow | null>(null);

  useEffect(() => {
    if (typeof params.month === "string" && /^\d{4}-\d{2}$/.test(params.month)) {
      activeMonthCoordinator.setMonth(params.month);
      setMonth(params.month);
    }
  }, [activeMonthCoordinator, params.month]);

  useFocusEffect(useCallback(() => {
    const activeMonth = activeMonthCoordinator.getMonth();
    setMonth((current) => current === activeMonth ? current : activeMonth);
    setYear((current) => current === Number(activeMonth.slice(0, 4))
      ? current
      : Number(activeMonth.slice(0, 4)));
  }, [activeMonthCoordinator]));

  const entryWindow = useMemo(() => {
    if (!isFocused) return entryWindowCache.current;
    const nextWindow = selectAnalysisEntryWindow(entries, month);
    entryWindowCache.current = nextWindow;
    return nextWindow;
  }, [entries, isFocused, month]);
  const {
    monthEntries,
    monthShifts,
    complianceShifts,
    allowanceShifts,
  } = entryWindow ?? EMPTY_ANALYSIS_ENTRY_WINDOW;
  const decision = tariffDecisions.find((item) => item.month === month) ?? null;
  const compliance = useMemo(
    () => profile
      ? calculateMonthlyCompliance(month, complianceShifts, profile.timeZone, {
        federalState: profile.federalState,
        weeklyMinutes: profile.weeklyMinutes,
      })
      : null,
    [complianceShifts, month, profile],
  );
  const pay = useMemo(
    () => profile
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
    () => profile ? calculateMonthlySummary(month, monthShifts, profile) : null,
    [month, monthShifts, profile],
  );
  const distribution = useMemo(
    () => buildShiftTypeDistribution(month, monthEntries),
    [month, monthEntries],
  );
  const annualReport = useMemo(
    () => isFocused && period === "YEAR" && profile
      ? buildAnnualReport(year, entries, profile, tariffDecisions, workPatternSettings)
      : null,
    [entries, isFocused, period, profile, tariffDecisions, workPatternSettings, year],
  );

  if (ready && error) {
    return <LoadFailureView message={error} onRetry={() => void reload()} />;
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
    if (annualReport === null) return <LoadingView />;
    return (
      <AnnualReportScreen
        report={annualReport}
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
      {testMonths.includes(month) ? (
        <ReportTestBadge />
      ) : null}

      <WorktimeSummary
        actual={formatMinutes(summary.actualMinutes)}
        balance={formatSignedMinutes(summary.balanceMinutes)}
        balanceAccent={summary.balanceMinutes < 0 ? palette.danger : palette.success}
        target={formatMinutes(summary.targetMinutes)}
      />

      <View
        style={{
          overflow: "hidden",
          borderRadius: 20,
          borderCurve: "continuous",
          backgroundColor: palette.surface,
          boxShadow: palette.dark ? undefined : "0 4px 16px rgba(28, 48, 42, 0.05)",
        }}
      >
            <StatusCard
              accent={complianceIsClear ? palette.primary : compliance.criticalCount > 0 ? palette.danger : "#D48A18"}
              icon={complianceIsClear ? "checkmark.shield.fill" : "exclamationmark.shield.fill"}
              fallback={complianceIsClear ? "✓" : "!"}
              label="Arbeitszeit"
              title={complianceIsClear
                ? "Alles im grünen Bereich"
                : compliance.criticalCount > 0
                  ? `${compliance.criticalCount} kritisch`
                  : `${compliance.warningCount} Hinweise`}
              onPress={() => router.push(complianceDetailsRoute(month))}
            />
            <View style={{ height: 1, marginLeft: 60, backgroundColor: palette.separator }} />
            <StatusCard
              accent={decision ? palette.primary : "#D48A18"}
              icon={decision ? "checkmark.seal.fill" : "sparkles"}
              fallback={decision ? "✓" : "·"}
              label="Schichtzulage"
              title={allowanceTitle}
              onPress={() => router.push(tariffAssessmentRoute(month))}
            />
      </View>

      <ReportFootnote>
        Automatische Prüfung · keine Rechtsberatung
      </ReportFootnote>

      <View style={{ gap: 10 }}>
        <SectionHeader title="Dienstverteilung" caption="Termine werden nicht als Arbeitszeit gezählt." />
        <DistributionChart distribution={distribution} />
      </View>
      </ReportPeriodContent>
    </ReportScrollView>
  );
}

function DistributionChart({ distribution }: { readonly distribution: ReadonlyMap<ShiftType, number> }) {
  const palette = usePalette();
  const items = [...distribution.entries()].filter(([, count]) => count > 0);
  const total = items.reduce((sum, [, count]) => sum + count, 0);
  if (total === 0) {
    return (
      <SurfaceCard>
        <EmptyState
          message="Sobald du Dienste einträgst, erscheint hier ihre Verteilung. Termine zählen nicht als Arbeitszeit."
          title="Noch keine Dienste"
        />
      </SurfaceCard>
    );
  }
  return (
    <SurfaceCard
      accessibilityLabel={`${total} Dienste insgesamt`}
      style={{ gap: 14, padding: 18 }}
    >
      <View style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
        <Text selectable style={{ color: palette.text, fontSize: 16, fontWeight: "900" }}>
          {total} {total === 1 ? "Dienst" : "Dienste"}
        </Text>
        <Text selectable style={{ color: palette.textMuted, fontSize: 12 }}>
          im Monat
        </Text>
      </View>
      <View style={{ gap: 12 }}>
        {items.map(([type, count]) => (
          <View key={type} style={{ gap: 6 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: SHIFT_TYPE_COLORS[type] }} />
              <Text selectable style={{ flex: 1, color: palette.textSecondary, fontSize: 13, fontWeight: "600" }}>
                {SHIFT_TYPE_LABELS[type]}
              </Text>
              <Text selectable style={{ color: palette.text, fontSize: 13, fontWeight: "900", fontVariant: ["tabular-nums"] }}>
                {count}
              </Text>
            </View>
            <View style={{ height: 5, overflow: "hidden", borderRadius: 3, backgroundColor: palette.surfaceMuted }}>
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
  const values = [
    { label: "Soll", value: target, accent: palette.text },
    { label: "Ist", value: actual, accent: palette.text },
    { label: "Saldo", value: balance, accent: balanceAccent },
  ];
  return (
    <SurfaceCard style={{ flexDirection: "row", paddingVertical: 14 }}>
      {values.map((item, index) => (
        <View
          key={item.label}
          accessibilityLabel={`${item.label}: ${item.value}`}
          accessible
          style={{
            minWidth: 0,
            flex: 1,
            gap: 6,
            borderLeftWidth: index === 0 ? 0 : 1,
            borderLeftColor: palette.separator,
            paddingHorizontal: 12,
          }}
        >
          <Text selectable style={{ color: palette.textMuted, fontSize: 12, fontWeight: "700" }}>
            {item.label}
          </Text>
          <Text
            selectable
            adjustsFontSizeToFit
            numberOfLines={1}
            style={{
              color: item.accent,
              fontSize: 18,
              fontWeight: "900",
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
  readonly compliance: ReturnType<typeof calculateMonthlyCompliance>;
  readonly shifts: readonly ShiftEntry[];
}) {
  const palette = usePalette();
  const [expandedIssueId, setExpandedIssueId] = useState<string | null>(null);
  if (compliance.issues.length === 0) {
    return (
      <Card>
        <Text selectable style={{ color: palette.primary, fontSize: 17, fontWeight: "900" }}>
          Keine Auffälligkeiten
        </Text>
      </Card>
    );
  }
  return (
    <Card>
      <Text selectable style={{ color: palette.text, fontSize: 18, fontWeight: "900" }}>
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
              onPress={() => setExpandedIssueId((current) => current === item.id ? null : item.id)}
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
                  backgroundColor: item.severity === "critical" ? palette.danger : "#D48A18",
                }}
              />
              <View style={{ flex: 1, gap: 2 }}>
                <Text selectable style={{ color: palette.text, fontWeight: "800" }}>
                  {item.title}
                </Text>
                <Text selectable style={{ color: palette.textMuted, fontSize: 12, lineHeight: 17 }}>
                  {formatDateTitle(item.date)} · {item.kind === "LEGAL" ? "ArbZG" : "Planung"}
                </Text>
              </View>
              <Text style={{ color: palette.textMuted, fontSize: 18 }}>{expanded ? "⌃" : "⌄"}</Text>
            </Pressable>
            {expanded ? (
              <View
                style={{
                  gap: 10,
                  borderRadius: 14,
                  backgroundColor: palette.surfaceMuted,
                  marginBottom: 10,
                  padding: 12,
                }}
              >
                <Text selectable style={{ color: palette.textSecondary, fontSize: 12, lineHeight: 18 }}>
                  {item.description}
                </Text>
                {relatedShifts.map((shift) => (
                  <View key={shift.id} style={{ flexDirection: "row", justifyContent: "space-between", gap: 12 }}>
                    <Text selectable numberOfLines={1} style={{ minWidth: 0, flex: 1, color: palette.text, fontSize: 12, fontWeight: "800" }}>
                      {shift.title}
                    </Text>
                    <Text selectable style={{ color: palette.textMuted, fontSize: 12, fontVariant: ["tabular-nums"] }}>
                      {formatDateTitle(shift.date)} · {shift.startTime ?? "ganztägig"}{shift.endTime ? `–${shift.endTime}` : ""}
                    </Text>
                  </View>
                ))}
                <Text selectable style={{ color: palette.textMuted, fontSize: 11, lineHeight: 16 }}>
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
  fallback,
  accent,
  onPress,
}: {
  readonly label: string;
  readonly title: string;
  readonly icon: SymbolViewProps["name"];
  readonly fallback: string;
  readonly accent: string;
  readonly onPress: () => void;
}) {
  const palette = usePalette();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: 74,
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        backgroundColor: "transparent",
        opacity: pressed ? 0.72 : 1,
        paddingHorizontal: 14,
        paddingVertical: 10,
      })}
    >
      <StatusIcon accent={accent} fallback={fallback} icon={icon} />
      <View style={{ flex: 1, gap: 4 }}>
        <Text selectable style={{ color: palette.textMuted, fontSize: 12, fontWeight: "700" }}>
          {label}
        </Text>
        <Text selectable numberOfLines={2} style={{ color: palette.text, fontSize: 15, fontWeight: "900" }}>
          {title}
        </Text>
      </View>
      <Text style={{ color: palette.textMuted, fontSize: 18 }}>›</Text>
    </Pressable>
  );
}

function StatusIcon({
  icon,
  fallback,
  accent,
}: {
  readonly icon: SymbolViewProps["name"];
  readonly fallback: string;
  readonly accent: string;
}) {
  return (
    <View
      style={{
        width: 36,
        height: 36,
        alignItems: "center",
        justifyContent: "center",
        borderRadius: 12,
        backgroundColor: `${accent}1F`,
      }}
    >
      {process.env.EXPO_OS === "ios" ? (
        <SymbolView name={icon} size={18} tintColor={accent} weight="semibold" />
      ) : (
        <Text style={{ color: accent, fontSize: 18, fontWeight: "900" }}>{fallback}</Text>
      )}
    </View>
  );
}

function Card({ children }: { readonly children: ReactNode }) {
  const palette = usePalette();
  return (
    <View
      style={{
        gap: 14,
        borderRadius: 22,
        borderCurve: "continuous",
        backgroundColor: palette.surface,
        boxShadow: palette.dark ? undefined : "0 4px 18px rgba(28, 48, 42, 0.06)",
        padding: 18,
      }}
    >
      {children}
    </View>
  );
}
