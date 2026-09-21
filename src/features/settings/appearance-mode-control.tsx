import Ionicons from "@expo/vector-icons/Ionicons";
import { Pressable, Text, View, useWindowDimensions } from "react-native";
import type { AppearanceMode } from "@/domain/appearance";
import { usePalette } from "@/theme/palette";
import { CONTROL_HEIGHT, RADII, SPACING } from "@/theme/tokens";
import { TEXT_MAX_SCALE, TYPOGRAPHY } from "@/theme/typography";
import { selectionFeedback } from "@/ui/haptics";

const MODES = [
  { id: "light", label: "Hell", icon: "sunny-outline", selectedIcon: "sunny" },
  { id: "dark", label: "Dunkel", icon: "moon-outline", selectedIcon: "moon" },
  { id: "system", label: "System", icon: "phone-portrait-outline", selectedIcon: "phone-portrait" },
] as const;

export function AppearanceModeControl({
  value,
  onChange,
}: {
  readonly value: AppearanceMode;
  readonly onChange: (mode: AppearanceMode) => void;
}) {
  const palette = usePalette();
  const { width, fontScale } = useWindowDimensions();
  const stacked = width < 360 || fontScale > 1.2;
  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel="Erscheinungsbild"
      style={{
        flexDirection: stacked ? "column" : "row",
        gap: SPACING.xxs,
        padding: SPACING.xxs,
        borderRadius: RADII.control + SPACING.xxs,
        borderCurve: "continuous",
        backgroundColor: palette.surfaceMuted,
      }}
    >
      {MODES.map((mode) => {
        const selected = value === mode.id;
        return (
          <Pressable
            key={mode.id}
            accessibilityRole="radio"
            accessibilityLabel={mode.label}
            accessibilityState={{ checked: selected }}
            accessibilityHint={
              mode.id === "system" ? "Folgt der Darstellung deines Geräts" : undefined
            }
            onPress={() => {
              if (selected) return;
              selectionFeedback();
              onChange(mode.id);
            }}
            style={({ pressed }) => ({
              minHeight: CONTROL_HEIGHT.regular,
              flexGrow: 1,
              flexBasis: stacked ? "auto" : 0,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              gap: SPACING.xs,
              paddingHorizontal: SPACING.sm,
              paddingVertical: SPACING.sm,
              borderRadius: RADII.control,
              borderCurve: "continuous",
              borderWidth: 1,
              borderColor: selected ? palette.separator : "transparent",
              backgroundColor: selected ? palette.surfaceRaised : "transparent",
              opacity: pressed ? 0.72 : 1,
            })}
          >
            <Ionicons
              name={selected ? mode.selectedIcon : mode.icon}
              size={18}
              color={selected ? palette.primary : palette.textMuted}
              accessible={false}
            />
            <Text
              maxFontSizeMultiplier={TEXT_MAX_SCALE}
              style={{
                flexShrink: 1,
                color: selected ? palette.text : palette.textMuted,
                ...(selected ? TYPOGRAPHY.bodyStrong : TYPOGRAPHY.body),
              }}
            >
              {mode.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
