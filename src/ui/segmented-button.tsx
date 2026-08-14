import { Text } from "react-native";
import type { PressableStateCallbackType } from "react-native";

import { usePalette } from "@/theme/palette";
import { TEXT_MAX_SCALE, TYPOGRAPHY } from "@/theme/typography";
import { CONTROL_HEIGHT, RADII } from "@/theme/tokens";
import { AnimatedPressable, usePressMotion } from "@/ui/press-motion";

export function SegmentedButton({
  label,
  selected,
  onPress,
}: {
  readonly label: string;
  readonly selected: boolean;
  readonly onPress: () => void;
}) {
  const palette = usePalette();
  const pressMotion = usePressMotion(selected ? 1.01 : 1);
  return (
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPressIn={pressMotion.onPressIn}
      onPressOut={pressMotion.onPressOut}
      onPress={onPress}
      style={({ pressed }: PressableStateCallbackType) => [
        {
          minHeight: CONTROL_HEIGHT.compact,
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          borderWidth: selected ? 1 : 0,
          borderColor: palette.primary,
          borderRadius: RADII.control,
          borderCurve: "continuous",
          backgroundColor: selected ? palette.primarySoft : "transparent",
          opacity: pressed ? 0.78 : 1,
        },
        pressMotion.animatedStyle,
      ]}
    >
      <Text
        maxFontSizeMultiplier={TEXT_MAX_SCALE}
        style={{ color: selected ? palette.primary : palette.textSecondary, ...TYPOGRAPHY.label }}
      >
        {label}
      </Text>
    </AnimatedPressable>
  );
}
