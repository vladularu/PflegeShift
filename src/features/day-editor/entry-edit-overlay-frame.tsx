/* eslint-disable react-hooks/immutability -- Reanimated SharedValue.value is intentionally mutable on the UI thread. */
import type { ReactNode } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, {
  FadeIn,
  SlideInDown,
  cancelAnimation,
  runOnJS,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";

import {
  entryEditDurationLabel,
  entryEditShortDate,
  shouldDismissEntryEditOverlay,
} from "@/features/day-editor/entry-edit-overlay-pattern";
import { MOTION } from "@/theme/motion";
import { usePalette } from "@/theme/palette";
import { TEXT_MAX_SCALE } from "@/theme/typography";

export function EntryEditOverlayFrame({
  busy,
  cardContent,
  date,
  durationMinutes,
  error,
  headerColor,
  headerForeground,
  headerLeading,
  onBackdropPress,
  onClosingStart,
  onDismiss,
  onRequestClose,
  overlay,
  testIDPrefix,
}: {
  readonly busy: boolean;
  readonly cardContent: ReactNode;
  readonly date: string;
  readonly durationMinutes: number | null;
  readonly error: string | null;
  readonly headerColor: string;
  readonly headerForeground: string;
  readonly headerLeading?: ReactNode;
  readonly onBackdropPress?: () => void;
  readonly onClosingStart?: () => void;
  readonly onDismiss: () => void;
  readonly onRequestClose: () => Promise<boolean>;
  readonly overlay?: ReactNode;
  readonly testIDPrefix: string;
}) {
  const palette = usePalette();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const reduceMotion = useReducedMotion();
  const [closing, setClosing] = useState(false);
  const closedOffset = height + Math.max(insets.bottom, 24);
  const sheetTranslateY = useSharedValue(0);
  const backdropProgress = useSharedValue(1);
  const dragOriginY = useSharedValue(0);
  const exitAnimationFinishedRef = useRef(false);
  const saveSucceededRef = useRef<boolean | null>(null);
  const [gestureCloseRequest, setGestureCloseRequest] = useState(0);

  const finishDismissIfReady = useCallback(() => {
    if (!exitAnimationFinishedRef.current || saveSucceededRef.current !== true) return;
    onDismiss();
  }, [onDismiss]);

  const markExitAnimationFinished = useCallback(() => {
    exitAnimationFinishedRef.current = true;
    finishDismissIfReady();
  }, [finishDismissIfReady]);

  const restoreOpenPosition = useCallback(() => {
    cancelAnimation(sheetTranslateY);
    cancelAnimation(backdropProgress);
    sheetTranslateY.value = withSpring(0, {
      ...MOTION.spring.settle,
      reduceMotion: MOTION.reduceMotion,
    });
    backdropProgress.value = withTiming(1, {
      duration: reduceMotion ? MOTION.duration.instant : MOTION.duration.fast,
      easing: MOTION.easing.standard,
      reduceMotion: MOTION.reduceMotion,
    });
    setClosing(false);
  }, [backdropProgress, reduceMotion, sheetTranslateY]);

  const handleSaveResult = useCallback(
    (saved: boolean) => {
      saveSucceededRef.current = saved;
      if (!saved) {
        restoreOpenPosition();
        return;
      }
      finishDismissIfReady();
    },
    [finishDismissIfReady, restoreOpenPosition],
  );

  const requestClose = useCallback(() => {
    if (busy || closing) return;
    setClosing(true);
    onClosingStart?.();
    exitAnimationFinishedRef.current = false;
    saveSucceededRef.current = null;
    cancelAnimation(sheetTranslateY);
    cancelAnimation(backdropProgress);
    sheetTranslateY.value = withTiming(
      closedOffset,
      {
        duration: reduceMotion ? MOTION.duration.instant : MOTION.duration.normal,
        easing: MOTION.easing.standard,
        reduceMotion: MOTION.reduceMotion,
      },
      (finished) => {
        if (finished) runOnJS(markExitAnimationFinished)();
      },
    );
    backdropProgress.value = withTiming(0, {
      duration: reduceMotion ? MOTION.duration.instant : MOTION.duration.normal,
      easing: MOTION.easing.standard,
      reduceMotion: MOTION.reduceMotion,
    });
    void onRequestClose().then(handleSaveResult, () => handleSaveResult(false));
  }, [
    backdropProgress,
    busy,
    closedOffset,
    closing,
    handleSaveResult,
    markExitAnimationFinished,
    onClosingStart,
    onRequestClose,
    reduceMotion,
    sheetTranslateY,
  ]);

  const queueGestureClose = useCallback(() => {
    setGestureCloseRequest((current) => current + 1);
  }, []);
  useEffect(() => {
    if (gestureCloseRequest === 0) return;
    requestClose();
  }, [gestureCloseRequest, requestClose]);

  const dismissGesture = Gesture.Pan()
    .withTestId(`${testIDPrefix}-dismiss-gesture`)
    .enabled(!busy && !closing)
    .activeOffsetY([-6, 6])
    .failOffsetX([-28, 28])
    .onBegin(() => {
      cancelAnimation(sheetTranslateY);
      cancelAnimation(backdropProgress);
      dragOriginY.value = sheetTranslateY.value;
    })
    .onUpdate((event) => {
      const nextTranslateY = Math.max(0, dragOriginY.value + event.translationY);
      sheetTranslateY.value = nextTranslateY;
      backdropProgress.value = Math.max(0, 1 - nextTranslateY / Math.max(closedOffset * 0.7, 1));
    })
    .onEnd((event) => {
      if (shouldDismissEntryEditOverlay(event.translationY, event.velocityY)) {
        runOnJS(queueGestureClose)();
        return;
      }
      sheetTranslateY.value = withSpring(0, {
        ...MOTION.spring.settle,
        reduceMotion: MOTION.reduceMotion,
      });
      backdropProgress.value = withTiming(1, {
        duration: MOTION.duration.fast,
        easing: MOTION.easing.standard,
        reduceMotion: MOTION.reduceMotion,
      });
    })
    .onFinalize((_event, success) => {
      if (success) return;
      sheetTranslateY.value = withSpring(0, {
        ...MOTION.spring.settle,
        reduceMotion: MOTION.reduceMotion,
      });
      backdropProgress.value = withTiming(1, {
        duration: MOTION.duration.fast,
        easing: MOTION.easing.standard,
        reduceMotion: MOTION.reduceMotion,
      });
    });

  const backdropMotionStyle = useAnimatedStyle(() => ({ opacity: backdropProgress.value }));
  const sheetMotionStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: sheetTranslateY.value }],
  }));

  return (
    <View style={styles.overlay} testID={`${testIDPrefix}-overlay`}>
      <Animated.View
        entering={FadeIn.duration(MOTION.duration.normal).reduceMotion(MOTION.reduceMotion)}
        pointerEvents="none"
        style={StyleSheet.absoluteFill}
      >
        <Animated.View
          style={[
            StyleSheet.absoluteFill,
            { backgroundColor: palette.overlay },
            backdropMotionStyle,
          ]}
          testID={`${testIDPrefix}-backdrop`}
        />
      </Animated.View>
      <Pressable
        accessibilityElementsHidden
        importantForAccessibility="no"
        onPress={onBackdropPress}
        style={StyleSheet.absoluteFill}
      />
      <KeyboardAvoidingView behavior="padding" style={styles.keyboardLayer}>
        <ScrollView
          automaticallyAdjustKeyboardInsets
          contentContainerStyle={[
            styles.scrollContent,
            {
              paddingTop: Math.max(insets.top, 16),
              paddingBottom: Math.max(insets.bottom, 12),
            },
          ]}
          keyboardDismissMode="interactive"
          keyboardShouldPersistTaps="handled"
        >
          <Animated.View
            entering={SlideInDown.duration(MOTION.duration.deliberate)
              .easing(MOTION.easing.emphasized)
              .reduceMotion(MOTION.reduceMotion)}
            style={styles.shell}
          >
            <Animated.View
              accessibilityViewIsModal
              pointerEvents={closing ? "none" : "auto"}
              style={[styles.sheetContent, sheetMotionStyle]}
              testID={`${testIDPrefix}-sheet`}
            >
              <View
                style={[
                  styles.card,
                  {
                    backgroundColor: palette.surface,
                    borderColor: palette.border,
                    shadowColor: palette.shadow,
                  },
                ]}
                testID={`${testIDPrefix}-card`}
              >
                <GestureDetector gesture={dismissGesture}>
                  <Animated.View
                    style={[styles.header, { backgroundColor: headerColor }]}
                    testID={`${testIDPrefix}-drag-handle`}
                  >
                    <View
                      accessibilityElementsHidden
                      style={[styles.grabber, { backgroundColor: headerForeground }]}
                    />
                    {headerLeading}
                    <Text
                      maxFontSizeMultiplier={TEXT_MAX_SCALE}
                      style={[styles.headerDate, { color: headerForeground }]}
                    >
                      {entryEditShortDate(date)}
                    </Text>
                    <Text
                      maxFontSizeMultiplier={TEXT_MAX_SCALE}
                      style={[styles.headerDuration, { color: headerForeground }]}
                    >
                      {entryEditDurationLabel(durationMinutes)}
                    </Text>
                  </Animated.View>
                </GestureDetector>
                {cardContent}
              </View>

              {error ? (
                <View accessibilityLiveRegion="polite" accessibilityRole="alert">
                  <Text style={[styles.errorText, { color: palette.danger }]}>{error}</Text>
                </View>
              ) : null}

              <Pressable
                accessibilityLabel="Schließen und speichern"
                accessibilityRole="button"
                disabled={busy || closing}
                onPress={requestClose}
                style={({ pressed }) => [
                  styles.closeButton,
                  {
                    borderColor: palette.border,
                    backgroundColor: palette.surface,
                    opacity: busy || closing ? 0.55 : pressed ? 0.72 : 1,
                  },
                ]}
              >
                {busy ? (
                  <ActivityIndicator color={palette.text} size="small" />
                ) : (
                  <Text
                    maxFontSizeMultiplier={TEXT_MAX_SCALE}
                    style={[styles.closeLabel, { color: palette.text }]}
                  >
                    Schließen
                  </Text>
                )}
              </Pressable>
            </Animated.View>
          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>
      {overlay}
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "transparent" },
  keyboardLayer: { flex: 1 },
  scrollContent: {
    flexGrow: 1,
    justifyContent: "flex-end",
    paddingHorizontal: 20,
  },
  shell: { width: "100%", maxWidth: 510, alignSelf: "center" },
  sheetContent: { gap: 10 },
  card: {
    position: "relative",
    overflow: "hidden",
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 22,
    borderCurve: "continuous",
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.28,
    shadowRadius: 24,
    elevation: 14,
  },
  header: {
    minHeight: 56,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 4,
  },
  grabber: {
    position: "absolute",
    top: 6,
    left: "50%",
    width: 34,
    height: 4,
    marginLeft: -17,
    borderRadius: 2,
    opacity: 0.62,
  },
  headerDate: { flex: 1, fontSize: 17, fontWeight: "700" },
  headerDuration: {
    fontSize: 16,
    fontWeight: "700",
    fontVariant: ["tabular-nums"],
  },
  errorText: { paddingHorizontal: 8, fontSize: 14, lineHeight: 20, textAlign: "center" },
  closeButton: {
    minHeight: 50,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 25,
    borderCurve: "continuous",
  },
  closeLabel: { fontSize: 17, fontWeight: "500" },
});
