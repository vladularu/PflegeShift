import { Temporal } from "@js-temporal/polyfill";
import * as Haptics from "expo-haptics";
import { router, useLocalSearchParams } from "expo-router";
import { SymbolView, type SymbolViewProps } from "expo-symbols";
import { startTransition, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import Svg, { Circle, G } from "react-native-svg";

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
import { currentMonth, formatDateTitle, formatMonthTitle } from "@/engine/calendar";
import { calculateMonthlyCompliance } from "@/engine/compliance";
import { calculateMonthlyPayEstimate } from "@/engine/pay";
import { calculateMonthlySummary } from "@/engine/monthly-summary";
import { formatMinutes, formatSignedMinutes } from "@/engine/working-time";
import {
  selectAnalysisEntryWindow,
} from "@/features/analysis/analysis-data";
import { buildAnnualReport } from "@/features/analysis/annual-report";
import {
  AnalysisPeriodPicker,
  AnnualReportScreen,
  type AnalysisPeriod,
} from "@/features/analysis/annual-report-view";
import { buildShiftTypeDistribution } from "@/features/calendar/calendar-metrics";
import { tariffAssessmentRoute } from "@/navigation/routes";
import { SHIFT_TYPE_COLORS, usePalette } from "@/theme/palette";
import { EmptyState, MetricCard, SectionHeader, SurfaceCard } from "@/ui/design-system";
import { LoadingView } from "@/ui/loading-view";
import { MonthNavigator } from "@/ui/month-navigator";

type Detail = "COMPLIANCE" | null;

const ALLOWANCE_LABELS: Readonly<Record<AllowanceStatus, string>> = {
  NONE: "Keine Zulage",
  SHIFT_MONTHLY: "Ständige Schichtarbeit",
  SHIFT_HOURLY: "Nichtständige Schichtarbeit",
  ALTERNATING_MONTHLY: "Ständige Wechselschicht",
  ALTERNATING_HOURLY: "Nichtständige Wechselschicht",
};

export function AnalysisScreen() {
  const palette = usePalette();
  const params = useLocalSearchParams<{ month?: string }>();
  const { ready } = useMediShiftStatus();
  const { profile } = useMediShiftProfile();
  const { entries } = useMediShiftEntries();
  const { tariffDecisions, workPatternSettings } = useMediShiftTariff();
  const { testMonths } = useMediShiftTestData();
  const [month, setMonth] = useState(currentMonth);
  const [period, setPeriod] = useState<AnalysisPeriod>("MONTH");
  const [year, setYear] = useState(() => Number(currentMonth().slice(0, 4)));
  const [detail, setDetail] = useState<Detail>(null);

  useEffect(() => {
    if (typeof params.month === "string" && /^\d{4}-\d{2}$/.test(params.month)) {
      setMonth(params.month);
      setDetail(null);
    }
  }, [params.month]);

  const {
    monthEntries,
    monthShifts,
    complianceShifts,
    allowanceShifts,
  } = useMemo(
    () => selectAnalysisEntryWindow(entries, month),
    [entries, month],
  );
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
    () => period === "YEAR" && profile
      ? buildAnnualReport(year, entries, profile, tariffDecisions, workPatternSettings)
      : null,
    [entries, period, profile, tariffDecisions, workPatternSettings, year],
  );

  if (
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
    startTransition(() => {
      setMonth(nextMonth);
      setPeriod("MONTH");
      setDetail(null);
    });
  }

  if (period === "YEAR") {
    if (annualReport === null) return <LoadingView />;
    return (
      <AnnualReportScreen
        report={annualReport}
        testMonths={testMonths}
        onChangePeriod={changePeriod}
        onMoveYear={(delta) => setYear((current) => current + delta)}
        onSelectMonth={selectAnnualMonth}
      />
    );
  }

  function moveMonth(delta: number) {
    startTransition(() => {
      setMonth(
        Temporal.PlainDate.from(`${month}-01`).add({ months: delta }).toString().slice(0, 7),
      );
      setDetail(null);
    });
  }

  function openDetail(nextDetail: Exclude<Detail, null>) {
    setDetail((current) => current === nextDetail ? null : nextDetail);
    if (process.env.EXPO_OS === "ios") {
      void Haptics.selectionAsync();
    }
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
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      style={{ backgroundColor: palette.background }}
      contentContainerStyle={{ gap: 12, paddingHorizontal: 16, paddingTop: 10, paddingBottom: 48 }}
    >
      <AnalysisPeriodPicker value={period} onChange={changePeriod} />
      <MonthNavigator
        label={formatMonthTitle(month)}
        onNext={() => moveMonth(1)}
        onPrevious={() => moveMonth(-1)}
      />
      {testMonths.includes(month) ? (
        <View style={{ alignSelf: "center", borderRadius: 999, backgroundColor: palette.primarySoft, paddingHorizontal: 10, paddingVertical: 5 }}>
          <Text style={{ color: palette.primary, fontSize: 10, fontWeight: "900", letterSpacing: 0.8 }}>TESTDATEN</Text>
        </View>
      ) : null}

      <View style={{ flexDirection: "row", gap: 8 }}>
        <MetricCard compact label="Soll" value={formatMinutes(summary.targetMinutes)} />
        <MetricCard compact label="Ist" value={formatMinutes(summary.actualMinutes)} />
        <MetricCard
          compact
          accent={summary.balanceMinutes < 0 ? palette.danger : palette.success}
          label="Saldo"
          value={formatSignedMinutes(summary.balanceMinutes)}
        />
      </View>

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
              active={detail === "COMPLIANCE"}
              onPress={() => openDetail("COMPLIANCE")}
            />
            <View style={{ height: 1, marginLeft: 60, backgroundColor: palette.separator }} />
            <StatusCard
              accent={decision ? palette.primary : "#D48A18"}
              icon={decision ? "checkmark.seal.fill" : "sparkles"}
              fallback={decision ? "✓" : "·"}
              label="Schichtzulage"
              title={allowanceTitle}
              active={false}
              onPress={() => router.push(tariffAssessmentRoute(month))}
            />
      </View>

      {detail === "COMPLIANCE" ? (
        <ComplianceDetails compliance={compliance} shifts={complianceShifts} />
      ) : null}

      <Text
        selectable
        style={{
          color: palette.textMuted,
          fontSize: 10,
          lineHeight: 15,
          paddingHorizontal: 6,
          textAlign: "center",
        }}
      >
        Automatische Prüfung · keine Rechtsberatung
      </Text>

      <View style={{ gap: 10 }}>
        <SectionHeader title="Dienstverteilung" caption="Termine werden nicht als Arbeitszeit gezählt." />
        <DistributionChart distribution={distribution} />
      </View>
    </ScrollView>
  );
}

function DistributionChart({ distribution }: { readonly distribution: ReadonlyMap<ShiftType, number> }) {
  const palette = usePalette();
  const items = [...distribution.entries()].filter(([, count]) => count > 0);
  const total = items.reduce((sum, [, count]) => sum + count, 0);
  const radius = 42;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;
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
    <SurfaceCard style={{ minHeight: 190, flexDirection: "row", alignItems: "center", gap: 20, padding: 18 }}>
      <View accessibilityLabel={`${total} Schichten insgesamt`} accessible>
        <Svg height={112} width={112} viewBox="0 0 112 112">
          <Circle cx={56} cy={56} fill="none" r={radius} stroke={palette.surfaceMuted} strokeWidth={16} />
          <G rotation="-90" origin="56,56">
            {items.map(([type, count]) => {
              const length = total === 0 ? 0 : (count / total) * circumference;
              const element = (
                <Circle
                  key={type}
                  cx={56}
                  cy={56}
                  fill="none"
                  r={radius}
                  stroke={SHIFT_TYPE_COLORS[type]}
                  strokeDasharray={`${length} ${circumference - length}`}
                  strokeDashoffset={-offset}
                  strokeWidth={16}
                />
              );
              offset += length;
              return element;
            })}
          </G>
        </Svg>
        <View style={{ position: "absolute", inset: 0, alignItems: "center", justifyContent: "center", pointerEvents: "none" }}>
          <Text style={{ color: palette.text, fontSize: 24, fontWeight: "900", fontVariant: ["tabular-nums"] }}>{total}</Text>
          <Text style={{ color: palette.textMuted, fontSize: 10 }}>Gesamt</Text>
        </View>
      </View>
      <View style={{ flex: 1, gap: 8 }}>
        {items.length === 0 ? (
          <Text style={{ color: palette.textMuted, fontSize: 13 }}>Noch keine Schichten in diesem Monat.</Text>
        ) : items.map(([type, count]) => (
          <View key={type} style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: SHIFT_TYPE_COLORS[type] }} />
            <Text style={{ flex: 1, color: palette.textSecondary, fontSize: 12 }}>{SHIFT_TYPE_LABELS[type]}</Text>
            <Text style={{ color: palette.text, fontSize: 12, fontWeight: "800", fontVariant: ["tabular-nums"] }}>{count}</Text>
          </View>
        ))}
      </View>
    </SurfaceCard>
  );
}

function ComplianceDetails({
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
                <Text selectable style={{ color: palette.textMuted, fontSize: 11 }}>
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
                    <Text selectable style={{ color: palette.textMuted, fontSize: 11, fontVariant: ["tabular-nums"] }}>
                      {formatDateTitle(shift.date)} · {shift.startTime ?? "ganztägig"}{shift.endTime ? `–${shift.endTime}` : ""}
                    </Text>
                  </View>
                ))}
                <Text selectable style={{ color: palette.textMuted, fontSize: 9 }}>
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
  active,
  onPress,
}: {
  readonly label: string;
  readonly title: string;
  readonly icon: SymbolViewProps["name"];
  readonly fallback: string;
  readonly accent: string;
  readonly active: boolean;
  readonly onPress: () => void;
}) {
  const palette = usePalette();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ expanded: active }}
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: 74,
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        backgroundColor: active ? `${accent}12` : "transparent",
        opacity: pressed ? 0.72 : 1,
        paddingHorizontal: 14,
        paddingVertical: 10,
      })}
    >
      <StatusIcon accent={accent} fallback={fallback} icon={icon} />
      <View style={{ flex: 1, gap: 4 }}>
        <Text selectable style={{ color: palette.textMuted, fontSize: 11, fontWeight: "700" }}>
          {label}
        </Text>
        <Text selectable numberOfLines={2} style={{ color: palette.text, fontSize: 15, fontWeight: "900" }}>
          {title}
        </Text>
      </View>
      <Text style={{ color: palette.textMuted, fontSize: 18 }}>{active ? "−" : "›"}</Text>
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
