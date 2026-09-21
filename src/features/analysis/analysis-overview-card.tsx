import { Ionicons } from "@expo/vector-icons";
import type { PropsWithChildren } from "react";
import { Pressable, Text, View } from "react-native";
import { usePalette } from "@/theme/palette";
import { MINIMUM_TOUCH_TARGET, RADII, SPACING } from "@/theme/tokens";
import { TEXT_MAX_SCALE, TYPOGRAPHY } from "@/theme/typography";
import { selectionFeedback } from "@/ui/haptics";

export function OverviewCard({
  title,
  hint = "Öffnet die Details für diesen Monat",
  value,
  caption,
  valueLabel,
  color,
  icon,
  onPress,
  children,
}: PropsWithChildren<{
  readonly title: string;
  readonly hint?: string;
  readonly value: string;
  readonly caption: string;
  readonly color: string;
  readonly icon: React.ComponentProps<typeof Ionicons>["name"];
  readonly onPress: () => void;
  readonly valueLabel?: string;
}>) {
  const palette = usePalette();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${title}, ${value}`}
      accessibilityHint={hint}
      onPress={() => {
        selectionFeedback();
        onPress();
      }}
      style={({ pressed }) => ({
        minHeight: MINIMUM_TOUCH_TARGET,
        padding: SPACING.xl,
        borderRadius: RADII.card,
        borderCurve: "continuous",
        borderWidth: 1,
        borderColor: palette.separator,
        backgroundColor: palette.surface,
        opacity: pressed ? 0.75 : 1,
        gap: SPACING.md,
      })}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: SPACING.sm }}>
        <Ionicons name={icon} size={22} color={color} accessibilityElementsHidden />
        <Text
          maxFontSizeMultiplier={TEXT_MAX_SCALE}
          style={{ flex: 1, color: palette.text, ...TYPOGRAPHY.bodyStrong }}
        >
          {title}
        </Text>
        <Ionicons
          name="chevron-forward"
          size={18}
          color={palette.textMuted}
          accessibilityElementsHidden
        />
      </View>
      <Text
        accessibilityLabel={valueLabel}
        maxFontSizeMultiplier={TEXT_MAX_SCALE}
        style={{ color: palette.text, ...TYPOGRAPHY.screenTitle, fontVariant: ["tabular-nums"] }}
      >
        {value}
      </Text>
      {children}
      <Text
        maxFontSizeMultiplier={TEXT_MAX_SCALE}
        style={{ color: palette.textMuted, ...TYPOGRAPHY.caption }}
      >
        {caption}
      </Text>
    </Pressable>
  );
}
