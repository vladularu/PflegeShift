import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type PropsWithChildren,
  type ReactNode,
} from "react";
import {
  AppState,
  StyleSheet,
  View,
  useWindowDimensions,
  type LayoutChangeEvent,
} from "react-native";
import Animated, {
  cancelAnimation,
  Easing,
  FadeIn,
  FadeOut,
  interpolateColor,
  LayoutAnimationConfig,
  runOnJS,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";

import {
  buildCalendarMorphPlan,
  type CalendarMode,
  type CalendarMorphPlan,
  type MeasuredCalendarMorphNode,
  type MorphDay,
} from "./calendar-morph-geometry";
import {
  CalendarMorphMotion,
  CalendarMorphRegistry,
  measureCalendarRect,
  type MeasureCalendarNode,
} from "./calendar-morph-measurement";
import { MOTION } from "@/theme/motion";
import { calendarMorphPhases } from "./calendar-morph-phases";
import { usePalette } from "@/theme/palette";
import { calendarPerformance } from "@/application/calendar-performance";

export const CALENDAR_VIEW_ZOOM = { duration: 600, measurementTimeout: 900 } as const;
// Resolve Reanimated's easing factory once, not once per glyph and frame.
const morphTravelEasing = MOTION.easing.calm.factory();

export function calendarHeaderFadeIn() {
  return FadeIn.duration(CALENDAR_VIEW_ZOOM.duration)
    .easing(MOTION.easing.calm)
    .reduceMotion(MOTION.reduceMotion);
}
export function calendarHeaderFadeOut() {
  return FadeOut.duration(MOTION.duration.normal)
    .easing(MOTION.easing.calm)
    .reduceMotion(MOTION.reduceMotion);
}

function MorphDayView({
  day,
  progress,
  toMonth,
}: {
  readonly day: MorphDay;
  readonly progress: SharedValue<number>;
  readonly toMonth: boolean;
}) {
  const style = useAnimatedStyle(() => {
    const phase = calendarMorphPhases(progress.value, toMonth);
    const p = toMonth ? morphTravelEasing(phase.travel) : phase.travel;
    const fromX = day.from.x + day.from.width / 2;
    const fromY = day.from.y + day.from.height / 2;
    const toX = day.to.x + day.to.width / 2;
    const toY = day.to.y + day.to.height / 2;
    return {
      opacity: phase.glyphOpacity,
      transform: [
        { translateX: fromX + (toX - fromX) * p - day.to.width / 2 },
        { translateY: fromY + (toY - fromY) * p - day.to.height / 2 },
        { scaleX: day.from.width / day.to.width + (1 - day.from.width / day.to.width) * p },
        { scaleY: day.from.height / day.to.height + (1 - day.from.height / day.to.height) * p },
      ],
      backgroundColor:
        day.background === day.targetBackground
          ? day.background
          : interpolateColor(p, [0, 1], [day.background, day.targetBackground]),
    };
  });
  const textStyle = useAnimatedStyle(() => {
    const phase = calendarMorphPhases(progress.value, toMonth);
    const p = toMonth ? morphTravelEasing(phase.travel) : phase.travel;
    const circleScaleX = day.from.width / day.to.width + (1 - day.from.width / day.to.width) * p;
    const circleScaleY =
      day.from.height / day.to.height + (1 - day.from.height / day.to.height) * p;
    const textScale = (day.fromFont + (day.toFont - day.fromFont) * p) / day.toFont;
    return {
      color:
        day.color === day.targetColor
          ? day.color
          : interpolateColor(p, [0, 1], [day.color, day.targetColor]),
      // Compensate the circle scale: text and week spacing have separate trajectories.
      transform: [{ scaleX: textScale / circleScaleX }, { scaleY: textScale / circleScaleY }],
    };
  });
  return (
    <Animated.View
      style={[
        styles.day,
        {
          width: day.to.width,
          height: day.to.height,
          borderRadius: day.to.height / 2,
        },
        style,
      ]}
    >
      <Animated.Text
        allowFontScaling={false}
        style={[
          {
            fontSize: day.toFont,
            fontWeight: day.background === "transparent" ? "500" : "700",
            fontVariant: ["tabular-nums"],
          },
          textStyle,
        ]}
      >
        {day.day}
      </Animated.Text>
    </Animated.View>
  );
}

function MorphOverlay({
  plan,
  progress,
  toMonth,
}: {
  readonly plan: CalendarMorphPlan;
  readonly progress: SharedValue<number>;
  readonly toMonth: boolean;
}) {
  return (
    <View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      aria-hidden
      style={styles.fill}
      testID="calendar-morph-overlay"
    >
      {plan.days.map((day) => (
        <MorphDayView key={day.date} day={day} progress={progress} toMonth={toMonth} />
      ))}
    </View>
  );
}

/** Both lists stay mounted; a single clock drives measured glyphs and scene crossfades. */
export function CalendarTransitionHost({
  month,
  viewMode,
  active,
  monthView,
  yearView,
  onTransitionStart,
  onTransitionComplete,
}: {
  readonly month: string;
  readonly viewMode: CalendarMode;
  readonly active: boolean;
  readonly monthView: ReactNode;
  readonly yearView: ReactNode;
  readonly onTransitionStart?: (mode: CalendarMode) => void;
  readonly onTransitionComplete?: () => void;
}) {
  const palette = usePalette();
  const reduceMotion = useReducedMotion();
  const { width, height } = useWindowDimensions();
  const root = useRef<View>(null);
  const registry = useMemo(() => new Set<MeasureCalendarNode>(), []);
  const epoch = useRef(0);
  const desired = useRef(viewMode);
  const callbacks = useRef({ onTransitionStart, onTransitionComplete });
  useLayoutEffect(() => {
    callbacks.current = { onTransitionStart, onTransitionComplete };
  });
  const [displayedMode, setDisplayedMode] = useState(viewMode);
  const [plan, setPlan] = useState<CalendarMorphPlan | null>(null);
  const [foreground, setForeground] = useState(AppState.currentState !== "background");
  const progress = useSharedValue(viewMode === "MONTH" ? 1 : 0);
  const finish = useCallback((id: number) => {
    if (epoch.current !== id) return;
    calendarPerformance.record("animation-end", { epoch: id });
    setDisplayedMode(desired.current);
    setPlan(null);
    callbacks.current.onTransitionStart?.(desired.current);
    callbacks.current.onTransitionComplete?.();
  }, []);
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) =>
      setForeground(state === "active"),
    );
    return () => subscription.remove();
  }, []);

  useLayoutEffect(() => {
    const id = ++epoch.current;
    const measuring = calendarPerformance.span("plan-ready", { epoch: id });
    let rounds = 0;
    desired.current = viewMode;
    cancelAnimation(progress);
    setPlan(null);
    let settled = false;
    let frame: number | undefined;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const end = () => {
      if (epoch.current !== id) return;
      settled = true;
      progress.value = viewMode === "MONTH" ? 1 : 0;
      finish(id);
    };
    if (!active || !foreground || reduceMotion || viewMode === displayedMode) {
      end();
    } else {
      progress.value = displayedMode === "MONTH" ? 1 : 0;
      calendarPerformance.record("prepare", { epoch: id, mode: viewMode === "MONTH" ? 1 : 0 });
      timeout = setTimeout(() => {
        calendarPerformance.record("fallback", { epoch: id, round: rounds });
        end();
      }, CALENDAR_VIEW_ZOOM.measurementTimeout);
      let previousGeometry = "";
      const measure = async () => {
        if (settled || epoch.current !== id || !root.current) return;
        const finishRound = calendarPerformance.span("measure", {
          epoch: id,
          round: ++rounds,
          nodes: registry.size,
        });
        const viewport = measureCalendarRect(root.current);
        const [bounds, measured] = await Promise.all([
          viewport,
          Promise.all([...registry].map((read) => read())),
        ]);
        finishRound({ valid: measured.filter(Boolean).length });
        if (settled || epoch.current !== id) return;
        if (!bounds) {
          end();
          return;
        }
        const candidate = buildCalendarMorphPlan(
          month,
          measured.filter((node): node is MeasuredCalendarMorphNode => node !== null),
          bounds,
        );
        const signature = candidate
          ? JSON.stringify(candidate.days.map((day) => [day.from, day.to]))
          : "";
        // Let scrollToIndex and native layout settle before freezing the geometry.
        if (!candidate || !signature || signature !== previousGeometry) {
          previousGeometry = signature;
          frame = requestAnimationFrame(() => {
            void measure();
          });
          return;
        }
        if (timeout) clearTimeout(timeout);
        settled = true;
        measuring({ round: rounds });
        setPlan(candidate);
      };
      frame = requestAnimationFrame(() => {
        void measure();
      });
    }
    return () => {
      calendarPerformance.record("effect-cleanup", { epoch: id });
      epoch.current += 1;
      if (frame !== undefined) cancelAnimationFrame(frame);
      if (timeout) clearTimeout(timeout);
      cancelAnimation(progress);
    };
  }, [
    active,
    displayedMode,
    finish,
    foreground,
    height,
    month,
    progress,
    reduceMotion,
    registry,
    viewMode,
    width,
  ]);

  useEffect(() => {
    if (!plan) return;
    const id = epoch.current;
    const frame = requestAnimationFrame(() => {
      calendarPerformance.record("animation-start", { epoch: id });
      callbacks.current.onTransitionStart?.(viewMode);
      progress.value = withTiming(
        viewMode === "MONTH" ? 1 : 0,
        {
          duration: CALENDAR_VIEW_ZOOM.duration,
          easing: viewMode === "MONTH" ? Easing.linear : MOTION.easing.calm,
          reduceMotion: MOTION.reduceMotion,
        },
        (finished) => {
          if (finished) runOnJS(finish)(id);
        },
      );
    });
    // Also restore the literal end state if the native callback is lost.
    const timeout = setTimeout(() => {
      if (epoch.current !== id) return;
      progress.value = viewMode === "MONTH" ? 1 : 0;
      finish(id);
    }, CALENDAR_VIEW_ZOOM.duration + 250);
    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(timeout);
    };
  }, [finish, plan, progress, viewMode]);

  const monthStyle = useAnimatedStyle(() => ({
    opacity: plan
      ? calendarMorphPhases(progress.value, viewMode === "MONTH").monthOpacity
      : displayedMode === "MONTH"
        ? 1
        : 0,
  }));
  const yearStyle = useAnimatedStyle(() => ({
    opacity: plan
      ? calendarMorphPhases(progress.value, viewMode === "MONTH").yearOpacity
      : displayedMode === "YEAR"
        ? 1
        : 0,
  }));
  const motion = useMemo(
    () => (plan ? { month, plan, progress, toMonth: viewMode === "MONTH" } : null),
    [month, plan, progress, viewMode],
  );
  const busy = plan !== null || viewMode !== displayedMode;
  return (
    <CalendarMorphRegistry.Provider value={registry}>
      <CalendarMorphMotion.Provider value={motion}>
        <View
          ref={root}
          collapsable={false}
          style={[styles.host, { backgroundColor: palette.background }]}
          testID="calendar-transition-host"
        >
          <Animated.View
            style={[styles.fill, yearStyle]}
            pointerEvents={!busy && displayedMode === "YEAR" ? "auto" : "none"}
            accessibilityElementsHidden={busy || displayedMode !== "YEAR"}
            importantForAccessibility={
              busy || displayedMode !== "YEAR" ? "no-hide-descendants" : "auto"
            }
          >
            {yearView}
          </Animated.View>
          <Animated.View
            style={[styles.fill, monthStyle]}
            pointerEvents={!busy && displayedMode === "MONTH" ? "auto" : "none"}
            accessibilityElementsHidden={busy || displayedMode !== "MONTH"}
            importantForAccessibility={
              busy || displayedMode !== "MONTH" ? "no-hide-descendants" : "auto"
            }
          >
            {monthView}
          </Animated.View>
          {plan ? (
            <MorphOverlay plan={plan} progress={progress} toMonth={viewMode === "MONTH"} />
          ) : null}
        </View>
      </CalendarMorphMotion.Provider>
    </CalendarMorphRegistry.Provider>
  );
}

export function CalendarViewTransition({
  children,
  onLayout,
  testID,
}: PropsWithChildren<{
  readonly onLayout?: (event: LayoutChangeEvent) => void;
  readonly testID: string;
}>) {
  return (
    <View onLayout={onLayout} style={styles.scene} testID={testID}>
      <LayoutAnimationConfig skipEntering skipExiting>
        {children}
      </LayoutAnimationConfig>
    </View>
  );
}

const styles = StyleSheet.create({
  host: { flex: 1, overflow: "hidden" },
  scene: { flex: 1 },
  fill: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0 },
  day: { position: "absolute", top: 0, left: 0, alignItems: "center", justifyContent: "center" },
});
