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
      style={{ backgroundColor: palette.background }}
      contentContainerStyle={{ gap: 14, padding: 16, paddingBottom: 36 }}
    >
      <View style={{ gap: 4 }}>
        <Text selectable style={{ color: palette.textMuted, fontSize: 12, fontWeight: "700" }}>
          {formatMonthTitle(month)}
        </Text>
        <Text selectable style={{ color: palette.text, fontSize: 24, fontWeight: "900" }}>
          {compliance.criticalCount === 0 && compliance.warningCount === 0
            ? "Alles im grünen Bereich"
            : `${compliance.criticalCount} kritisch · ${compliance.warningCount} Hinweise`}
        </Text>
        <Text selectable style={{ color: palette.textMuted, fontSize: 12, lineHeight: 18 }}>
          Automatische Prüfung deiner Dienste. Die Hinweise ersetzen keine Rechtsberatung.
        </Text>
      </View>
      <ComplianceDetails compliance={compliance} shifts={window.complianceShifts} />
    </ScrollView>
  );
}
