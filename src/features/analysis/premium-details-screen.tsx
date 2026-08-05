import { router, useLocalSearchParams } from "expo-router";
import { ScrollView, Text, View } from "react-native";

import {
  usePflegeShiftEntries,
  usePflegeShiftProfile,
  usePflegeShiftStatus,
  usePflegeShiftTariff,
} from "@/application/pflegeshift-provider";
import { currentMonth, formatDateTitle, formatMonthTitle } from "@/engine/calendar";
import { calculateMonthlyPayEstimate } from "@/engine/pay";
import { formatMinutes } from "@/engine/working-time";
import { selectAnalysisEntryWindow } from "@/features/analysis/analysis-data";
import { parseMonthRouteParam, type RouteParam } from "@/navigation/route-params";
import { usePalette } from "@/theme/palette";
import { TEXT_MAX_SCALE, TYPOGRAPHY } from "@/theme/typography";
import { SPACING } from "@/theme/tokens";
import { SectionHeader, SurfaceCard } from "@/ui/design-system";
import { LoadFailureView, LoadingView } from "@/ui/loading-view";

function euro(value: number): string {
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR",
  }).format(value);
}

export function PremiumDetailsScreen() {
  const palette = usePalette();
  const params = useLocalSearchParams<{ month?: RouteParam }>();
  const { error, ready, reload } = usePflegeShiftStatus();
  const { profile } = usePflegeShiftProfile();
  const { entries } = usePflegeShiftEntries();
  const { tariffDecisions, workPatternSettings } = usePflegeShiftTariff();
  const parsedMonth = parseMonthRouteParam(params.month);
  const month =
    parsedMonth.status === "valid" ? parsedMonth.value : currentMonth(profile?.timeZone);

  if (parsedMonth.status !== "valid") {
    return (
      <LoadFailureView
        actionLabel="Schließen"
        message="Der Link zu den Zuschlagsdetails enthält keinen gültigen Monat."
        onRetry={() => router.back()}
        title="Zuschlagsdetails können nicht geöffnet werden"
      />
    );
  }
  if (ready && error) {
    return <LoadFailureView message={error} onRetry={() => void reload()} />;
  }
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
      style={{ backgroundColor: palette.groupedBackground }}
      contentContainerStyle={{ gap: SPACING.lg, padding: SPACING.lg, paddingBottom: 36 }}
    >
      <SurfaceCard style={{ gap: SPACING.xs, padding: SPACING.lg }}>
        <Text
          maxFontSizeMultiplier={TEXT_MAX_SCALE}
          selectable
          style={{ color: palette.textMuted, ...TYPOGRAPHY.label }}
        >
          {formatMonthTitle(month)}
        </Text>
        <Text
          selectable
          style={{
            color: palette.text,
            ...TYPOGRAPHY.hero,
            fontVariant: ["tabular-nums"],
            letterSpacing: -0.6,
          }}
        >
          {euro(pay.timePremiumAmount)}
        </Text>
        <Text
          maxFontSizeMultiplier={TEXT_MAX_SCALE}
          selectable
          style={{ color: palette.textMuted, ...TYPOGRAPHY.caption }}
        >
          {lineCount} {lineCount === 1 ? "Zuschlagsposition" : "Zuschlagspositionen"} aus{" "}
          {premiumShifts.length} {premiumShifts.length === 1 ? "Dienst" : "Diensten"}
        </Text>
      </SurfaceCard>

      <View style={{ gap: SPACING.sm }}>
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
                  <Text
                    maxFontSizeMultiplier={TEXT_MAX_SCALE}
                    selectable
                    style={{ color: palette.text, ...TYPOGRAPHY.bodyStrong }}
                  >
                    {formatDateTitle(item.date)}
                  </Text>
                  <Text
                    maxFontSizeMultiplier={TEXT_MAX_SCALE}
                    selectable
                    style={{ color: palette.textMuted, ...TYPOGRAPHY.caption }}
                  >
                    {shift?.title ?? "Dienst"}
                    {shift?.startTime
                      ? ` · ${shift.startTime}${shift.endTime ? `–${shift.endTime}` : ""}`
                      : ""}
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
                      <Text
                        maxFontSizeMultiplier={TEXT_MAX_SCALE}
                        selectable
                        style={{ color: palette.textSecondary, ...TYPOGRAPHY.label }}
                      >
                        {line.label}
                      </Text>
                      <Text
                        maxFontSizeMultiplier={TEXT_MAX_SCALE}
                        selectable
                        style={{ color: palette.textMuted, ...TYPOGRAPHY.caption }}
                      >
                        {formatMinutes(line.minutes)} × {line.percentage} % ×{" "}
                        {euro(line.hourlyRate)}/h
                      </Text>
                    </View>
                    <Text
                      selectable
                      style={{
                        color: palette.primary,
                        ...TYPOGRAPHY.label,
                        fontWeight: "700",
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
