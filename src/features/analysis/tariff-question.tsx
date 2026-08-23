import Ionicons from "@expo/vector-icons/Ionicons";
import { Pressable, Text, View, useWindowDimensions } from "react-native";

import { usePalette } from "@/theme/palette";
import { TEXT_MAX_SCALE, TYPOGRAPHY } from "@/theme/typography";
import { CONTROL_HEIGHT, RADII, SCREEN_LAYOUT, SPACING } from "@/theme/tokens";
import { selectionFeedback } from "@/ui/haptics";

export function TariffQuestion({
  title,
  caption,
  options,
  value,
  onChange,
}: {
  readonly title: string;
  readonly caption: string;
  readonly options: readonly { readonly value: string; readonly label: string }[];
  readonly value: string;
  readonly onChange: (value: string) => void;
}) {
  const palette = usePalette();
  const { fontScale } = useWindowDimensions();
  const stacked = fontScale >= SCREEN_LAYOUT.headerAccessoryStackFontScale;

  return (
    <View style={{ gap: SPACING.md }}>
      <View style={{ gap: SPACING.xxs }}>
        <Text
          maxFontSizeMultiplier={TEXT_MAX_SCALE}
          selectable
          style={{ color: palette.text, ...TYPOGRAPHY.bodyStrong }}
        >
          {title}
        </Text>
        <Text
          maxFontSizeMultiplier={TEXT_MAX_SCALE}
          selectable
          style={{ color: palette.textMuted, ...TYPOGRAPHY.caption }}
        >
          {caption}
        </Text>
      </View>
      <View
        accessibilityLabel={title}
        accessibilityRole="radiogroup"
        style={{ flexDirection: stacked ? "column" : "row", gap: SPACING.sm }}
      >
        {options.map((option) => {
          const selected = option.value === value;
          return (
            <Pressable
              key={option.value}
              accessibilityLabel={`${title}: ${option.label}`}
              accessibilityRole="radio"
              accessibilityState={{ checked: selected }}
              onPress={() => {
                onChange(option.value);
                selectionFeedback();
              }}
              style={({ pressed }) => ({
                minHeight: CONTROL_HEIGHT.compact,
                flex: stacked ? undefined : 1,
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "center",
                gap: SPACING.xxs,
                borderWidth: 1,
                borderColor: selected ? palette.primary : palette.border,
                borderRadius: RADII.control,
                borderCurve: "continuous",
                backgroundColor: selected ? palette.primarySoft : palette.surface,
                opacity: pressed ? 0.72 : 1,
                paddingHorizontal: SPACING.sm,
              })}
            >
              <Ionicons
                accessibilityElementsHidden
                color={selected ? palette.primary : palette.textMuted}
                name={selected ? "checkmark-circle" : "ellipse-outline"}
                size={16}
              />
              <Text
                maxFontSizeMultiplier={TEXT_MAX_SCALE}
                style={{
                  color: selected ? palette.primary : palette.textSecondary,
                  ...TYPOGRAPHY.label,
                  textAlign: "center",
                }}
              >
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
