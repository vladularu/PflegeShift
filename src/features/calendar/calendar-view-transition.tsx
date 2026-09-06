import type { PropsWithChildren } from "react";
import type { LayoutChangeEvent } from "react-native";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";

import { MOTION } from "@/theme/motion";

export function CalendarViewTransition({
  children,
  onLayout,
  testID,
}: PropsWithChildren<{
  readonly onLayout?: (event: LayoutChangeEvent) => void;
  readonly testID: string;
}>) {
  return (
    <Animated.View
      entering={FadeIn.duration(MOTION.duration.deliberate)
        .easing(MOTION.easing.calm)
        .reduceMotion(MOTION.reduceMotion)}
      exiting={FadeOut.duration(MOTION.duration.deliberate)
        .easing(MOTION.easing.calm)
        .reduceMotion(MOTION.reduceMotion)}
      onLayout={onLayout}
      style={{ flex: 1 }}
      testID={testID}
    >
      {children}
    </Animated.View>
  );
}
