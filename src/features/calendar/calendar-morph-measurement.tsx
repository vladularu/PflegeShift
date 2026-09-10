import { createContext, useContext, useLayoutEffect, useRef } from "react";
import type { View } from "react-native";
import { useAnimatedStyle, type SharedValue } from "react-native-reanimated";
import { calendarMorphPhases } from "./calendar-morph-phases";
import type { CalendarAnchorRect } from "./calendar-layout";
import type {
  CalendarMorphNode,
  MeasuredCalendarMorphNode,
  CalendarMorphPlan,
} from "./calendar-morph-geometry";

export type MeasureCalendarNode = () => Promise<MeasuredCalendarMorphNode | null>;
export const CalendarMorphRegistry = createContext<Set<MeasureCalendarNode> | null>(null);
export const CalendarMorphMotion = createContext<{
  readonly month: string;
  readonly plan: CalendarMorphPlan;
  readonly progress: SharedValue<number>;
  readonly toMonth: boolean;
} | null>(null);

/** Entries can appear during travel; only the matched real date waits for handoff. */
export function useMorphDayStyle(date: string, enabled: boolean) {
  const morph = useContext(CalendarMorphMotion);
  const movingDate = enabled && morph?.month === date.slice(0, 7);
  return useAnimatedStyle(() => ({
    opacity:
      movingDate && morph?.toMonth
        ? calendarMorphPhases(morph.progress.value, true).realGlyphOpacity
        : 1,
  }));
}

export function measureCalendarRect(view: View | null): Promise<CalendarAnchorRect | null> {
  return new Promise((resolve) => {
    if (!view) {
      resolve(null);
      return;
    }
    try {
      view.measureInWindow((x, y, width, height) => resolve({ x, y, width, height }));
    } catch {
      // A native view may be detached between registering and measuring it.
      resolve(null);
    }
  });
}

/** Register native refs once. Measurement happens only on a requested scene transition. */
export function useCalendarMorphMeasurement(node: CalendarMorphNode, enabled = true) {
  const registry = useContext(CalendarMorphRegistry);
  const ref = useRef<View>(null);
  const latest = useRef(node);
  useLayoutEffect(() => {
    latest.current = node;
  });
  useLayoutEffect(() => {
    if (!registry || !enabled) return;
    const measure: MeasureCalendarNode = async () => {
      const descriptor = latest.current;
      const rect = await measureCalendarRect(ref.current);
      return rect ? { ...descriptor, rect } : null;
    };
    registry.add(measure);
    return () => {
      registry.delete(measure);
    };
  }, [enabled, registry]);
  return ref;
}
