import Ionicons from "@expo/vector-icons/Ionicons";
import { memo, useCallback, useEffect, useState } from "react";
import { Platform, StyleSheet, View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { FullWindowOverlay } from "react-native-screens";
import Animated, {
  Extrapolation,
  FadeIn,
  cancelAnimation,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";

import {
  calculateCalendarBottomLayout,
  calculateQuickPlannerLayout,
} from "@/features/calendar/calendar-layout";
import type { QuickEntryAction } from "@/features/calendar/quick-entry-actions";
import { QuickEntryActionStrip } from "@/features/calendar/quick-entry-action-strip";
import { QUICK_PLANNER_METRICS } from "@/features/calendar/quick-planner-appearance";
import { MOTION } from "@/theme/motion";
import { DARK_PALETTE, LIGHT_PALETTE, usePalette } from "@/theme/palette";
import { CALENDAR_METRICS } from "@/theme/tokens";
import { AnimatedPressable, usePressMotion } from "@/ui/press-motion";

const CONTROL_SIDE_INSET = 8;
const CLOSED_SCREEN_RIGHT = 22;
const IOS_NATIVE_TAB_OVERLAY_CLEARANCE = 17;
const IOS_NATIVE_TAB_OVERLAY_DROP = 42;
const CLOSE_INNER_INSET =
  (QUICK_PLANNER_METRICS.closeTargetSize - QUICK_PLANNER_METRICS.closeVisualSize) / 2;
const CLOSE_TARGET_GAP = QUICK_PLANNER_METRICS.closeVisualGap - CLOSE_INNER_INSET;
const CONTROL_HEIGHT =
  QUICK_PLANNER_METRICS.closeTargetSize + CLOSE_TARGET_GAP + QUICK_PLANNER_METRICS.dockHeight;
const CLOSE_TARGET_BOTTOM = QUICK_PLANNER_METRICS.dockHeight + CLOSE_TARGET_GAP;
const CLOSED_TARGET_SIZE = Math.max(44, CALENDAR_METRICS.floatingActionSize + 8);
const CLOSED_TARGET_INSET = (CLOSED_TARGET_SIZE - CALENDAR_METRICS.floatingActionSize) / 2;
const CLOSED_TARGET_RIGHT = CLOSED_SCREEN_RIGHT - CONTROL_SIDE_INSET - CLOSED_TARGET_INSET;

export function quickPlannerTransitionDuration(open: boolean, reduceMotion: boolean): number {
  if (reduceMotion) return MOTION.duration.instant;
  return open ? MOTION.duration.scene : MOTION.duration.deliberate;
}

export const QuickPlannerDock = memo(function QuickPlannerDock({
  actions,
  activeKey,
  busy,
  open,
  transitionProgress,
  onOpen,
  onSelectAction,
  onClose,
}: {
  readonly actions: readonly QuickEntryAction[];
  readonly activeKey: string | null;
  readonly busy: boolean;
  readonly open: boolean;
  readonly transitionProgress?: SharedValue<number>;
  readonly onOpen: () => void;
  readonly onSelectAction: (action: QuickEntryAction) => void;
  readonly onClose: () => void;
}) {
  const palette = usePalette();
  const dockPalette = palette.dark ? LIGHT_PALETTE : DARK_PALETTE;
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const reduceMotion = useReducedMotion();
  const [closing, setClosing] = useState(false);
  const internalProgress = useSharedValue(open ? 1 : 0);
  const progress = transitionProgress ?? internalProgress;
  const pencilPressMotion = usePressMotion(1, MOTION.scale.press);
  const closePressMotion = usePressMotion(1, MOTION.scale.press);
  const baseOpenBottom = Platform.OS === "web" ? 8 : Math.max(insets.bottom - 16, 8);
  const openBottom =
    Platform.OS === "ios" ? baseOpenBottom - IOS_NATIVE_TAB_OVERLAY_DROP : baseOpenBottom;
  const overlaidTabBarInset =
    Platform.OS === "ios" ? insets.bottom + IOS_NATIVE_TAB_OVERLAY_CLEARANCE : insets.bottom;
  const { floatingActionBottom } = calculateCalendarBottomLayout(overlaidTabBarInset);
  const closedVisualBottom = Math.max(openBottom, floatingActionBottom);
  const closedBottomWithinControl = closedVisualBottom - openBottom;
  const { tileWidth } = calculateQuickPlannerLayout(width);

  useEffect(() => {
    if (closing) return;
    cancelAnimation(progress);
    if (reduceMotion) {
      progress.value = withTiming(open ? 1 : 0, {
        duration: quickPlannerTransitionDuration(open, true),
        easing: MOTION.easing.standard,
      });
      return;
    }
    progress.value = withTiming(open ? 1 : 0, {
      duration: quickPlannerTransitionDuration(open, false),
      easing: MOTION.easing.calm,
    });
  }, [closing, open, progress, reduceMotion]);

  const finishClose = useCallback(() => {
    setClosing(false);
    onClose();
  }, [onClose]);

  const requestClose = useCallback(() => {
    if (!open || closing) return;
    setClosing(true);
    cancelAnimation(progress);
    progress.value = withTiming(
      0,
      {
        duration: quickPlannerTransitionDuration(false, reduceMotion),
        easing: MOTION.easing.calm,
      },
      (finished) => {
        if (finished) runOnJS(finishClose)();
      },
    );
  }, [closing, finishClose, open, progress, reduceMotion]);

  const dockMotionStyle = useAnimatedStyle(() => {
    const value = progress.value;
    return {
      opacity: reduceMotion
        ? value
        : interpolate(value, [0, 0.12, 0.46], [0, 0.68, 1], Extrapolation.CLAMP),
      transform: reduceMotion
        ? []
        : [
            {
              translateY: interpolate(
                value,
                [0, 1],
                [MOTION.distance.scene, 0],
                Extrapolation.CLAMP,
              ),
            },
          ],
    };
  }, [openBottom, reduceMotion]);

  const pencilMorphStyle = useAnimatedStyle(
    () => ({
      opacity: interpolate(progress.value, [0, 0.52], [1, 0], Extrapolation.CLAMP),
      transform: reduceMotion
        ? []
        : [
            {
              translateY: interpolate(
                progress.value,
                [0, 0.62],
                [0, MOTION.distance.subtle],
                Extrapolation.CLAMP,
              ),
            },
          ],
    }),
    [openBottom, reduceMotion],
  );

  const closeMorphStyle = useAnimatedStyle(() => {
    const reveal = interpolate(progress.value, [0.08, 0.48], [0, 1], Extrapolation.CLAMP);
    return {
      opacity: reveal,
      transform: reduceMotion
        ? []
        : [
            {
              translateY: interpolate(
                progress.value,
                [0, 1],
                [MOTION.distance.scene, 0],
                Extrapolation.CLAMP,
              ),
            },
          ],
    };
  }, [openBottom, reduceMotion]);

  const control = (
    <Animated.View
      entering={FadeIn.delay(MOTION.duration.fast)
        .duration(MOTION.duration.fast)
        .reduceMotion(MOTION.reduceMotion)}
      pointerEvents="box-none"
      style={StyleSheet.absoluteFill}
      testID="quick-planner-mount-reveal"
    >
      <View
        pointerEvents="box-none"
        style={[styles.stack, { bottom: openBottom, height: CONTROL_HEIGHT }]}
        testID="quick-planner-stack"
      >
        <Animated.View
          pointerEvents={open && !closing ? "auto" : "none"}
          style={[
            styles.dockSurface,
            {
              backgroundColor: dockPalette.surface,
              borderColor: dockPalette.separator,
              boxShadow: `0 10px 28px ${palette.shadow}`,
            },
            dockMotionStyle,
          ]}
          testID="quick-planner-dock"
        >
          <QuickEntryActionStrip
            actions={actions}
            activeKey={activeKey}
            busy={busy || closing}
            onSelectAction={onSelectAction}
            tileWidth={tileWidth}
          />
        </Animated.View>

        <Animated.View
          pointerEvents={!open && !closing ? "auto" : "none"}
          style={[
            styles.pencilAnchor,
            {
              right: CLOSED_TARGET_RIGHT,
              bottom: closedBottomWithinControl - CLOSED_TARGET_INSET,
            },
            pencilMorphStyle,
          ]}
          testID="quick-planner-pencil-anchor"
        >
          <AnimatedPressable
            accessibilityHint="Öffnet die Vorlagenauswahl zum schnellen Eintragen mehrerer Dienste."
            accessibilityLabel="Dienstplan bearbeiten"
            accessibilityRole="button"
            onPress={onOpen}
            onPressIn={pencilPressMotion.onPressIn}
            onPressOut={pencilPressMotion.onPressOut}
            style={[styles.pencilTarget, pencilPressMotion.animatedStyle]}
            testID="quick-planner-pencil-target"
          >
            <View
              style={[
                styles.pencilVisual,
                {
                  backgroundColor: palette.floatingAction,
                  boxShadow: `0 7px 20px ${palette.shadow}`,
                },
              ]}
            >
              <Ionicons accessible={false} color={palette.onFloatingAction} name="add" size={24} />
            </View>
          </AnimatedPressable>
        </Animated.View>

        <Animated.View
          pointerEvents={open && !closing ? "auto" : "none"}
          style={[styles.closeAnchor, closeMorphStyle]}
          testID="quick-planner-close-row"
        >
          <AnimatedPressable
            accessibilityHint="Schließt den Schnelleinfüge-Modus."
            accessibilityLabel="Planung beenden"
            accessibilityRole="button"
            onPress={requestClose}
            onPressIn={closePressMotion.onPressIn}
            onPressOut={closePressMotion.onPressOut}
            style={[styles.closeTarget, closePressMotion.animatedStyle]}
            testID="quick-planner-close-hit-target"
          >
            {({ pressed }) => (
              <View
                style={[
                  styles.closeVisual,
                  {
                    backgroundColor: dockPalette.surface,
                    borderColor: dockPalette.separator,
                    boxShadow: `0 4px 12px ${palette.shadow}`,
                    opacity: pressed ? 0.72 : 1,
                  },
                ]}
                testID="quick-planner-close-visual"
              >
                <Ionicons accessible={false} color={dockPalette.text} name="close" size={20} />
              </View>
            )}
          </AnimatedPressable>
        </Animated.View>
      </View>
    </Animated.View>
  );

  if (Platform.OS === "ios") {
    return (
      <FullWindowOverlay unstable_accessibilityContainerViewIsModal={false}>
        {control}
      </FullWindowOverlay>
    );
  }

  return control;
});

const styles = StyleSheet.create({
  stack: {
    position: "absolute",
    right: CONTROL_SIDE_INSET,
    left: CONTROL_SIDE_INSET,
    zIndex: 100,
    elevation: 24,
  },
  dockSurface: {
    position: "absolute",
    right: 0,
    bottom: 0,
    left: 0,
    height: QUICK_PLANNER_METRICS.dockHeight,
    overflow: "hidden",
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: QUICK_PLANNER_METRICS.dockRadius,
    borderCurve: "continuous",
    paddingHorizontal: 5,
    paddingVertical: 4,
  },
  pencilAnchor: {
    position: "absolute",
    width: CLOSED_TARGET_SIZE,
    height: CLOSED_TARGET_SIZE,
  },
  pencilTarget: {
    width: CLOSED_TARGET_SIZE,
    height: CLOSED_TARGET_SIZE,
    alignItems: "center",
    justifyContent: "center",
  },
  pencilVisual: {
    width: CALENDAR_METRICS.floatingActionSize,
    height: CALENDAR_METRICS.floatingActionSize,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: CALENDAR_METRICS.floatingActionSize / 2,
  },
  closeAnchor: {
    position: "absolute",
    right: 2,
    bottom: CLOSE_TARGET_BOTTOM,
    width: QUICK_PLANNER_METRICS.closeTargetSize,
    height: QUICK_PLANNER_METRICS.closeTargetSize,
  },
  closeTarget: {
    width: QUICK_PLANNER_METRICS.closeTargetSize,
    height: QUICK_PLANNER_METRICS.closeTargetSize,
    alignItems: "center",
    justifyContent: "center",
  },
  closeVisual: {
    width: QUICK_PLANNER_METRICS.closeVisualSize,
    height: QUICK_PLANNER_METRICS.closeVisualSize,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: QUICK_PLANNER_METRICS.closeVisualSize / 2,
    borderCurve: "continuous",
  },
});
