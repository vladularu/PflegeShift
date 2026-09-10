import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import {
  cancelAnimation,
  Easing,
  runOnJS,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import type { CalendarViewMode } from "@/domain/types";

const noop = () => {};

/** Owns presentation only. The committed data month stays with the existing provider. */
export function useCalendarController({
  month,
  mode,
  active,
  ready = true,
  revision = 0,
  onTransitionStart = noop,
  onTransitionComplete = noop,
}: {
  month: string;
  mode: CalendarViewMode;
  active: boolean;
  ready?: boolean;
  revision?: number;
  onTransitionStart?: (mode: CalendarViewMode) => void;
  onTransitionComplete?: () => void;
}) {
  const progress = useSharedValue(mode === "MONTH" ? 1 : 0);
  const reduced = useReducedMotion();
  const [foreground, setForeground] = useState(AppState.currentState === "active");
  const [busy, setBusy] = useState(false);
  const transitionInFlight = useRef(false);
  const isTransitionInFlight = useCallback(() => transitionInFlight.current, []);
  const tryBeginTransition = useCallback(() => {
    if (transitionInFlight.current) return false;
    transitionInFlight.current = true;
    return true;
  }, []);
  const previousMode = useRef(mode);
  const epoch = useRef(0);
  const animationEpoch = useSharedValue(0);
  const [preview, setPreview] = useState<{
    anchor: string;
    month: string;
    revision: number;
  } | null>(null);
  const displayMonth =
    mode === "MONTH" && preview?.anchor === month && preview.revision === revision
      ? preview.month
      : month;
  const previewMonth = useCallback(
    (next: string) => {
      if (!active || mode !== "MONTH" || transitionInFlight.current) return;
      setPreview((old) =>
        old?.anchor === month && old.month === next && old.revision === revision
          ? old
          : { anchor: month, month: next, revision },
      );
    },
    [active, mode, month, revision],
  );
  useLayoutEffect(() => setPreview(null), [month, mode, revision, active]);
  useEffect(() => {
    const listener = AppState.addEventListener("change", (state) =>
      setForeground(state === "active"),
    );
    return () => listener.remove();
  }, []);
  const complete = useCallback(
    (id: number) => {
      if (id !== epoch.current) return;
      transitionInFlight.current = false;
      setBusy(false);
      onTransitionComplete();
    },
    [onTransitionComplete],
  );
  useLayoutEffect(() => {
    const id = ++epoch.current;
    animationEpoch.value = id;
    const changed = previousMode.current !== mode;
    previousMode.current = mode;
    const end = mode === "MONTH" ? 1 : 0;
    cancelAnimation(progress);
    onTransitionStart(mode);
    if (!changed || !active || !foreground || reduced || !ready) {
      progress.value = end;
      complete(id);
    } else {
      transitionInFlight.current = true;
      setBusy(true);
      progress.value = withTiming(
        end,
        { duration: 420, easing: Easing.bezier(0.22, 0.68, 0, 1) },
        (finished) => {
          if (finished && animationEpoch.value === id) {
            progress.value = end;
            runOnJS(complete)(id);
          }
        },
      );
    }
    return () => {
      // Each effect owns its token; cleanup also invalidates queued JS completions.
      epoch.current = id + 1;
      animationEpoch.value = id + 1;
      cancelAnimation(progress);
    };
  }, [
    active,
    animationEpoch,
    complete,
    foreground,
    mode,
    month,
    onTransitionStart,
    progress,
    ready,
    reduced,
    revision,
  ]);
  return {
    month,
    mode,
    displayMonth,
    progress,
    busy,
    isTransitionInFlight,
    tryBeginTransition,
    previewMonth,
    yearVisible: mode === "YEAR" || busy,
  };
}

export type CalendarController = ReturnType<typeof useCalendarController>;
