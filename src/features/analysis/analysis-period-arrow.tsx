import Ionicons from "@expo/vector-icons/Ionicons";
import { Pressable } from "react-native";
import { usePalette } from "@/theme/palette";
import { MINIMUM_TOUCH_TARGET, RADII } from "@/theme/tokens";

export function PeriodArrow({
  accessibilityLabel,
  direction,
  onPress,
}: {
  readonly accessibilityLabel: string;
  readonly direction: "back" | "forward";
  readonly onPress: () => void;
}) {
  const palette = usePalette();
  const previous = direction === "back";
  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      hitSlop={8}
      onPress={onPress}
      style={({ pressed }) => ({
        width: MINIMUM_TOUCH_TARGET,
        height: MINIMUM_TOUCH_TARGET,
        alignItems: "center",
        justifyContent: "center",
        borderRadius: RADII.control,
        backgroundColor: pressed ? palette.primarySoft : "transparent",
        opacity: pressed ? 0.72 : 1,
      })}
    >
      <Ionicons
        color={palette.textSecondary}
        name={previous ? "chevron-back" : "chevron-forward"}
        size={20}
      />
    </Pressable>
  );
}
