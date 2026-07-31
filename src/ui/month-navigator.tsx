import Ionicons from "@expo/vector-icons/Ionicons";
import { Pressable, Text, View } from "react-native";

import { usePalette } from "@/theme/palette";

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
        minHeight: 52,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
      }}
    >
      <MonthArrow direction="back" onPress={onPrevious} />
      <Text
        selectable
        adjustsFontSizeToFit
        minimumFontScale={0.78}
        numberOfLines={1}
        style={{
          flex: 1,
          color: palette.text,
          fontSize: 21,
          fontWeight: "800",
          textAlign: "center",
          fontVariant: ["tabular-nums"],
        }}
      >
        {label}
      </Text>
      <MonthArrow direction="forward" onPress={onNext} />
    </View>
  );
}

function MonthArrow({
  direction,
  onPress,
}: {
  readonly direction: "back" | "forward";
  readonly onPress: () => void;
}) {
  const palette = usePalette();
  const previous = direction === "back";

  return (
    <Pressable
      accessibilityLabel={previous ? "Vorheriger Monat" : "Nächster Monat"}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => ({
        width: 46,
        height: 46,
        alignItems: "center",
        justifyContent: "center",
        borderRadius: 23,
        borderWidth: 1,
        borderColor: palette.border,
        backgroundColor: pressed ? palette.surfaceMuted : palette.surface,
        opacity: pressed ? 0.72 : 1,
      })}
    >
      <Ionicons
        color={palette.text}
        name={previous ? "chevron-back" : "chevron-forward"}
        size={21}
      />
    </Pressable>
  );
}
