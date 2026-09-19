import Ionicons from "@expo/vector-icons/Ionicons";
import { Temporal } from "@js-temporal/polyfill";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, Text, View, useWindowDimensions } from "react-native";

import {
  usePflegeShiftEntries,
  usePflegeShiftProfile,
  usePflegeShiftStatus,
  usePflegeShiftTariff,
  usePflegeShiftTestData,
} from "@/application/pflegeshift-provider";
import { useRuleCatalogRuntime } from "@/application/rule-catalog-runtime-provider";
import { formatMonthTitle } from "@/engine/calendar";
import { calculateMonthlyPayEstimate } from "@/engine/pay";
import {
  selectAllowanceShifts,
  selectMonthlyAnalysisEntries,
} from "@/features/analysis/analysis-data";
import {
  captureRuleComputation,
  RuleComputationNotice,
} from "@/features/analysis/rule-computation";
import {
  premiumDetailsRoute,
  settingsEditorRoute,
  settingsInfoRoute,
  tariffAssessmentRoute,
} from "@/navigation/routes";
import { parseMonthRouteParam, type RouteParam } from "@/navigation/route-params";
import { useActiveMonthCoordinator } from "@/navigation/active-month";
import { usePalette } from "@/theme/palette";
import { TEXT_MAX_SCALE, TYPOGRAPHY } from "@/theme/typography";
import { CONTROL_HEIGHT, RADII, SPACING } from "@/theme/tokens";
import { CardSeparator, SurfaceCard } from "@/ui/design-system";
import { LoadFailureView, LoadingView } from "@/ui/loading-view";
import { MonthNavigator } from "@/ui/month-navigator";
import { selectionFeedback } from "@/ui/haptics";
import {
  ReportFootnote,
  ReportPeriodContent,
  ReportScrollView,
  ReportTestBadge,
} from "@/ui/report-layout";

function euro(value: number | null): string {
  if (value === null) return "–";
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR",
  }).format(value);
}

export function SalaryScreen() {
  const palette = usePalette();
  const activeMonthCoordinator = useActiveMonthCoordinator();
  const params = useLocalSearchParams<{ month?: RouteParam }>();
  const { error, ready, reload } = usePflegeShiftStatus();
  const { profile } = usePflegeShiftProfile();
  const { entries } = usePflegeShiftEntries();
  const { tariffDecisions, workPatternSettings } = usePflegeShiftTariff();
  const { testMonths } = usePflegeShiftTestData();
  const { resolver: ruleResolver } = useRuleCatalogRuntime();
  const [month, setMonth] = useState(() => activeMonthCoordinator.getMonth());
  const [ruleRetryRevision, setRuleRetryRevision] = useState(0);
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
    }, [activeMonthCoordinator]),
  );

  const calculation = useMemo(() => {
    void ruleRetryRevision;
    if (!ready || error !== null || profile === null) return null;
    return captureRuleComputation(() => {
      const monthlyEntries = selectMonthlyAnalysisEntries(entries, month);
      const allowanceShifts =
        profile.tariff === null
          ? monthlyEntries.monthShifts
          : selectAllowanceShifts(entries, month, ruleResolver);
      const decision = tariffDecisions.find((item) => item.month === month) ?? null;
      return {
        monthShifts: monthlyEntries.monthShifts,
        pay: calculateMonthlyPayEstimate(
          month,
          monthlyEntries.monthShifts,
          profile,
          decision,
          allowanceShifts,
          workPatternSettings,
          ruleResolver,
        ),
      };
    });
  }, [
    entries,
    error,
    month,
    profile,
    ready,
    ruleResolver,
    ruleRetryRevision,
    tariffDecisions,
    workPatternSettings,
  ]);

  if (ready && error) return <LoadFailureView message={error} onRetry={() => void reload()} />;
  if (calculation !== null && !calculation.ok) {
    return (
      <ReportScrollView>
        <MonthNavigator
          label={formatMonthTitle(month)}
          onNext={() => moveMonth(1)}
          onPrevious={() => moveMonth(-1)}
        />
        <ReportPeriodContent>
          <RuleComputationNotice
            failure={calculation}
            onRetry={() => setRuleRetryRevision((value) => value + 1)}
            title="Gehalt nicht verfügbar"
          />
        </ReportPeriodContent>
      </ReportScrollView>
    );
  }
  if (!ready || profile === null || calculation === null) return <LoadingView />;
  const { monthShifts, pay } = calculation.value;
  const manualSalary = profile.tariff === null && profile.manualMonthlyGrossCents != null;
  const salaryReady = profile.tariff !== null || manualSalary;

  function moveMonth(delta: number) {
    const nextMonth = Temporal.PlainDate.from(`${month}-01`)
      .add({ months: delta })
      .toString()
      .slice(0, 7);
    activeMonthCoordinator.setMonth(nextMonth);
    setMonth(nextMonth);
    selectionFeedback();
  }

  const hasPremiums = pay.shiftBreakdowns.some((item) => item.premiumLines.length > 0);
  const salaryProfileLabel = manualSalary
    ? "Manuell hinterlegt"
    : profile.tariff
      ? `TVöD-P ${profile.tariff.payGroup} · Stufe ${profile.tariff.payLevel}`
      : null;
  const compositionRows = manualSalary
    ? [{ key: "base", label: "Monatsbrutto", value: euro(pay.personalBaseAmount) }]
    : [
        { key: "base", label: "Grundentgelt", value: euro(pay.personalBaseAmount) },
        {
          key: "premium",
          label: "Zeitzuschläge",
          value: euro(pay.timePremiumAmount),
          onPress: hasPremiums ? () => router.push(premiumDetailsRoute(pay.month)) : undefined,
        },
        ...(pay.overtimeAmount > 0
          ? [{ key: "overtime", label: "Überstunden", value: euro(pay.overtimeAmount) }]
          : []),
        ...(pay.allowanceAmount > 0
          ? [
              {
                key: "shift-allowance",
                label: pay.confirmedAllowance
                  ? "Schichtzulage"
                  : "Schichtzulage · Muster & Angaben",
                value: euro(pay.allowanceAmount),
                onPress: () => router.push(tariffAssessmentRoute(month)),
              },
            ]
          : []),
        ...(pay.tvoedAllowanceAmount > 0
          ? [
              {
                key: "tvoed",
                label: "TVöD-Zulage",
                value: euro(pay.tvoedAllowanceAmount),
                onPress: () => router.push(settingsInfoRoute("TVOED_ALLOWANCE")),
              },
            ]
          : []),
        ...(pay.careAllowanceAmount > 0
          ? [
              {
                key: "care",
                label: "Pflegezulage TVöD-P",
                value: euro(pay.careAllowanceAmount),
                onPress: () => router.push(settingsInfoRoute("CARE_ALLOWANCE")),
              },
            ]
          : []),
      ];

  return (
    <ReportScrollView>
      <MonthNavigator
        label={formatMonthTitle(month)}
        onNext={() => moveMonth(1)}
        onPrevious={() => moveMonth(-1)}
      />
      <ReportPeriodContent>
        {testMonths.includes(month) ? <ReportTestBadge /> : null}

        {!salaryReady ? (
          <SetupCard />
        ) : !pay.available ? (
          <SurfaceCard style={{ gap: SPACING.xs, padding: SPACING.lg }}>
            <Text
              maxFontSizeMultiplier={TEXT_MAX_SCALE}
              selectable
              style={{ color: palette.text, ...TYPOGRAPHY.sectionTitle }}
            >
              Für diesen Monat nicht verfügbar
            </Text>
            <Text
              maxFontSizeMultiplier={TEXT_MAX_SCALE}
              selectable
              style={{ color: palette.textMuted, ...TYPOGRAPHY.body }}
            >
              Für den gewählten Zeitraum liegt kein unterstützter Tarifstand vor.
            </Text>
          </SurfaceCard>
        ) : (
          <>
            {!manualSalary && monthShifts.length === 0 ? (
              <SurfaceCard style={{ gap: SPACING.xxs, padding: SPACING.md }}>
                <Text
                  maxFontSizeMultiplier={TEXT_MAX_SCALE}
                  selectable
                  style={{ color: palette.text, ...TYPOGRAPHY.bodyStrong }}
                >
                  Noch keine Dienste in diesem Monat
                </Text>
                <Text
                  maxFontSizeMultiplier={TEXT_MAX_SCALE}
                  selectable
                  style={{ color: palette.textMuted, ...TYPOGRAPHY.caption }}
                >
                  Grundentgelt und feste Zulagen sind bereits enthalten. Variable Zeitzuschläge
                  erscheinen nach dem ersten Dienst.
                </Text>
              </SurfaceCard>
            ) : null}
            <SurfaceCard
              style={{
                gap: SPACING.md,
                borderColor: `${palette.primary}2E`,
                backgroundColor: palette.primarySoft,
                padding: SPACING.xl,
              }}
            >
              <View style={{ gap: SPACING.sm }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: SPACING.sm }}>
                  <Ionicons
                    accessibilityElementsHidden
                    color={palette.primary}
                    name="wallet-outline"
                    size={18}
                  />
                  <Text
                    maxFontSizeMultiplier={TEXT_MAX_SCALE}
                    selectable
                    style={{ color: palette.primary, ...TYPOGRAPHY.overline }}
                  >
                    {manualSalary ? "MONATSBRUTTO" : "BRUTTO-SCHÄTZUNG"}
                  </Text>
                </View>
                <Text
                  selectable
                  maxFontSizeMultiplier={TEXT_MAX_SCALE}
                  style={{
                    color: palette.text,
                    ...TYPOGRAPHY.hero,
                    fontVariant: ["tabular-nums"],
                  }}
                >
                  {euro(pay.estimatedGrossAmount)}
                </Text>
              </View>
            </SurfaceCard>

            <SurfaceCard style={{ paddingHorizontal: SPACING.lg, paddingVertical: SPACING.md }}>
              <View style={{ gap: SPACING.xxs, paddingBottom: SPACING.md }}>
                <Text
                  maxFontSizeMultiplier={TEXT_MAX_SCALE}
                  selectable
                  style={{ color: palette.text, ...TYPOGRAPHY.sectionTitle }}
                >
                  Zusammensetzung
                </Text>
                <Text
                  maxFontSizeMultiplier={TEXT_MAX_SCALE}
                  selectable
                  style={{ color: palette.textMuted, ...TYPOGRAPHY.caption }}
                >
                  {salaryProfileLabel}
                </Text>
              </View>
              {compositionRows.map((row, index) => (
                <View key={row.key}>
                  {index > 0 ? <CardSeparator inset={0} /> : null}
                  <ValueRow label={row.label} onPress={row.onPress} value={row.value} />
                </View>
              ))}
            </SurfaceCard>

            <ReportFootnote>
              {manualSalary
                ? "Manuell hinterlegter Monatswert · keine Zuschläge · keine Lohnabrechnung"
                : "Unverbindliche Schätzung · Pausenzeiten werden mangels Lageangabe mittig angesetzt · keine Lohnabrechnung"}
            </ReportFootnote>
          </>
        )}
      </ReportPeriodContent>
    </ReportScrollView>
  );
}

function SetupCard() {
  const palette = usePalette();
  return (
    <SurfaceCard style={{ gap: SPACING.md, padding: SPACING.lg }}>
      <Text
        maxFontSizeMultiplier={TEXT_MAX_SCALE}
        selectable
        style={{ color: palette.text, ...TYPOGRAPHY.screenTitle }}
      >
        Gehalt aktivieren
      </Text>
      <Text
        maxFontSizeMultiplier={TEXT_MAX_SCALE}
        selectable
        style={{ color: palette.textMuted, ...TYPOGRAPHY.body }}
      >
        Wähle TVöD-P oder hinterlege dein Monatsbrutto.
      </Text>
      <Pressable
        accessibilityRole="button"
        onPress={() => router.push(settingsEditorRoute("TARIFF"))}
        style={({ pressed }) => ({
          minHeight: CONTROL_HEIGHT.regular,
          alignItems: "center",
          justifyContent: "center",
          borderRadius: RADII.control,
          borderCurve: "continuous",
          backgroundColor: palette.accent,
          opacity: pressed ? 0.75 : 1,
        })}
      >
        <Text
          maxFontSizeMultiplier={TEXT_MAX_SCALE}
          style={{ color: palette.onAccent, ...TYPOGRAPHY.button }}
        >
          Gehalt einrichten
        </Text>
      </Pressable>
    </SurfaceCard>
  );
}

function ValueRow({
  label,
  value,
  onPress,
}: {
  readonly label: string;
  readonly value: string;
  readonly onPress?: () => void;
}) {
  const palette = usePalette();
  const { fontScale } = useWindowDimensions();
  const stacked = fontScale >= 1.6;
  const content = (
    <>
      <Text
        maxFontSizeMultiplier={TEXT_MAX_SCALE}
        selectable
        style={{ color: palette.textMuted, ...TYPOGRAPHY.label }}
      >
        {label}
      </Text>
      <View style={{ flexDirection: "row", alignItems: "center", gap: SPACING.sm }}>
        <Text
          maxFontSizeMultiplier={TEXT_MAX_SCALE}
          selectable
          style={{ color: palette.text, ...TYPOGRAPHY.bodyStrong, fontVariant: ["tabular-nums"] }}
        >
          {value}
        </Text>
        {onPress ? (
          <Ionicons
            accessibilityElementsHidden
            color={palette.textMuted}
            name="chevron-forward"
            size={17}
          />
        ) : null}
      </View>
    </>
  );

  if (!onPress) {
    return (
      <View
        style={{
          minHeight: CONTROL_HEIGHT.regular,
          flexDirection: stacked ? "column" : "row",
          alignItems: stacked ? "flex-start" : "center",
          justifyContent: "space-between",
          gap: SPACING.md,
          paddingVertical: stacked ? SPACING.sm : 0,
        }}
      >
        {content}
      </View>
    );
  }

  return (
    <Pressable
      accessibilityLabel={`${label} ${value}, Erklärung öffnen`}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: CONTROL_HEIGHT.regular,
        flexDirection: stacked ? "column" : "row",
        alignItems: stacked ? "flex-start" : "center",
        justifyContent: "space-between",
        gap: SPACING.md,
        borderRadius: RADII.control,
        backgroundColor: pressed ? palette.surfaceMuted : "transparent",
        opacity: pressed ? 0.72 : 1,
        paddingVertical: stacked ? SPACING.sm : 0,
      })}
    >
      {content}
    </Pressable>
  );
}
