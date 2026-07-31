import { Temporal } from "@js-temporal/polyfill";
import * as Haptics from "expo-haptics";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";

import {
  useMediShiftEntries,
  useMediShiftProfile,
  useMediShiftStatus,
  useMediShiftTariff,
  useMediShiftTestData,
} from "@/application/medishift-provider";
import { currentMonth, formatMonthTitle } from "@/engine/calendar";
import { calculateMonthlyPayEstimate } from "@/engine/pay";
import { formatMinutes } from "@/engine/working-time";
import {
  selectAnalysisEntryWindow,
} from "@/features/analysis/analysis-data";
import { premiumDetailsRoute } from "@/navigation/routes";
import { usePalette } from "@/theme/palette";
import { SurfaceCard } from "@/ui/design-system";
import { LoadingView } from "@/ui/loading-view";

function euro(value: number | null): string {
  if (value === null) return "–";
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR",
  }).format(value);
}

export function SalaryScreen() {
  const palette = usePalette();
  const params = useLocalSearchParams<{ month?: string }>();
  const { ready } = useMediShiftStatus();
  const { profile } = useMediShiftProfile();
  const { entries } = useMediShiftEntries();
  const { tariffDecisions, workPatternSettings } = useMediShiftTariff();
  const { testMonths } = useMediShiftTestData();
  const [month, setMonth] = useState(currentMonth);

  useEffect(() => {
    if (typeof params.month === "string" && /^\d{4}-\d{2}$/.test(params.month)) {
      setMonth(params.month);
    }
  }, [params.month]);

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
    setMonth(
      Temporal.PlainDate.from(`${month}-01`).add({ months: delta }).toString().slice(0, 7),
    );
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
      <View
        style={{
          minHeight: 48,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <MonthButton direction="back" onPress={() => moveMonth(-1)} />
        <Text selectable style={{ color: palette.text, fontSize: 21, fontWeight: "800" }}>
          {formatMonthTitle(month)}
        </Text>
        <MonthButton direction="forward" onPress={() => moveMonth(1)} />
      </View>

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
                BRUTTO GESCHÄTZT
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

function ValueRow({ label, value }: { readonly label: string; readonly value: string }) {
  const palette = usePalette();
  return (
    <View style={{ minHeight: 30, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
      <Text selectable style={{ color: palette.textMuted, fontSize: 13 }}>
        {label}
      </Text>
      <Text selectable style={{ color: palette.text, fontWeight: "800", fontVariant: ["tabular-nums"] }}>
        {value}
      </Text>
    </View>
  );
}

function MonthButton({
  direction,
  onPress,
}: {
  readonly direction: "back" | "forward";
  readonly onPress: () => void;
}) {
  const palette = usePalette();
  return (
    <Pressable
      accessibilityLabel={direction === "back" ? "Vorheriger Monat" : "Nächster Monat"}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => ({
        width: 42,
        height: 42,
        alignItems: "center",
        justifyContent: "center",
        borderRadius: 21,
        backgroundColor: palette.surface,
        opacity: pressed ? 0.65 : 1,
      })}
    >
      <Text style={{ color: palette.text, fontSize: 24, fontWeight: "500" }}>
        {direction === "back" ? "‹" : "›"}
      </Text>
    </Pressable>
  );
}
