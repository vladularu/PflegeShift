import { useLocalSearchParams } from "expo-router";
import { useMemo } from "react";
import { ScrollView, Text, View } from "react-native";

import {
  useMediShiftEntries,
  useMediShiftProfile,
  useMediShiftStatus,
} from "@/application/medishift-provider";
import { currentMonth, formatMonthTitle } from "@/engine/calendar";
import { calculateMonthlyCompliance } from "@/engine/compliance";
import { selectAnalysisEntryWindow } from "@/features/analysis/analysis-data";
import { ComplianceDetails } from "@/features/analysis/analysis-screen";
import { usePalette } from "@/theme/palette";
import { TEXT_MAX_SCALE, TYPOGRAPHY } from "@/theme/typography";
import { SPACING } from "@/theme/tokens";
import { LoadingView } from "@/ui/loading-view";

export function ComplianceDetailsScreen() {
  const palette = usePalette();
  const params = useLocalSearchParams<{ month?: string }>();
  const { ready } = useMediShiftStatus();
  const { profile } = useMediShiftProfile();
  const { entries } = useMediShiftEntries();
  const month = typeof params.month === "string" && /^\d{4}-\d{2}$/.test(params.month)
    ? params.month
    : currentMonth(profile?.timeZone);
  const window = useMemo(() => selectAnalysisEntryWindow(entries, month), [entries, month]);
  const compliance = useMemo(
    () => profile
      ? calculateMonthlyCompliance(month, window.complianceShifts, profile.timeZone, {
        federalState: profile.federalState,
        weeklyMinutes: profile.weeklyMinutes,
      })
      : null,
    [month, profile, window.complianceShifts],
  );

  if (!ready || profile === null || compliance === null) return <LoadingView />;

  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      style={{ backgroundColor: palette.groupedBackground }}
      contentContainerStyle={{ gap: SPACING.lg, padding: SPACING.lg, paddingBottom: 36 }}
    >
      <View style={{ gap: SPACING.xxs }}>
        <Text maxFontSizeMultiplier={TEXT_MAX_SCALE} selectable style={{ color: palette.textMuted, ...TYPOGRAPHY.label }}>
          {formatMonthTitle(month)}
        </Text>
        <Text maxFontSizeMultiplier={TEXT_MAX_SCALE} selectable style={{ color: palette.text, ...TYPOGRAPHY.screenTitle }}>
          {compliance.criticalCount === 0 && compliance.warningCount === 0
            ? "Alles im grünen Bereich"
            : `${compliance.criticalCount} kritisch · ${compliance.warningCount} Hinweise`}
        </Text>
        <Text maxFontSizeMultiplier={TEXT_MAX_SCALE} selectable style={{ color: palette.textMuted, ...TYPOGRAPHY.caption }}>
          Automatische Prüfung deiner Dienste. Die Hinweise ersetzen keine Rechtsberatung.
        </Text>
      </View>
      <ComplianceDetails compliance={compliance} shifts={window.complianceShifts} />
    </ScrollView>
  );
}
