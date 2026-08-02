import { useLocalSearchParams } from "expo-router";
import { ScrollView, Text, View } from "react-native";

import {
  useMediShiftEntries,
  useMediShiftProfile,
  useMediShiftStatus,
  useMediShiftTariff,
} from "@/application/medishift-provider";
import { currentMonth, formatDateTitle, formatMonthTitle } from "@/engine/calendar";
import { calculateMonthlyPayEstimate } from "@/engine/pay";
import { formatMinutes } from "@/engine/working-time";
import { selectAnalysisEntryWindow } from "@/features/analysis/analysis-data";
import { usePalette } from "@/theme/palette";
import { SectionHeader, SurfaceCard } from "@/ui/design-system";
import { LoadingView } from "@/ui/loading-view";

function euro(value: number): string {
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR",
  }).format(value);
}

export function PremiumDetailsScreen() {
  const palette = usePalette();
  const params = useLocalSearchParams<{ month?: string }>();
  const { ready } = useMediShiftStatus();
  const { profile } = useMediShiftProfile();
  const { entries } = useMediShiftEntries();
  const { tariffDecisions, workPatternSettings } = useMediShiftTariff();
  const month = typeof params.month === "string" && /^\d{4}-\d{2}$/.test(params.month)
    ? params.month
    : currentMonth(profile?.timeZone);

  if (!ready || profile === null) return <LoadingView />;

  const { allowanceShifts, monthShifts } = selectAnalysisEntryWindow(entries, month);
  const decision = tariffDecisions.find((item) => item.month === month) ?? null;
  const pay = calculateMonthlyPayEstimate(
    month,
    monthShifts,
    profile,
    decision,
    allowanceShifts,
    workPatternSettings,
  );
  const shiftsById = new Map(monthShifts.map((shift) => [shift.id, shift]));
  const premiumShifts = pay.shiftBreakdowns.filter((item) => item.premiumLines.length > 0);
  const lineCount = premiumShifts.reduce((sum, item) => sum + item.premiumLines.length, 0);

  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      style={{ backgroundColor: palette.background }}
      contentContainerStyle={{ gap: 16, padding: 16, paddingBottom: 36 }}
    >
      <SurfaceCard style={{ gap: 5, padding: 18 }}>
        <Text selectable style={{ color: palette.textMuted, fontSize: 12, fontWeight: "700" }}>
          {formatMonthTitle(month)}
        </Text>
        <Text
          selectable
          adjustsFontSizeToFit
          numberOfLines={1}
          style={{
            color: palette.text,
            fontSize: 30,
            fontWeight: "900",
            fontVariant: ["tabular-nums"],
            letterSpacing: -0.6,
          }}
        >
          {euro(pay.timePremiumAmount)}
        </Text>
        <Text selectable style={{ color: palette.textMuted, fontSize: 12 }}>
          {lineCount} {lineCount === 1 ? "Zuschlagsposition" : "Zuschlagspositionen"} aus {premiumShifts.length} {premiumShifts.length === 1 ? "Dienst" : "Diensten"}
        </Text>
      </SurfaceCard>

      <View style={{ gap: 10 }}>
        <SectionHeader
          title="Aufschlüsselung"
          caption="Jeder Betrag wird nur einmal ausgewiesen."
        />
        {premiumShifts.length === 0 ? (
          <SurfaceCard style={{ padding: 18 }}>
            <Text selectable style={{ color: palette.textMuted, fontSize: 13 }}>
              In diesem Monat wurden keine Zeitzuschläge berechnet.
            </Text>
          </SurfaceCard>
        ) : (
          premiumShifts.map((item) => {
            const shift = shiftsById.get(item.shiftId);
            return (
              <SurfaceCard key={item.shiftId} style={{ gap: 12, padding: 16 }}>
                <View style={{ gap: 3 }}>
                  <Text selectable style={{ color: palette.text, fontSize: 15, fontWeight: "900" }}>
                    {formatDateTitle(item.date)}
                  </Text>
                  <Text selectable style={{ color: palette.textMuted, fontSize: 12 }}>
                    {shift?.title ?? "Dienst"}
                    {shift?.startTime ? ` · ${shift.startTime}${shift.endTime ? `–${shift.endTime}` : ""}` : ""}
                  </Text>
                </View>
                <View style={{ height: 1, backgroundColor: palette.separator }} />
                {item.premiumLines.map((line) => (
                  <View
                    key={line.key}
                    style={{
                      minHeight: 48,
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 14,
                    }}
                  >
                    <View style={{ minWidth: 0, flex: 1, gap: 3 }}>
                      <Text selectable style={{ color: palette.textSecondary, fontSize: 13, fontWeight: "800" }}>
                        {line.label}
                      </Text>
                      <Text selectable style={{ color: palette.textMuted, fontSize: 12, lineHeight: 17 }}>
                        {formatMinutes(line.minutes)} × {line.percentage} % × {euro(line.hourlyRate)}/h
                      </Text>
                    </View>
                    <Text
                      selectable
                      style={{
                        color: palette.primary,
                        fontSize: 14,
                        fontWeight: "900",
                        fontVariant: ["tabular-nums"],
                      }}
                    >
                      {euro(line.amount)}
                    </Text>
                  </View>
                ))}
              </SurfaceCard>
            );
          })
        )}
      </View>
    </ScrollView>
  );
}
