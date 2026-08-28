import { router, useLocalSearchParams } from "expo-router";
import { Text, useWindowDimensions, View } from "react-native";

import {
  usePflegeShiftEntries,
  usePflegeShiftProfile,
  usePflegeShiftStatus,
  usePflegeShiftTariff,
} from "@/application/pflegeshift-provider";
import { useRuleCatalogRuntime } from "@/application/rule-catalog-runtime-provider";
import { currentMonth, formatDateTitle, formatMonthTitle } from "@/engine/calendar";
import { calculateMonthlyPayEstimate } from "@/engine/pay";
import { formatMinutes } from "@/engine/working-time";
import { selectAnalysisEntryWindow } from "@/features/analysis/analysis-data";
import { AnalysisDetailSummaryCard } from "@/features/analysis/analysis-detail-layout";
import { parseMonthRouteParam, type RouteParam } from "@/navigation/route-params";
import { usePalette } from "@/theme/palette";
import { TEXT_MAX_SCALE, TYPOGRAPHY } from "@/theme/typography";
import { CONTROL_HEIGHT, SCREEN_LAYOUT, SPACING } from "@/theme/tokens";
import { CardSeparator, SectionHeader, SurfaceCard } from "@/ui/design-system";
import { LoadFailureView, LoadingView } from "@/ui/loading-view";
import { ReportScrollView } from "@/ui/report-layout";

function euro(value: number): string {
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR",
  }).format(value);
}

export function PremiumDetailsScreen() {
  const palette = usePalette();
  const { fontScale } = useWindowDimensions();
  const params = useLocalSearchParams<{ month?: RouteParam }>();
  const { error, ready, reload } = usePflegeShiftStatus();
  const { profile } = usePflegeShiftProfile();
  const { entries } = usePflegeShiftEntries();
  const { tariffDecisions, workPatternSettings } = usePflegeShiftTariff();
  const { resolver: ruleResolver } = useRuleCatalogRuntime();
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

  const { allowanceShifts, monthShifts } = selectAnalysisEntryWindow(entries, month, ruleResolver);
  const decision = tariffDecisions.find((item) => item.month === month) ?? null;
  const pay = calculateMonthlyPayEstimate(
    month,
    monthShifts,
    profile,
    decision,
    allowanceShifts,
    workPatternSettings,
    ruleResolver,
  );
  const shiftsById = new Map(monthShifts.map((shift) => [shift.id, shift]));
  const premiumShifts = pay.shiftBreakdowns.filter((item) => item.premiumLines.length > 0);
  const lineCount = premiumShifts.reduce((sum, item) => sum + item.premiumLines.length, 0);
  const stackAmounts = fontScale >= SCREEN_LAYOUT.headerAccessoryStackFontScale;

  return (
    <ReportScrollView>
      <AnalysisDetailSummaryCard
        caption={`${lineCount} ${lineCount === 1 ? "Zuschlagsposition" : "Zuschlagspositionen"} aus ${premiumShifts.length} ${premiumShifts.length === 1 ? "Dienst" : "Diensten"}`}
        emphasis="metric"
        period={formatMonthTitle(month)}
        title={euro(pay.timePremiumAmount)}
      />

      <View style={{ gap: SCREEN_LAYOUT.sectionGap }}>
        <SectionHeader
          title="Aufschlüsselung"
          caption="Jeder Betrag wird nur einmal ausgewiesen."
        />
        {premiumShifts.length === 0 ? (
          <SurfaceCard style={{ padding: SPACING.xl }}>
            <Text
              maxFontSizeMultiplier={TEXT_MAX_SCALE}
              selectable
              style={{ color: palette.textMuted, ...TYPOGRAPHY.body }}
            >
              In diesem Monat wurden keine Zeitzuschläge berechnet.
            </Text>
          </SurfaceCard>
        ) : (
          premiumShifts.map((item) => {
            const shift = shiftsById.get(item.shiftId);
            return (
              <SurfaceCard key={item.shiftId} style={{ gap: SPACING.md, padding: SPACING.lg }}>
                <View style={{ gap: SPACING.xxs }}>
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
                <CardSeparator inset={0} />
                {item.premiumLines.map((line) => (
                  <View
                    key={line.key}
                    style={{
                      minHeight: CONTROL_HEIGHT.regular,
                      flexDirection: stackAmounts ? "column" : "row",
                      alignItems: stackAmounts ? "stretch" : "center",
                      gap: SPACING.md,
                    }}
                  >
                    <View style={{ minWidth: 0, flex: 1, gap: SPACING.xxs }}>
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
                        alignSelf: stackAmounts ? "flex-end" : undefined,
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
    </ReportScrollView>
  );
}
