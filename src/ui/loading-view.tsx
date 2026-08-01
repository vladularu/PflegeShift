import { ActivityIndicator, Pressable, ScrollView, Text } from "react-native";

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
      <ActivityIndicator
        accessibilityLabel={label}
        accessibilityRole="progressbar"
        color={palette.primary}
        size="large"
      />
      <Text accessibilityLiveRegion="polite" selectable style={{ color: palette.textMuted, fontSize: 14 }}>
        {label}
      </Text>
    </ScrollView>
  );
}

export function LoadFailureView({
  message,
  onRetry,
}: {
  readonly message: string;
  readonly onRetry: () => void;
}) {
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
      <Text accessibilityRole="alert" selectable style={{ color: palette.text, fontSize: 18, fontWeight: "900", textAlign: "center" }}>
        Daten konnten nicht geladen werden
      </Text>
      <Text selectable style={{ maxWidth: 320, color: palette.textMuted, fontSize: 13, lineHeight: 19, textAlign: "center" }}>
        {message}
      </Text>
      <Pressable
        accessibilityRole="button"
        onPress={onRetry}
        style={({ pressed }) => ({
          minWidth: 140,
          minHeight: 48,
          alignItems: "center",
          justifyContent: "center",
          borderRadius: 15,
          borderCurve: "continuous",
          backgroundColor: palette.primary,
          opacity: pressed ? 0.72 : 1,
          paddingHorizontal: 18,
        })}
      >
        <Text style={{ color: palette.onPrimary, fontSize: 14, fontWeight: "900" }}>
          Erneut versuchen
        </Text>
      </Pressable>
    </ScrollView>
  );
}
