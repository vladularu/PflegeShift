import Ionicons from "@expo/vector-icons/Ionicons";
import { Pressable, Text, View, useWindowDimensions } from "react-native";
import { usePalette } from "@/theme/palette";
import { TEXT_MAX_SCALE, TYPOGRAPHY } from "@/theme/typography";
import { CONTROL_HEIGHT, RADII, SPACING } from "@/theme/tokens";

export function SalaryValueRow({
  label,
  value,
  onPress,
  onLongPress,
  infoVisible = true,
  valueDescription,
  accessibilityLabel,
}: {
  readonly label: string;
  readonly value: string;
  readonly onPress?: () => void;
  readonly onLongPress?: () => void;
  readonly infoVisible?: boolean;
  readonly valueDescription?: string;
  readonly accessibilityLabel?: string;
}) {
  const palette = usePalette();
  const { fontScale } = useWindowDimensions();
  const stacked = fontScale >= 1.6;
  const content = (
    <>
      <Text
        maxFontSizeMultiplier={TEXT_MAX_SCALE}
        selectable
        style={{ color: palette.dark ? palette.text : palette.textMuted, ...TYPOGRAPHY.label }}
      >
        {label}
      </Text>
      <View style={{ flexDirection: "row", alignItems: "center", gap: SPACING.sm }}>
        <Text
          maxFontSizeMultiplier={TEXT_MAX_SCALE}
          selectable
          style={{ color: palette.text, ...TYPOGRAPHY.bodyStrong, fontVariant: ["tabular-nums"] }}
        >
          {value}
        </Text>
        {onPress && infoVisible ? (
          <Ionicons
            accessibilityElementsHidden
            color={palette.textMuted}
            name="ellipsis-horizontal-circle"
            size={17}
          />
        ) : null}
      </View>
    </>
  );

  if (!onPress) {
    return (
      <View
        style={{
          minHeight: CONTROL_HEIGHT.regular,
          flexDirection: stacked ? "column" : "row",
          alignItems: stacked ? "flex-start" : "center",
          justifyContent: "space-between",
          gap: SPACING.md,
          paddingVertical: stacked ? SPACING.sm : 0,
        }}
      >
        {content}
      </View>
    );
  }

  return (
    <Pressable
      accessibilityLabel={accessibilityLabel ?? `${label} ${value}, Erklärung öffnen`}
      accessibilityValue={{ text: valueDescription }}
      accessibilityRole="button"
      onPress={onPress}
      onLongPress={onLongPress}
      accessibilityHint={
        onLongPress
          ? "Gedrückt halten, um die Berechnungsgrundlage und Quellen zu öffnen."
          : undefined
      }
      accessibilityActions={
        onLongPress
          ? [{ name: "longpress", label: "Berechnungsgrundlage und Quellen öffnen" }]
          : undefined
      }
      onAccessibilityAction={({ nativeEvent }) => {
        if (nativeEvent.actionName === "longpress") onLongPress?.();
      }}
      style={({ pressed }) => ({
        minHeight: CONTROL_HEIGHT.regular,
        flexDirection: stacked ? "column" : "row",
        alignItems: stacked ? "flex-start" : "center",
        justifyContent: "space-between",
        gap: SPACING.md,
        borderRadius: RADII.control,
        backgroundColor: pressed ? palette.surfaceMuted : "transparent",
        opacity: pressed ? 0.72 : 1,
        paddingVertical: stacked ? SPACING.sm : 0,
      })}
    >
      {content}
    </Pressable>
  );
}
