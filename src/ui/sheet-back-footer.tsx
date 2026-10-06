import Ionicons from "@expo/vector-icons/Ionicons";
import { Pressable, Text } from "react-native";

import { usePalette } from "@/theme/palette";
import { TEXT_MAX_SCALE, TYPOGRAPHY } from "@/theme/typography";
import { RADII, SPACING } from "@/theme/tokens";

export function SheetBackFooter({
  disabled = false,
  label = "Zurück",
  onPress,
}: {
  readonly disabled?: boolean;
  readonly label?: string;
  readonly onPress: () => void;
}) {
  const palette = usePalette();
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: 48,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: SPACING.sm,
        ...(label !== "Zurück"
          ? { paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm }
          : {}),
        borderRadius: RADII.control,
        borderWidth: 1,
        borderColor: palette.separator,
        backgroundColor: palette.surface,
        opacity: disabled ? 0.45 : pressed ? 0.68 : 1,
      })}
    >
      <Ionicons accessibilityElementsHidden name="arrow-back" size={18} color={palette.text} />
      <Text
        maxFontSizeMultiplier={TEXT_MAX_SCALE}
        style={{
          color: palette.text,
          ...TYPOGRAPHY.bodyStrong,
          flexShrink: 1,
          textAlign: "center",
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}
