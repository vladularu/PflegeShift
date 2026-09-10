import { useState, type PropsWithChildren } from "react";
import { StyleSheet, View } from "react-native";
import Animated, { useAnimatedStyle, withTiming } from "react-native-reanimated";

import { MOTION } from "@/theme/motion";

/**
 * Animate actual layout height, not a snapshot of the card's outer frame.
 * Siblings therefore follow the same layout on every frame. The measured child
 * stays mounted so reversing an unfinished transition never leaves exit ghosts.
 */
export function AnalysisCardDetails({
  children,
  expanded,
}: PropsWithChildren<{ readonly expanded: boolean }>) {
  const [contentHeight, setContentHeight] = useState(0);
  const animatedStyle = useAnimatedStyle(
    () => ({
      height: withTiming(expanded ? contentHeight : 0, {
        duration: MOTION.duration.deliberate,
        easing: MOTION.easing.calm,
        reduceMotion: MOTION.reduceMotion,
      }),
    }),
    [contentHeight, expanded],
  );

  return (
    <Animated.View
      accessibilityElementsHidden={!expanded}
      importantForAccessibility={expanded ? "auto" : "no-hide-descendants"}
      pointerEvents={expanded ? "auto" : "none"}
      style={[styles.viewport, animatedStyle]}
      testID="analysis-card-details"
    >
      <View
        collapsable={false}
        onLayout={({ nativeEvent }) => {
          const height = nativeEvent.layout.height;
          if (Number.isFinite(height) && height >= 0) setContentHeight(height);
        }}
        style={styles.content}
        testID="analysis-card-details-content"
      >
        {children}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  viewport: { overflow: "hidden" },
  content: { position: "absolute", top: 0, left: 0, right: 0 },
});
