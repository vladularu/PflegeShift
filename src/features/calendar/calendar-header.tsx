import Ionicons from "@expo/vector-icons/Ionicons";
import { memo } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import Animated, {
  Extrapolation,
  FadeInDown,
  FadeInUp,
  FadeOutDown,
  FadeOutUp,
  interpolate,
  useAnimatedStyle,
  type SharedValue,
} from "react-native-reanimated";

import type { CalendarViewMode } from "@/domain/types";
import { formatMonthTitle } from "@/engine/calendar";
import {
  calendarHeaderFadeIn,
  calendarHeaderFadeOut,
} from "@/features/calendar/calendar-view-transition";
import { usePalette } from "@/theme/palette";
import { MOTION } from "@/theme/motion";
import { CONTROL_HEIGHT, RADII } from "@/theme/tokens";
import { TabScreenHeader } from "@/ui/screen-layout";

function HeaderIconButton({
  label,
  name,
  onPress,
}: {
  readonly label: string;
  readonly name: "calendar-number-outline" | "options-outline" | "chevron-back" | "chevron-forward";
  readonly onPress: () => void;
}) {
  const palette = usePalette();
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      hitSlop={2}
      onPress={onPress}
      style={({ pressed }) => [styles.action, pressed && { backgroundColor: palette.surfaceMuted }]}
    >
      <Ionicons accessible={false} color={palette.text} name={name} size={22} />
    </Pressable>
  );
}

export const CalendarHeader = memo(function CalendarHeader({
  month,
  referenceMonth,
  viewMode,
  onOpenYear,
  onOpenDisplay,
  onMoveYear,
  plannerActive,
  plannerTransition,
  direction = "NEXT",
  transition = "SPATIAL",
}: {
  readonly month: string;
  readonly referenceMonth: string;
  readonly viewMode: CalendarViewMode;
  readonly onOpenYear: () => void;
  readonly onOpenDisplay: () => void;
  readonly onMoveYear: (amount: number) => void;
  readonly plannerActive: boolean;
  readonly plannerTransition: SharedValue<number>;
  readonly direction?: "NEXT" | "PREVIOUS";
  readonly transition?: "SPATIAL" | "CROSSFADE";
}) {
  const palette = usePalette();
  const year = month.slice(0, 4);
  const monthName = formatMonthTitle(month).replace(/\s+\d{4}$/, "");
  const title =
    viewMode === "YEAR"
      ? year
      : year === referenceMonth.slice(0, 4)
        ? monthName
        : formatMonthTitle(month);
  const titleEntering =
    transition === "CROSSFADE"
      ? calendarHeaderFadeIn()
      : (direction === "NEXT" ? FadeInDown : FadeInUp)
          .duration(MOTION.duration.normal)
          .easing(MOTION.easing.calm)
          .withInitialValues({
            translateY: direction === "NEXT" ? MOTION.distance.small : -MOTION.distance.small,
          })
          .reduceMotion(MOTION.reduceMotion);
  const titleExiting =
    transition === "CROSSFADE"
      ? calendarHeaderFadeOut()
      : (direction === "NEXT" ? FadeOutUp : FadeOutDown)
          .duration(MOTION.duration.normal)
          .easing(MOTION.easing.calm)
          .withTargetValues({
            translateY: direction === "NEXT" ? -MOTION.distance.small : MOTION.distance.small,
          })
          .reduceMotion(MOTION.reduceMotion);
  const actionGroupMotionStyle = useAnimatedStyle(() => ({
    opacity: interpolate(plannerTransition.value, [0, 0.5], [1, 0], Extrapolation.CLAMP),
  }));

  return (
    <TabScreenHeader
      accessory={
        <Animated.View
          accessibilityElementsHidden={plannerActive}
          accessibilityRole="toolbar"
          importantForAccessibility={plannerActive ? "no-hide-descendants" : "auto"}
          pointerEvents={plannerActive ? "none" : "auto"}
          style={[
            styles.actionGroup,
            {
              borderColor: palette.separator,
              backgroundColor: palette.surfaceRaised,
              boxShadow: palette.dark ? undefined : `0 5px 18px ${palette.shadow}`,
            },
            actionGroupMotionStyle,
          ]}
          testID="calendar-header-actions"
        >
          <Animated.View
            key={viewMode}
            entering={calendarHeaderFadeIn()}
            exiting={calendarHeaderFadeOut()}
            style={styles.modeActions}
            testID="calendar-header-mode-actions"
          >
            {viewMode === "MONTH" ? (
              <>
                <HeaderIconButton
                  label={`${year}, Jahresansicht öffnen`}
                  name="calendar-number-outline"
                  onPress={onOpenYear}
                />
                <View style={[styles.separator, { backgroundColor: palette.separator }]} />
                <HeaderIconButton
                  label="Kalenderdarstellung öffnen"
                  name="options-outline"
                  onPress={onOpenDisplay}
                />
              </>
            ) : (
              <>
                <HeaderIconButton
                  label="Vorheriges Jahr"
                  name="chevron-back"
                  onPress={() => onMoveYear(-1)}
                />
                <View style={[styles.separator, { backgroundColor: palette.separator }]} />
                <HeaderIconButton
                  label="Nächstes Jahr"
                  name="chevron-forward"
                  onPress={() => onMoveYear(1)}
                />
              </>
            )}
          </Animated.View>
        </Animated.View>
      }
      title={title}
      titleColor={viewMode === "YEAR" ? palette.primary : undefined}
      titleEntering={titleEntering}
      titleExiting={titleExiting}
      titleKey={`${viewMode}-${title}`}
    />
  );
});

const styles = StyleSheet.create({
  actionGroup: {
    minHeight: CONTROL_HEIGHT.compact,
    flexDirection: "row",
    alignItems: "center",
    overflow: "hidden",
    borderWidth: 1,
    borderRadius: RADII.pill,
    borderCurve: "continuous",
  },
  action: {
    width: CONTROL_HEIGHT.compact,
    height: CONTROL_HEIGHT.compact,
    alignItems: "center",
    justifyContent: "center",
  },
  modeActions: {
    flexDirection: "row",
    alignItems: "center",
  },
  separator: {
    width: StyleSheet.hairlineWidth,
    height: 24,
  },
});
