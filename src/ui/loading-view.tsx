import { ActivityIndicator, Pressable, ScrollView, Text } from "react-native";

import { PRODUCT_NAME } from "@/brand";
import { usePalette } from "@/theme/palette";
import { TEXT_MAX_SCALE, TYPOGRAPHY } from "@/theme/typography";

export function LoadingView({ label = `${PRODUCT_NAME} wird vorbereitet …` }: { label?: string }) {
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
        accessible
        accessibilityLabel={label}
        accessibilityRole="progressbar"
        color={palette.primary}
        size="large"
      />
      <Text
        accessibilityLiveRegion="polite"
        maxFontSizeMultiplier={TEXT_MAX_SCALE}
        selectable
        style={{ color: palette.textMuted, ...TYPOGRAPHY.body }}
      >
        {label}
      </Text>
    </ScrollView>
  );
}

export function LoadFailureView({
  actionLabel = "Erneut versuchen",
  diagnosticCode,
  message,
  onRetry,
  title = "Daten konnten nicht geladen werden",
}: {
  readonly actionLabel?: string;
  readonly diagnosticCode?:
    | "APP_RENDER_FAILED"
    | "INVALID_EFFECTIVE_DATE"
    | "RULE_PACKAGE_AMBIGUOUS"
    | "RULE_PACKAGE_NOT_FOUND";
  readonly message: string;
  readonly onRetry: () => void;
  readonly title?: string;
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
      <Text
        accessibilityRole="alert"
        maxFontSizeMultiplier={TEXT_MAX_SCALE}
        selectable
        style={{ color: palette.text, textAlign: "center", ...TYPOGRAPHY.screenTitle }}
      >
        {title}
      </Text>
      <Text
        maxFontSizeMultiplier={TEXT_MAX_SCALE}
        selectable
        style={{ maxWidth: 320, color: palette.textMuted, textAlign: "center", ...TYPOGRAPHY.body }}
      >
        {message}
      </Text>
      {diagnosticCode ? (
        <Text
          maxFontSizeMultiplier={TEXT_MAX_SCALE}
          selectable
          style={{ color: palette.textMuted, textAlign: "center", ...TYPOGRAPHY.caption }}
        >
          Diagnosecode: {diagnosticCode}
        </Text>
      ) : null}
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
          backgroundColor: palette.accent,
          opacity: pressed ? 0.72 : 1,
          paddingHorizontal: 18,
        })}
      >
        <Text
          maxFontSizeMultiplier={TEXT_MAX_SCALE}
          style={{ color: palette.onAccent, ...TYPOGRAPHY.button }}
        >
          {actionLabel}
        </Text>
      </Pressable>
    </ScrollView>
  );
}
