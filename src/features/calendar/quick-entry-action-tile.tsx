import Ionicons from "@expo/vector-icons/Ionicons";
import { memo } from "react";
import { Pressable, Text, View, useWindowDimensions } from "react-native";

import type { QuickEntryAction } from "@/features/calendar/quick-entry-actions";
import { APPOINTMENT_COLOR, usePalette } from "@/theme/palette";
import { TEXT_MAX_SCALE } from "@/theme/typography";
import { ColorBadge } from "@/ui/design-system";

export const QuickEntryActionTile = memo(function QuickEntryActionTile({
  action,
  active = false,
  disabled = false,
  onPress,
  width = 62,
}: {
  readonly action: QuickEntryAction;
  readonly active?: boolean;
  readonly disabled?: boolean;
  readonly onPress: (action: QuickEntryAction) => void;
  readonly width?: number;
}) {
  const palette = usePalette();
  const { fontScale } = useWindowDimensions();
  const tileHeight = 58 + Math.max(0, fontScale - 1) * 28;
  const isStampAction = action.kind === "TEMPLATE";
  const editorIcon = action.kind === "APPOINTMENT" ? "calendar-outline" : "add";
  const editorColor = action.kind === "APPOINTMENT" ? APPOINTMENT_COLOR : palette.primary;

  return (
    <Pressable
      accessibilityLabel={`${action.label} auswählen`}
      accessibilityRole="button"
      accessibilityState={{ disabled, selected: active }}
      disabled={disabled}
      onPress={() => onPress(action)}
      style={({ pressed }) => ({
        width,
        minHeight: tileHeight,
        alignItems: "center",
        justifyContent: "center",
        gap: 3,
        borderWidth: active ? 1.5 : 0,
        borderColor: palette.primary,
        borderRadius: 15,
        borderCurve: "continuous",
        backgroundColor: active ? palette.primarySoft : "transparent",
        opacity: disabled ? 0.38 : pressed ? 0.58 : 1,
      })}
    >
      {isStampAction ? (
        <ColorBadge color={action.color} label={action.symbol} size={28} />
      ) : (
        <View
          style={{
            width: 28,
            height: 28,
            borderRadius: 14,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: editorColor,
          }}
        >
          <Ionicons color={palette.onPrimary} name={editorIcon} size={16} />
        </View>
      )}
      <Text
        maxFontSizeMultiplier={TEXT_MAX_SCALE}
        style={{
          maxWidth: width - 6,
          color: active ? palette.primary : palette.text,
          fontSize: 11,
          fontWeight: "600",
          textAlign: "center",
        }}
      >
        {action.label}
      </Text>
    </Pressable>
  );
});
