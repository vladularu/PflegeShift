import Ionicons from "@expo/vector-icons/Ionicons";
import { memo } from "react";
import { StyleSheet, Text, View } from "react-native";

import type { QuickEntryAction } from "@/features/calendar/quick-entry-actions";
import {
  QUICK_PLANNER_COLORS,
  QUICK_PLANNER_METRICS,
} from "@/features/calendar/quick-planner-appearance";
import { APPOINTMENT_COLOR, usePalette } from "@/theme/palette";
import { TEXT_MAX_SCALE } from "@/theme/typography";
import { ColorBadge } from "@/ui/design-system";
import { AnimatedPressable, usePressMotion } from "@/ui/press-motion";

export const QuickEntryActionTile = memo(function QuickEntryActionTile({
  action,
  active = false,
  disabled = false,
  onPress,
  width = 72,
}: {
  readonly action: QuickEntryAction;
  readonly active?: boolean;
  readonly disabled?: boolean;
  readonly onPress: (action: QuickEntryAction) => void;
  readonly width?: number;
}) {
  const palette = usePalette();
  const isStampAction = action.kind === "TEMPLATE";
  const editorIcon = action.kind === "APPOINTMENT" ? "calendar-outline" : "add";
  const editorColor =
    action.kind === "APPOINTMENT" ? APPOINTMENT_COLOR : QUICK_PLANNER_COLORS.active;
  const pressMotion = usePressMotion(1, 0.95);

  return (
    <AnimatedPressable
      accessibilityLabel={`${action.label} auswählen`}
      accessibilityRole="button"
      accessibilityState={{ disabled, selected: active }}
      disabled={disabled}
      onPress={() => onPress(action)}
      onPressIn={pressMotion.onPressIn}
      onPressOut={pressMotion.onPressOut}
      style={[styles.tile, { width }, pressMotion.animatedStyle]}
    >
      <View
        style={[styles.badgeRing, active && styles.badgeRingActive]}
        testID={`quick-planner-badge-${action.key}`}
      >
        {isStampAction ? (
          <ColorBadge
            color={action.color}
            label={action.symbol}
            size={QUICK_PLANNER_METRICS.badgeSize}
          />
        ) : (
          <View style={[styles.editorBadge, { backgroundColor: editorColor }]}>
            <Ionicons
              accessible={false}
              color={QUICK_PLANNER_COLORS.onColor}
              name={editorIcon}
              size={16}
            />
          </View>
        )}
      </View>
      <Text
        maxFontSizeMultiplier={TEXT_MAX_SCALE}
        style={[
          styles.label,
          {
            color: active ? QUICK_PLANNER_COLORS.active : palette.onFloatingAction,
            maxWidth: width - 6,
          },
          active && styles.labelActive,
        ]}
      >
        {action.label}
      </Text>
    </AnimatedPressable>
  );
});

const styles = StyleSheet.create({
  tile: {
    minHeight: QUICK_PLANNER_METRICS.tileHeight,
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
  },
  badgeRing: {
    width: QUICK_PLANNER_METRICS.badgeRingSize,
    height: QUICK_PLANNER_METRICS.badgeRingSize,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "transparent",
    borderRadius: QUICK_PLANNER_METRICS.badgeRingSize / 2,
  },
  badgeRingActive: {
    borderColor: QUICK_PLANNER_COLORS.active,
  },
  editorBadge: {
    width: QUICK_PLANNER_METRICS.badgeSize,
    height: QUICK_PLANNER_METRICS.badgeSize,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: QUICK_PLANNER_METRICS.badgeSize / 2,
  },
  label: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: "500",
    textAlign: "center",
  },
  labelActive: {
    color: QUICK_PLANNER_COLORS.active,
    fontWeight: "600",
  },
});
