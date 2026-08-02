import { ActivityIndicator, Pressable, ScrollView, Text } from "react-native";

import { usePalette } from "@/theme/palette";
import { TEXT_MAX_SCALE, TYPOGRAPHY } from "@/theme/typography";

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
      <Text accessibilityLiveRegion="polite" maxFontSizeMultiplier={TEXT_MAX_SCALE} selectable style={{ color: palette.textMuted, ...TYPOGRAPHY.body }}>
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
      <Text accessibilityRole="alert" maxFontSizeMultiplier={TEXT_MAX_SCALE} selectable style={{ color: palette.text, textAlign: "center", ...TYPOGRAPHY.screenTitle }}>
        Daten konnten nicht geladen werden
      </Text>
      <Text maxFontSizeMultiplier={TEXT_MAX_SCALE} selectable style={{ maxWidth: 320, color: palette.textMuted, textAlign: "center", ...TYPOGRAPHY.body }}>
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
        <Text maxFontSizeMultiplier={TEXT_MAX_SCALE} style={{ color: palette.onPrimary, ...TYPOGRAPHY.button }}>
          Erneut versuchen
        </Text>
      </Pressable>
    </ScrollView>
  );
}
