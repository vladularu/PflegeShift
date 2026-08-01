import { Temporal } from "@js-temporal/polyfill";
import * as Haptics from "expo-haptics";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";

import {
  useMediShiftEntries,
  useMediShiftProfile,
  useMediShiftStatus,
  useMediShiftTariff,
  useMediShiftTestData,
} from "@/application/medishift-provider";
import { formatMonthTitle } from "@/engine/calendar";
import { calculateMonthlyPayEstimate } from "@/engine/pay";
import { formatMinutes } from "@/engine/working-time";
import {
  selectAnalysisEntryWindow,
} from "@/features/analysis/analysis-data";
import { premiumDetailsRoute, tariffAssessmentRoute } from "@/navigation/routes";
import { useActiveMonthCoordinator } from "@/navigation/active-month";
import { usePalette } from "@/theme/palette";
import { SurfaceCard } from "@/ui/design-system";
import { LoadingView } from "@/ui/loading-view";
import { MonthNavigator } from "@/ui/month-navigator";

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
  const params = useLocalSearchParams<{ month?: string }>();
  const { ready } = useMediShiftStatus();
  const { profile } = useMediShiftProfile();
  const { entries } = useMediShiftEntries();
  const { tariffDecisions, workPatternSettings } = useMediShiftTariff();
  const { testMonths } = useMediShiftTestData();
  const [month, setMonth] = useState(() => activeMonthCoordinator.getMonth());

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

  const { monthShifts, allowanceShifts } = useMemo(
    () => selectAnalysisEntryWindow(entries, month),
    [entries, month],
  );
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

  if (!ready || profile === null || pay === null) return <LoadingView />;

  function moveMonth(delta: number) {
    const nextMonth = Temporal.PlainDate.from(`${month}-01`)
      .add({ months: delta })
      .toString()
      .slice(0, 7);
    activeMonthCoordinator.setMonth(nextMonth);
    setMonth(nextMonth);
    if (process.env.EXPO_OS === "ios") void Haptics.selectionAsync();
  }

  const workMinutes = pay.shiftBreakdowns.reduce((sum, item) => sum + item.netMinutes, 0);
  const extras =
    pay.timePremiumAmount +
    pay.overtimeAmount +
    pay.allowanceAmount +
    pay.tvoedAllowanceAmount +
    pay.careAllowanceAmount;

  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      style={{ backgroundColor: palette.background }}
      contentContainerStyle={{ gap: 14, paddingHorizontal: 16, paddingTop: 10, paddingBottom: 48 }}
    >
      <MonthNavigator
        label={formatMonthTitle(month)}
        onNext={() => moveMonth(1)}
        onPrevious={() => moveMonth(-1)}
      />

      {testMonths.includes(month) ? (
        <View style={{ alignSelf: "center", borderRadius: 999, backgroundColor: palette.primarySoft, paddingHorizontal: 10, paddingVertical: 5 }}>
          <Text style={{ color: palette.primary, fontSize: 10, fontWeight: "900", letterSpacing: 0.8 }}>
            TESTDATEN
          </Text>
        </View>
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
              <Text selectable style={{ color: "#B9E4D8", fontSize: 11, fontWeight: "800", letterSpacing: 1.1 }}>
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
            <View style={{ flexDirection: "row", gap: 16 }}>
              <HeroValue label="Grundentgelt" value={euro(pay.personalBaseAmount)} />
              <View style={{ width: 1, backgroundColor: "rgba(255,255,255,0.16)" }} />
              <HeroValue label="Zuschläge" value={euro(extras)} />
              <View style={{ width: 1, backgroundColor: "rgba(255,255,255,0.16)" }} />
              <HeroValue label="Arbeitszeit" value={formatMinutes(workMinutes)} />
            </View>
          </View>

          <SurfaceCard style={{ gap: 12, padding: 18 }}>
            <View style={{ gap: 3, paddingBottom: 4 }}>
              <Text selectable style={{ color: palette.text, fontSize: 18, fontWeight: "900" }}>
                Zusammensetzung
              </Text>
              <Text selectable numberOfLines={1} style={{ color: palette.textMuted, fontSize: 11 }}>
                {pay.tariffLabel ?? "Tarifstand nicht verfügbar"}
              </Text>
            </View>
            <ValueRow label="Grundentgelt" value={euro(pay.personalBaseAmount)} />
            <PremiumRow pay={pay} />
            {pay.overtimeAmount > 0 ? (
              <ValueRow label="Überstunden" value={euro(pay.overtimeAmount)} />
            ) : null}
            {pay.allowanceAmount > 0 ? (
              <ValueRow
                label={pay.confirmedAllowance ? "Schichtzulage" : "Schichtzulage · Muster & Angaben"}
                onPress={() => router.push(tariffAssessmentRoute(month))}
                value={euro(pay.allowanceAmount)}
              />
            ) : null}
            {pay.tvoedAllowanceAmount > 0 ? (
              <ValueRow label="TVöD-Zulage" value={euro(pay.tvoedAllowanceAmount)} />
            ) : null}
            {pay.careAllowanceAmount > 0 ? (
              <ValueRow label="Pflegezulage TVöD-P" value={euro(pay.careAllowanceAmount)} />
            ) : null}
          </SurfaceCard>

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
            Unverbindliche Schätzung · keine Lohnabrechnung oder Rechtsberatung
          </Text>
        </>
      )}
    </ScrollView>
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

function PremiumRow({
  pay,
}: {
  readonly pay: ReturnType<typeof calculateMonthlyPayEstimate>;
}) {
  const palette = usePalette();
  const hasPremiums = pay.shiftBreakdowns.some((item) => item.premiumLines.length > 0);
  return (
    <Pressable
      accessibilityLabel={`Zeitzuschläge ${euro(pay.timePremiumAmount)}, Aufschlüsselung öffnen`}
      accessibilityRole="button"
      disabled={!hasPremiums}
      onPress={() => router.push(premiumDetailsRoute(pay.month))}
      style={({ pressed }) => ({
        minHeight: 44,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        borderRadius: 12,
        backgroundColor: pressed ? palette.surfaceMuted : "transparent",
        opacity: hasPremiums ? 1 : 0.62,
      })}
    >
      <Text selectable style={{ color: palette.textMuted, fontSize: 13 }}>
        Zeitzuschläge
      </Text>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <Text selectable style={{ color: palette.text, fontWeight: "800", fontVariant: ["tabular-nums"] }}>
          {euro(pay.timePremiumAmount)}
        </Text>
        {hasPremiums ? <Text style={{ color: palette.textMuted, fontSize: 20 }}>›</Text> : null}
      </View>
    </Pressable>
  );
}

function HeroValue({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <View style={{ minWidth: 0, flex: 1, gap: 3 }}>
      <Text selectable style={{ color: "#B9E4D8", fontSize: 10 }}>
        {label}
      </Text>
      <Text
        selectable
        adjustsFontSizeToFit
        numberOfLines={1}
        style={{ color: "#FFFFFF", fontSize: 14, fontWeight: "800", fontVariant: ["tabular-nums"] }}
      >
        {value}
      </Text>
    </View>
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
      <View style={{ minHeight: 30, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
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
