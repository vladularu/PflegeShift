import { useCallback, useEffect, useRef, useState } from "react";
import {
  cancelAnimation,
  runOnJS,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

import { quickEntryTransitionDuration, type QuickEntryAnchorMotion } from "./quick-entry-motion";
import { MOTION } from "@/theme/motion";

export function useQuickEntryPopupMotion({
  animateEntry,
  origin,
  onClose,
}: {
  readonly animateEntry: boolean;
  readonly origin: QuickEntryAnchorMotion;
  readonly onClose: () => void;
}) {
  const reduceMotion = useReducedMotion();
  const progress = useSharedValue(animateEntry ? 0 : 1);
  const [closing, setClosing] = useState(false);
  const closeRequested = useRef(false);
  const completed = useRef(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      cancelAnimation(progress);
    };
  }, [progress]);

  useEffect(() => {
    if (closeRequested.current) return;
    cancelAnimation(progress);
    progress.set(
      animateEntry
        ? withTiming(1, {
            duration: quickEntryTransitionDuration(true, reduceMotion),
            easing: MOTION.easing.calm,
          })
        : 1,
    );
  }, [animateEntry, progress, reduceMotion]);

  const finishClose = useCallback(() => {
    if (!mounted.current || completed.current) return;
    completed.current = true;
    onClose();
  }, [onClose]);

  const closePopup = useCallback(() => {
    if (closeRequested.current) return;
    closeRequested.current = true;
    setClosing(true);
    cancelAnimation(progress);
    progress.set(
      withTiming(
        0,
        {
          duration: quickEntryTransitionDuration(false, reduceMotion),
          easing: MOTION.easing.calm,
        },
        (finished) => {
          if (finished) runOnJS(finishClose)();
        },
      ),
    );
  }, [finishClose, progress, reduceMotion]);

  const popupMotionStyle = useAnimatedStyle(() => {
    const value = progress.get();
    return {
      opacity: Math.min(1, value * 4),
      transform: reduceMotion
        ? []
        : [
            { translateX: origin.translateX * (1 - value) },
            { translateY: origin.translateY * (1 - value) },
            { scale: origin.scale + (1 - origin.scale) * value },
          ],
    };
  }, [origin, reduceMotion]);
  const backdropMotionStyle = useAnimatedStyle(() => ({ opacity: progress.get() }));

  return { closing, closePopup, popupMotionStyle, backdropMotionStyle };
}
