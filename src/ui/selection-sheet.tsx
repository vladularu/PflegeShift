import { useCallback, useRef, useState, type ReactNode } from "react";
import {
  findNodeHandle,
  type LayoutChangeEvent,
  Modal,
  Pressable,
  ScrollView,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { Gesture, GestureDetector, GestureHandlerRootView } from "react-native-gesture-handler";
import Animated, {
  cancelAnimation,
  Easing,
  runOnJS,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { MOTION } from "@/theme/motion";
import { usePalette } from "@/theme/palette";
import { CONTROL_HEIGHT, RADII, SPACING } from "@/theme/tokens";
import { TEXT_MAX_SCALE, TYPOGRAPHY } from "@/theme/typography";
import { scheduleAccessibilityFocus } from "@/ui/accessibility-focus";

// Mirror the opening curve so dismissal does not accelerate out of view immediately.
const closingEasing = Easing.bezier(0.64, 0, 0.78, 0);

export function SelectionSheet({
  children,
  onClose,
  title,
  visible,
}: {
  readonly children: (dismiss: () => void) => ReactNode;
  readonly onClose: () => void;
  readonly title: string;
  readonly visible: boolean;
}) {
  const palette = usePalette();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const reduceMotion = useReducedMotion();
  const maxHeight = Math.min(height * 0.85, height - insets.top - SPACING.md, 740);
  const headingRef = useRef<View>(null);
  const closeStarted = useSharedValue(false);
  const [closing, setClosing] = useState(false);
  const sheetHeight = useSharedValue(0);
  const translateY = useSharedValue(height + insets.bottom);
  const backdropProgress = useSharedValue(0);
  const scrollOffset = useSharedValue(0);
  const dragAllowed = useSharedValue(false);
  const dragOrigin = useSharedValue(0);

  const requestClose = useCallback(() => {
    if (closeStarted.get()) return;
    closeStarted.set(true);
    setClosing(true);
    cancelAnimation(translateY);
    cancelAnimation(backdropProgress);
    backdropProgress.set(
      withTiming(0, {
        duration: reduceMotion ? 0 : MOTION.duration.normal,
        easing: closingEasing,
        reduceMotion: MOTION.reduceMotion,
      }),
    );
    translateY.set(
      withTiming(
        (sheetHeight.get() || maxHeight) + SPACING.md,
        {
          duration: reduceMotion ? 0 : MOTION.duration.normal,
          easing: closingEasing,
          reduceMotion: MOTION.reduceMotion,
        },
        (finished) => {
          if (finished) runOnJS(onClose)();
        },
      ),
    );
  }, [backdropProgress, closeStarted, maxHeight, onClose, reduceMotion, sheetHeight, translateY]);

  function showSheet() {
    closeStarted.set(false);
    setClosing(false);
    scrollOffset.set(0);
    dragAllowed.set(false);
    // Opening must never wait for an optional native layout event.
    translateY.set((sheetHeight.get() || maxHeight) + SPACING.md);
    translateY.set(
      withTiming(0, {
        duration: reduceMotion ? 0 : MOTION.duration.normal,
        easing: MOTION.easing.standard,
        reduceMotion: MOTION.reduceMotion,
      }),
    );
    backdropProgress.set(
      withTiming(1, {
        duration: reduceMotion ? 0 : MOTION.duration.normal,
        easing: MOTION.easing.standard,
        reduceMotion: MOTION.reduceMotion,
      }),
    );
    scheduleAccessibilityFocus(findNodeHandle(headingRef.current));
  }

  function measureSheet(event: LayoutChangeEvent) {
    const measuredHeight = event.nativeEvent.layout.height;
    if (measuredHeight <= 0) return;
    sheetHeight.set(measuredHeight);
    // Measurement improves the exit distance; it cannot gate or restart opening.
  }

  const nativeScroll = Gesture.Native();
  function dismissGesture(fromHeader: boolean) {
    return Gesture.Pan()
      .withTestId(fromHeader ? "selection-sheet-header-drag" : "selection-sheet-list-drag")
      .enabled(!closing)
      .activeOffsetY([-6, 6])
      .failOffsetX([-28, 28])
      .onStart((event) => {
        dragAllowed.set(fromHeader || (scrollOffset.get() <= 0 && event.translationY > 0));
        if (!dragAllowed.get()) return;
        cancelAnimation(translateY);
        cancelAnimation(backdropProgress);
        dragOrigin.set(translateY.get());
      })
      .onUpdate((event) => {
        if (!dragAllowed.get()) return;
        const offset = Math.max(0, dragOrigin.get() + event.translationY);
        translateY.set(offset);
        backdropProgress.set(
          Math.max(0, 1 - offset / Math.max((sheetHeight.get() || maxHeight) * 0.7, 1)),
        );
      })
      .onEnd((event, success) => {
        if (!success || !dragAllowed.get()) return;
        if (event.translationY >= 88 || (event.translationY >= 12 && event.velocityY >= 900)) {
          runOnJS(requestClose)();
          return;
        }
        translateY.set(
          withSpring(0, {
            ...MOTION.spring.settle,
            reduceMotion: MOTION.reduceMotion,
          }),
        );
        backdropProgress.set(
          withTiming(1, {
            duration: MOTION.duration.fast,
            reduceMotion: MOTION.reduceMotion,
          }),
        );
      })
      .onFinalize((_event, success) => {
        if (success || !dragAllowed.get()) return;
        translateY.set(
          withSpring(0, {
            ...MOTION.spring.settle,
            reduceMotion: MOTION.reduceMotion,
          }),
        );
        backdropProgress.set(
          withTiming(1, {
            duration: MOTION.duration.fast,
            reduceMotion: MOTION.reduceMotion,
          }),
        );
      });
  }
  const headerDrag = dismissGesture(true);
  const listDrag = dismissGesture(false).simultaneousWithExternalGesture(nativeScroll);
  const sheetStyle = useAnimatedStyle(() => ({ transform: [{ translateY: translateY.get() }] }));
  const backdropStyle = useAnimatedStyle(() => ({ opacity: backdropProgress.get() }));

  return (
    <Modal
      animationType="none"
      onRequestClose={requestClose}
      onShow={showSheet}
      presentationStyle="overFullScreen"
      statusBarTranslucent
      transparent
      visible={visible}
    >
      <GestureHandlerRootView style={{ flex: 1, justifyContent: "flex-end" }}>
        <Animated.View
          style={[{ position: "absolute", top: 0, right: 0, bottom: 0, left: 0 }, backdropStyle]}
        >
          <Pressable
            testID="selection-sheet-backdrop"
            accessible={false}
            accessibilityElementsHidden
            aria-hidden
            importantForAccessibility="no-hide-descendants"
            onPress={requestClose}
            style={{ flex: 1, backgroundColor: palette.overlay }}
          />
        </Animated.View>
        <Animated.View
          accessibilityViewIsModal
          onAccessibilityEscape={requestClose}
          onLayout={measureSheet}
          testID="dropdown-modal-content"
          style={[
            {
              maxHeight,
              borderTopLeftRadius: RADII.sheet,
              borderTopRightRadius: RADII.sheet,
              borderCurve: "continuous",
              backgroundColor: palette.surfaceRaised,
              boxShadow: `0 -12px 32px ${palette.shadow}`,
              paddingBottom: Math.max(insets.bottom, SPACING.md),
            },
            sheetStyle,
          ]}
        >
          <GestureDetector gesture={headerDrag}>
            <View
              collapsable={false}
              style={{ borderBottomWidth: 1, borderBottomColor: palette.separator }}
            >
              <View
                accessibilityElementsHidden
                importantForAccessibility="no-hide-descendants"
                style={{ alignItems: "center", paddingTop: SPACING.sm, paddingBottom: SPACING.sm }}
              >
                <View
                  testID="selection-sheet-grabber"
                  style={{
                    width: 36,
                    height: 5,
                    borderRadius: RADII.pill,
                    backgroundColor: palette.textMuted,
                  }}
                />
              </View>
              <View
                ref={headingRef}
                accessible
                accessibilityLabel={`${title}, Auswahldialog`}
                accessibilityHint="Zum Schließen nach unten ziehen"
                accessibilityRole="header"
                style={{
                  minHeight: CONTROL_HEIGHT.regular,
                  justifyContent: "center",
                  paddingHorizontal: SPACING.lg,
                  paddingBottom: SPACING.sm,
                }}
              >
                <Text
                  maxFontSizeMultiplier={TEXT_MAX_SCALE}
                  style={{ color: palette.text, ...TYPOGRAPHY.sectionTitle }}
                >
                  {title}
                </Text>
              </View>
            </View>
          </GestureDetector>
          <GestureDetector gesture={listDrag}>
            <GestureDetector gesture={nativeScroll}>
              <ScrollView
                testID="selection-sheet-list"
                nestedScrollEnabled
                bounces={false}
                showsVerticalScrollIndicator
                scrollEventThrottle={16}
                onScroll={(event) => {
                  scrollOffset.set(Math.max(0, event.nativeEvent.contentOffset.y));
                }}
                style={{ flexShrink: 1 }}
                pointerEvents={closing ? "none" : "auto"}
              >
                {children(requestClose)}
              </ScrollView>
            </GestureDetector>
          </GestureDetector>
          <Pressable
            accessibilityLabel="Auswahl abbrechen"
            accessibilityRole="button"
            onPress={requestClose}
            disabled={closing}
            style={({ pressed }) => ({
              minHeight: CONTROL_HEIGHT.large,
              alignItems: "center",
              justifyContent: "center",
              borderTopWidth: 1,
              borderTopColor: palette.separator,
              opacity: pressed ? 0.65 : 1,
            })}
          >
            <Text
              maxFontSizeMultiplier={TEXT_MAX_SCALE}
              style={{ color: palette.primary, ...TYPOGRAPHY.button }}
            >
              Abbrechen
            </Text>
          </Pressable>
        </Animated.View>
      </GestureHandlerRootView>
    </Modal>
  );
}
