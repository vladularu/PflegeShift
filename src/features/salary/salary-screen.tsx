import { Temporal } from "@js-temporal/polyfill";
import { useIsFocused } from "@react-navigation/native";
import * as Haptics from "expo-haptics";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pressable, Text, View } from "react-native";

import {
  useMediShiftEntries,
  useMediShiftProfile,
  useMediShiftStatus,
  useMediShiftTariff,
  useMediShiftTestData,
} from "@/application/medishift-provider";
import { formatMonthTitle } from "@/engine/calendar";
import { calculateMonthlyPayEstimate } from "@/engine/pay";
import {
  EMPTY_ANALYSIS_ENTRY_WINDOW,
  selectAnalysisEntryWindow,
  type AnalysisEntryWindow,
} from "@/features/analysis/analysis-data";
import { premiumDetailsRoute, settingsInfoRoute, tariffAssessmentRoute } from "@/navigation/routes";
import { useActiveMonthCoordinator } from "@/navigation/active-month";
import { usePalette } from "@/theme/palette";
import { CardSeparator, SurfaceCard } from "@/ui/design-system";
import { LoadFailureView, LoadingView } from "@/ui/loading-view";
import { MonthNavigator } from "@/ui/month-navigator";
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
  const isFocused = useIsFocused();
  const activeMonthCoordinator = useActiveMonthCoordinator();
  const params = useLocalSearchParams<{ month?: string }>();
  const { error, ready, reload } = useMediShiftStatus();
  const { profile } = useMediShiftProfile();
  const { entries } = useMediShiftEntries();
  const { tariffDecisions, workPatternSettings } = useMediShiftTariff();
  const { testMonths } = useMediShiftTestData();
  const [month, setMonth] = useState(() => activeMonthCoordinator.getMonth());
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
  }, [activeMonthCoordinator]));

  const entryWindow = useMemo(() => {
    if (!isFocused) return entryWindowCache.current;
    const nextWindow = selectAnalysisEntryWindow(entries, month);
    entryWindowCache.current = nextWindow;
    return nextWindow;
  }, [entries, isFocused, month]);
  const { monthShifts, allowanceShifts } = entryWindow ?? EMPTY_ANALYSIS_ENTRY_WINDOW;
  const decision = tariffDecisions.find((item) => item.month === month) ?? null;
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

  if (ready && error) return <LoadFailureView message={error} onRetry={() => void reload()} />;
  if (!ready || profile === null || entryWindow === null || pay === null) return <LoadingView />;

  function moveMonth(delta: number) {
    const nextMonth = Temporal.PlainDate.from(`${month}-01`)
      .add({ months: delta })
      .toString()
      .slice(0, 7);
    activeMonthCoordinator.setMonth(nextMonth);
    setMonth(nextMonth);
    if (process.env.EXPO_OS === "ios") void Haptics.selectionAsync();
  }

  const hasPremiums = pay.shiftBreakdowns.some((item) => item.premiumLines.length > 0);
  const tariffProfileLabel = profile.tariff
    ? `TVöD-P ${profile.tariff.payGroup} · Stufe ${profile.tariff.payLevel}`
    : null;
  const compositionRows = [
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
      ? [{
        key: "shift-allowance",
        label: pay.confirmedAllowance ? "Schichtzulage" : "Schichtzulage · Muster & Angaben",
        value: euro(pay.allowanceAmount),
        onPress: () => router.push(tariffAssessmentRoute(month)),
      }]
      : []),
    ...(pay.tvoedAllowanceAmount > 0
      ? [{
        key: "tvoed",
        label: "TVöD-Zulage",
        value: euro(pay.tvoedAllowanceAmount),
        onPress: () => router.push(settingsInfoRoute("TVOED_ALLOWANCE")),
      }]
      : []),
    ...(pay.careAllowanceAmount > 0
      ? [{
        key: "care",
        label: "Pflegezulage TVöD-P",
        value: euro(pay.careAllowanceAmount),
        onPress: () => router.push(settingsInfoRoute("CARE_ALLOWANCE")),
      }]
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

      {testMonths.includes(month) ? (
        <ReportTestBadge />
      ) : null}

      {profile.tariff === null ? (
        <SetupCard />
      ) : !pay.available ? (
        <SurfaceCard style={{ gap: 6, padding: 18 }}>
          <Text selectable style={{ color: palette.text, fontSize: 18, fontWeight: "900" }}>
            Für diesen Monat nicht verfügbar
          </Text>
          <Text selectable style={{ color: palette.textMuted, fontSize: 13, lineHeight: 19 }}>
            Für den gewählten Zeitraum liegt kein unterstützter Tarifstand vor.
          </Text>
        </SurfaceCard>
      ) : (
        <>
          {monthShifts.length === 0 ? (
            <SurfaceCard style={{ gap: 4, padding: 14 }}>
              <Text selectable style={{ color: palette.text, fontSize: 14, fontWeight: "800" }}>
                Noch keine Dienste in diesem Monat
              </Text>
              <Text selectable style={{ color: palette.textMuted, fontSize: 12, lineHeight: 17 }}>
                Grundentgelt und feste Zulagen sind bereits enthalten. Variable Zeitzuschläge erscheinen nach dem ersten Dienst.
              </Text>
            </SurfaceCard>
          ) : null}
          <View
            style={{
              gap: 16,
              borderRadius: 22,
              borderCurve: "continuous",
              backgroundColor: palette.dark ? "#19352E" : "#1E6D5D",
              boxShadow: "0 10px 28px rgba(20, 76, 64, 0.18)",
              padding: 18,
            }}
          >
            <View style={{ gap: 6 }}>
              <Text selectable style={{ color: "#B9E4D8", fontSize: 12, fontWeight: "800", letterSpacing: 0.8 }}>
                TARIFLICHES BRUTTO · SCHÄTZUNG
              </Text>
              <Text
                selectable
                adjustsFontSizeToFit
                numberOfLines={1}
                style={{
                  color: "#FFFFFF",
                  fontSize: 34,
                  fontWeight: "900",
                  fontVariant: ["tabular-nums"],
                  letterSpacing: -1,
                }}
              >
                {euro(pay.estimatedGrossAmount)}
              </Text>
            </View>
          </View>

          <SurfaceCard style={{ paddingHorizontal: 18, paddingVertical: 14 }}>
            <View style={{ gap: 3, paddingBottom: 12 }}>
              <Text selectable style={{ color: palette.text, fontSize: 18, fontWeight: "900" }}>
                Zusammensetzung
              </Text>
              <Text selectable numberOfLines={1} style={{ color: palette.textMuted, fontSize: 12 }}>
                {tariffProfileLabel}
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
            Unverbindliche Schätzung · keine Lohnabrechnung oder Rechtsberatung
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
    <SurfaceCard style={{ gap: 12, padding: 18 }}>
      <Text selectable style={{ color: palette.text, fontSize: 20, fontWeight: "900" }}>
        Gehalt aktivieren
      </Text>
      <Text selectable style={{ color: palette.textMuted, fontSize: 13, lineHeight: 19 }}>
        Hinterlege einmal Gruppe, Stufe und Bereich. Die Berechnung erfolgt danach automatisch.
      </Text>
      <Pressable
        accessibilityRole="button"
        onPress={() => router.push("/more")}
        style={({ pressed }) => ({
          minHeight: 48,
          alignItems: "center",
          justifyContent: "center",
          borderRadius: 15,
          borderCurve: "continuous",
          backgroundColor: palette.primary,
          opacity: pressed ? 0.75 : 1,
        })}
      >
        <Text style={{ color: palette.onPrimary, fontWeight: "900" }}>
          Tarifprofil einrichten
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
  const content = (
    <>
      <Text selectable style={{ color: palette.textMuted, fontSize: 13 }}>
        {label}
      </Text>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <Text selectable style={{ color: palette.text, fontWeight: "800", fontVariant: ["tabular-nums"] }}>
          {value}
        </Text>
        {onPress ? <Text style={{ color: palette.textMuted, fontSize: 20 }}>›</Text> : null}
      </View>
    </>
  );

  if (!onPress) {
    return (
      <View style={{ minHeight: 46, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
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
        minHeight: 44,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        borderRadius: 12,
        backgroundColor: pressed ? palette.surfaceMuted : "transparent",
        opacity: pressed ? 0.72 : 1,
      })}
    >
      {content}
    </Pressable>
  );
}
