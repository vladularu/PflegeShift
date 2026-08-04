import { router, useLocalSearchParams } from "expo-router";
import { useMemo } from "react";
import { ScrollView, Text, View } from "react-native";

import {
  useMediShiftEntries,
  useMediShiftProfile,
  useMediShiftStatus,
} from "@/application/medishift-provider";
import { currentMonth, formatMonthTitle } from "@/engine/calendar";
import { selectAnalysisEntryWindow } from "@/features/analysis/analysis-data";
import { ComplianceDetails } from "@/features/analysis/analysis-screen";
import { useDeferredMonthlyCompliance } from "@/features/analysis/use-monthly-compliance";
import { parseMonthRouteParam, type RouteParam } from "@/navigation/route-params";
import { usePalette } from "@/theme/palette";
import { TEXT_MAX_SCALE, TYPOGRAPHY } from "@/theme/typography";
import { SPACING } from "@/theme/tokens";
import { LoadFailureView, LoadingView } from "@/ui/loading-view";

export function ComplianceDetailsScreen() {
  const palette = usePalette();
  const params = useLocalSearchParams<{ month?: RouteParam }>();
  const { error, ready, reload } = useMediShiftStatus();
  const { profile } = useMediShiftProfile();
  const { entries } = useMediShiftEntries();
  const parsedMonth = parseMonthRouteParam(params.month);
  const month =
    parsedMonth.status === "valid" ? parsedMonth.value : currentMonth(profile?.timeZone);
  const window = useMemo(() => selectAnalysisEntryWindow(entries, month), [entries, month]);
  const monthlyCompliance = useDeferredMonthlyCompliance({
    enabled: true,
    month,
    profile,
    shifts: window.complianceShifts,
  });
  const compliance = monthlyCompliance.result;

  if (parsedMonth.status !== "valid") {
    return (
      <LoadFailureView
        actionLabel="Schließen"
        message="Der Link zur Arbeitszeitprüfung enthält keinen gültigen Monat."
        onRetry={() => router.back()}
        title="Arbeitszeitprüfung kann nicht geöffnet werden"
      />
    );
  }
  if (ready && error) {
    return <LoadFailureView message={error} onRetry={() => void reload()} />;
  }
  if (monthlyCompliance.error) {
    return (
      <LoadFailureView
        message={monthlyCompliance.error}
        onRetry={monthlyCompliance.retry}
        title="Arbeitszeitprüfung fehlgeschlagen"
      />
    );
  }
  if (!ready || profile === null || compliance === null) return <LoadingView />;

  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      style={{ backgroundColor: palette.groupedBackground }}
      contentContainerStyle={{ gap: SPACING.lg, padding: SPACING.lg, paddingBottom: 36 }}
    >
      <View style={{ gap: SPACING.xxs }}>
        <Text
          maxFontSizeMultiplier={TEXT_MAX_SCALE}
          selectable
          style={{ color: palette.textMuted, ...TYPOGRAPHY.label }}
        >
          {formatMonthTitle(month)}
        </Text>
        <Text
          maxFontSizeMultiplier={TEXT_MAX_SCALE}
          selectable
          style={{ color: palette.text, ...TYPOGRAPHY.screenTitle }}
        >
          {compliance.criticalCount === 0 && compliance.warningCount === 0
            ? "Alles im grünen Bereich"
            : `${compliance.criticalCount} kritisch · ${compliance.warningCount} Hinweise`}
        </Text>
        <Text
          maxFontSizeMultiplier={TEXT_MAX_SCALE}
          selectable
          style={{ color: palette.textMuted, ...TYPOGRAPHY.caption }}
        >
          Automatische Prüfung deiner Dienste. Die Hinweise ersetzen keine Rechtsberatung.
        </Text>
      </View>
      <ComplianceDetails compliance={compliance} shifts={window.complianceShifts} />
    </ScrollView>
  );
}
