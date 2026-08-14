import { useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { View } from "react-native";

import { AnalysisScreen } from "@/features/analysis/analysis-screen";
import { insightSectionFromRoute, type InsightSection } from "@/features/analysis/insight-section";
import { SalaryScreen } from "@/features/salary/salary-screen";
import { usePalette } from "@/theme/palette";
import { useThemeStatusBar } from "@/ui/use-theme-status-bar";
import { selectionFeedback } from "@/ui/haptics";
import { SPACING } from "@/theme/tokens";
import { SegmentedControl } from "@/ui/design-system";

const INSIGHT_SECTIONS = Object.freeze([
  Object.freeze({ value: "TIME", label: "Stunden" }),
  Object.freeze({ value: "PAY", label: "Gehalt" }),
]);

export function InsightsScreen() {
  const palette = usePalette();
  useThemeStatusBar();
  const params = useLocalSearchParams<{ section?: string | string[] }>();
  const requestedSection = insightSectionFromRoute(params.section);
  const [section, setSection] = useState<InsightSection>(requestedSection);

  useEffect(() => setSection(requestedSection), [requestedSection]);

  function changeSection(value: string) {
    const nextSection: InsightSection = value === "PAY" ? "PAY" : "TIME";
    setSection(nextSection);
    selectionFeedback();
  }

  return (
    <View style={{ flex: 1, backgroundColor: palette.groupedBackground }}>
      <View
        style={{
          zIndex: 1,
          paddingHorizontal: SPACING.lg,
          paddingTop: SPACING.md,
          paddingBottom: SPACING.sm,
          backgroundColor: palette.groupedBackground,
        }}
      >
        <SegmentedControl items={INSIGHT_SECTIONS} value={section} onChange={changeSection} />
      </View>
      <View style={{ flex: 1 }}>{section === "TIME" ? <AnalysisScreen /> : <SalaryScreen />}</View>
    </View>
  );
}
