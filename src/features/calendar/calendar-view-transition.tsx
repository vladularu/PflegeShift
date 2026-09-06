import type { PropsWithChildren } from "react";
import type { LayoutChangeEvent, ViewStyle } from "react-native";
import Animated, {
  FadeIn,
  FadeOut,
  withTiming,
  type EntryExitAnimationFunction,
} from "react-native-reanimated";

import { MOTION } from "@/theme/motion";

export const CALENDAR_VIEW_ZOOM = {
  duration: 420,
  monthScale: 0.34,
  yearScale: 3.05,
  edgeOpacity: 0.08,
} as const;

export function calendarHeaderFadeIn() {
  return FadeIn.duration(MOTION.duration.scene)
    .easing(MOTION.easing.calm)
    .reduceMotion(MOTION.reduceMotion);
}

export function calendarHeaderFadeOut() {
  return FadeOut.duration(MOTION.duration.normal)
    .easing(MOTION.easing.calm)
    .reduceMotion(MOTION.reduceMotion);
}

function monthTransformOrigin(month: string): ViewStyle["transformOrigin"] {
  const index = Number(month.slice(5, 7)) - 1;
  const column = index % 3;
  const row = Math.floor(index / 3);
  return [`${((column + 0.5) / 3) * 100}%`, `${((row + 0.5) / 4) * 100}%`, 0];
}

export function calendarViewEntering(viewMode: "MONTH" | "YEAR"): EntryExitAnimationFunction {
  const edgeScale =
    viewMode === "MONTH" ? CALENDAR_VIEW_ZOOM.monthScale : CALENDAR_VIEW_ZOOM.yearScale;
  return () => ({
    initialValues: {
      opacity: CALENDAR_VIEW_ZOOM.edgeOpacity,
      transform: [{ scale: edgeScale }],
    },
    animations: {
      opacity: withTiming(1, {
        duration: CALENDAR_VIEW_ZOOM.duration,
        easing: MOTION.easing.calm,
        reduceMotion: MOTION.reduceMotion,
      }),
      transform: [
        {
          scale: withTiming(1, {
            duration: CALENDAR_VIEW_ZOOM.duration,
            easing: MOTION.easing.calm,
            reduceMotion: MOTION.reduceMotion,
          }),
        },
      ],
    },
  });
}

export function calendarViewExiting(viewMode: "MONTH" | "YEAR"): EntryExitAnimationFunction {
  const edgeScale =
    viewMode === "MONTH" ? CALENDAR_VIEW_ZOOM.monthScale : CALENDAR_VIEW_ZOOM.yearScale;
  return () => ({
    initialValues: { opacity: 1, transform: [{ scale: 1 }] },
    animations: {
      opacity: withTiming(CALENDAR_VIEW_ZOOM.edgeOpacity, {
        duration: CALENDAR_VIEW_ZOOM.duration,
        easing: MOTION.easing.calm,
        reduceMotion: MOTION.reduceMotion,
      }),
      transform: [
        {
          scale: withTiming(edgeScale, {
            duration: CALENDAR_VIEW_ZOOM.duration,
            easing: MOTION.easing.calm,
            reduceMotion: MOTION.reduceMotion,
          }),
        },
      ],
    },
  });
}

export function CalendarViewTransition({
  children,
  month,
  onLayout,
  testID,
  viewMode,
}: PropsWithChildren<{
  readonly month: string;
  readonly onLayout?: (event: LayoutChangeEvent) => void;
  readonly testID: string;
  readonly viewMode: "MONTH" | "YEAR";
}>) {
  return (
    <Animated.View
      entering={calendarViewEntering(viewMode)}
      exiting={calendarViewExiting(viewMode)}
      onLayout={onLayout}
      style={{ flex: 1, transformOrigin: monthTransformOrigin(month) }}
      testID={testID}
    >
      {children}
    </Animated.View>
  );
}
