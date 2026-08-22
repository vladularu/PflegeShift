import { Stack, useLocalSearchParams } from "expo-router";
import { View } from "react-native";

import { AnalysisScreen } from "@/features/analysis/analysis-screen";
import { insightSectionFromRoute } from "@/features/analysis/insight-section";
import { usePalette } from "@/theme/palette";
import { useThemeStatusBar } from "@/ui/use-theme-status-bar";

export function InsightsScreen() {
  const palette = usePalette();
  useThemeStatusBar();
  const params = useLocalSearchParams<{ section?: string | string[] }>();
  const requestedSection = insightSectionFromRoute(params.section);

  return (
    <View style={{ flex: 1, backgroundColor: palette.groupedBackground }}>
      <Stack.Screen
        options={{
          headerShown: false,
          title: "Auswertung",
        }}
      />
      <AnalysisScreen initialExpandedCard={requestedSection === "PAY" ? "PAY" : null} />
    </View>
  );
}
