import Ionicons from "@expo/vector-icons/Ionicons";
import { memo } from "react";
import { Pressable, Text, View } from "react-native";

import type { QuickEntryAction } from "@/features/calendar/quick-entry-actions";
import { usePalette } from "@/theme/palette";
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
  const isStampAction = action.kind === "TEMPLATE" || action.kind === "ABSENCE";
  const editorIcon = action.kind === "APPOINTMENT" ? "calendar-outline" : "add";
  const editorColor = action.kind === "APPOINTMENT" ? "#2F80ED" : palette.primary;

  return (
    <Pressable
      accessibilityLabel={`${action.label} auswählen`}
      accessibilityRole="button"
      accessibilityState={{ disabled, selected: active }}
      disabled={disabled}
      onPress={() => onPress(action)}
      style={({ pressed }) => ({
        width,
        minHeight: 58,
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
        numberOfLines={1}
        style={{
          maxWidth: 58,
          color: active ? palette.primary : palette.text,
          fontSize: 10,
          fontWeight: "800",
        }}
      >
        {action.label}
      </Text>
    </Pressable>
  );
});
