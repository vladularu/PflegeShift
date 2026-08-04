import Ionicons from "@expo/vector-icons/Ionicons";
import { Pressable, Text, View } from "react-native";

import { usePalette } from "@/theme/palette";
import { TEXT_MAX_SCALE, TYPOGRAPHY } from "@/theme/typography";
import { CONTROL_HEIGHT, RADII, SPACING } from "@/theme/tokens";

export function MonthNavigator({
  label,
  onPrevious,
  onNext,
}: {
  readonly label: string;
  readonly onPrevious: () => void;
  readonly onNext: () => void;
}) {
  const palette = usePalette();

  return (
    <View
      accessibilityRole="toolbar"
      style={{
        minHeight: CONTROL_HEIGHT.large,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        gap: SPACING.md,
      }}
    >
      <MonthArrow contextLabel={label} direction="back" onPress={onPrevious} />
      <Text
        accessibilityLiveRegion="polite"
        maxFontSizeMultiplier={TEXT_MAX_SCALE}
        selectable
        style={{
          flex: 1,
          color: palette.text,
          textAlign: "center",
          fontVariant: ["tabular-nums"],
          ...TYPOGRAPHY.screenTitle,
        }}
      >
        {label}
      </Text>
      <MonthArrow contextLabel={label} direction="forward" onPress={onNext} />
    </View>
  );
}

function MonthArrow({
  direction,
  contextLabel,
  onPress,
}: {
  readonly direction: "back" | "forward";
  readonly contextLabel: string;
  readonly onPress: () => void;
}) {
  const palette = usePalette();
  const previous = direction === "back";

  return (
    <Pressable
      accessibilityLabel={`${previous ? "Vorheriger" : "Nächster"} Monat, aktuell ${contextLabel}`}
      accessibilityRole="button"
      hitSlop={6}
      onPress={onPress}
      style={({ pressed }) => ({
        width: CONTROL_HEIGHT.compact,
        height: CONTROL_HEIGHT.compact,
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
