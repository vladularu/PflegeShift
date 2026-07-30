import { ActivityIndicator, ScrollView, Text } from "react-native";

import { usePalette } from "@/theme/palette";

export function LoadingView({ label = "MediShift wird vorbereitet …" }: { label?: string }) {
  const palette = usePalette();
  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={{
        flexGrow: 1,
        alignItems: "center",
        justifyContent: "center",
        gap: 12,
        padding: 24,
        backgroundColor: palette.background,
      }}
    >
      <ActivityIndicator color={palette.primary} size="large" />
      <Text selectable style={{ color: palette.textMuted, fontSize: 14 }}>
        {label}
      </Text>
    </ScrollView>
  );
}
