import Ionicons from "@expo/vector-icons/Ionicons";
import {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  use,
  type PropsWithChildren,
} from "react";
import { Pressable, Text, View } from "react-native";
import Animated, { FadeInUp, FadeOutDown } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { usePalette } from "@/theme/palette";
import { MOTION } from "@/theme/motion";
import { TEXT_MAX_SCALE, TYPOGRAPHY } from "@/theme/typography";
import { RADII, SPACING } from "@/theme/tokens";

interface FeedbackOptions {
  readonly message: string;
  readonly actionLabel?: string;
  readonly onAction?: () => void | Promise<void>;
  readonly duration?: number;
}

interface ActiveFeedback extends FeedbackOptions {
  readonly id: number;
}

interface FeedbackContextValue {
  readonly showFeedback: (options: FeedbackOptions) => void;
  readonly dismissFeedback: () => void;
}

const FeedbackContext = createContext<FeedbackContextValue | null>(null);

export function FeedbackProvider({ children }: PropsWithChildren) {
  const [feedback, setFeedback] = useState<ActiveFeedback | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const nextId = useRef(0);

  const clearTimer = useCallback(() => {
    if (timeoutRef.current !== null) clearTimeout(timeoutRef.current);
    timeoutRef.current = null;
  }, []);

  const dismissFeedback = useCallback(() => {
    clearTimer();
    setFeedback(null);
  }, [clearTimer]);

  const showFeedback = useCallback(
    (options: FeedbackOptions) => {
      clearTimer();
      const id = ++nextId.current;
      setFeedback({ ...options, id });
      timeoutRef.current = setTimeout(() => {
        setFeedback((current) => (current?.id === id ? null : current));
        timeoutRef.current = null;
      }, options.duration ?? 4800);
    },
    [clearTimer],
  );

  useEffect(() => clearTimer, [clearTimer]);

  const value = useMemo(() => ({ dismissFeedback, showFeedback }), [dismissFeedback, showFeedback]);

  return (
    <FeedbackContext value={value}>
      <View style={{ flex: 1 }}>
        {children}
        {feedback ? (
          <FeedbackSnackbar key={feedback.id} feedback={feedback} onDismiss={dismissFeedback} />
        ) : null}
      </View>
    </FeedbackContext>
  );
}

export function useFeedback(): FeedbackContextValue {
  const value = use(FeedbackContext);
  if (value === null) {
    throw new Error("useFeedback muss innerhalb des FeedbackProvider verwendet werden.");
  }
  return value;
}

function FeedbackSnackbar({
  feedback,
  onDismiss,
}: {
  readonly feedback: ActiveFeedback;
  readonly onDismiss: () => void;
}) {
  const palette = usePalette();
  const insets = useSafeAreaInsets();

  async function runAction() {
    onDismiss();
    await feedback.onAction?.();
  }

  return (
    <Animated.View
      accessibilityLiveRegion="polite"
      accessibilityRole="alert"
      entering={FadeInUp.duration(MOTION.duration.fast).reduceMotion(MOTION.reduceMotion)}
      exiting={FadeOutDown.duration(MOTION.duration.instant).reduceMotion(MOTION.reduceMotion)}
      style={{
        position: "absolute",
        right: SPACING.lg,
        bottom: Math.max(insets.bottom, SPACING.md) + 70,
        left: SPACING.lg,
        zIndex: 10_000,
        elevation: 32,
        minHeight: 54,
        flexDirection: "row",
        alignItems: "center",
        gap: SPACING.md,
        borderRadius: RADII.large,
        borderCurve: "continuous",
        backgroundColor: palette.text,
        boxShadow: `0 12px 32px ${palette.shadow}`,
        paddingLeft: SPACING.lg,
        paddingRight: SPACING.sm,
        paddingVertical: SPACING.sm,
      }}
    >
      <Text
        maxFontSizeMultiplier={TEXT_MAX_SCALE}
        style={{ flex: 1, color: palette.background, ...TYPOGRAPHY.bodyStrong }}
      >
        {feedback.message}
      </Text>
      {feedback.actionLabel && feedback.onAction ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => void runAction()}
          style={({ pressed }) => ({
            minWidth: 44,
            minHeight: 44,
            alignItems: "center",
            justifyContent: "center",
            borderRadius: RADII.control,
            backgroundColor: pressed ? `${palette.background}24` : "transparent",
            paddingHorizontal: SPACING.sm,
          })}
        >
          <Text
            maxFontSizeMultiplier={TEXT_MAX_SCALE}
            style={{ color: palette.background, ...TYPOGRAPHY.button }}
          >
            {feedback.actionLabel}
          </Text>
        </Pressable>
      ) : (
        <Pressable
          accessibilityLabel="Hinweis schließen"
          accessibilityRole="button"
          hitSlop={8}
          onPress={onDismiss}
          style={({ pressed }) => ({
            width: 44,
            height: 44,
            alignItems: "center",
            justifyContent: "center",
            opacity: pressed ? 0.62 : 1,
          })}
        >
          <Ionicons color={palette.background} name="close" size={20} />
        </Pressable>
      )}
    </Animated.View>
  );
}
