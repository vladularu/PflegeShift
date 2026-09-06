import { useCallback, useEffect, useLayoutEffect, useMemo, useSyncExternalStore } from "react";
import { AppState } from "react-native";
import { runOnJS, useFrameCallback, useSharedValue, type FrameInfo } from "react-native-reanimated";
import { calendarPerformance } from "@/application/calendar-performance";
import type { CalendarEntry } from "@/domain/types";
import { createMonthGrid } from "@/engine/calendar";
import { expandCalendarEntries } from "@/engine/recurrence";
import { buildCalendarEntryIndex } from "./calendar-entry-index";

export function useMeasuredCalendarEntries(
  entries: readonly CalendarEntry[],
  months: readonly string[],
  showAppointments: boolean,
  showShifts: boolean,
) {
  const expanded = useMemo(() => {
    const finish = calendarPerformance.span("expand", {
      input: entries.length,
      series: calendarPerformance.getSnapshot()
        ? entries.filter((entry) => entry.kind === "APPOINTMENT" && entry.recurrence != null).length
        : 0,
    });
    const first = createMonthGrid(months[0])[0].date;
    const last = createMonthGrid(months[months.length - 1]).at(-1)!.date;
    const result = expandCalendarEntries(entries, first, last);
    finish({ output: result.length });
    return result;
  }, [entries, months]);
  return useMemo(() => {
    const finish = calendarPerformance.span("index", { input: expanded.length });
    const result = buildCalendarEntryIndex(expanded, { showAppointments, showShifts });
    finish({ output: result.visibleEntries.length });
    return result;
  }, [expanded, showAppointments, showShifts]);
}

function recordFrames(
  session: number,
  duration: number,
  count: number,
  maximum: number,
  over17: number,
  over34: number,
  over50: number,
) {
  calendarPerformance.record(
    "ui-frames",
    { duration, count, maximum, over17, over34, over50 },
    session,
  );
}

/** UI-runtime cadence only; never infer GPU presentation or touch latency from it. */
export function useCalendarPerformance(active: boolean, month: string, mode: string) {
  const session = useSyncExternalStore(
    calendarPerformance.subscribe,
    calendarPerformance.getSnapshot,
    () => 0,
  );
  const sampling = useSharedValue(0);
  const bucket = useSharedValue([0, 0, 0, 0, 0, 0]);
  const onFrame = useCallback(
    (frame: FrameInfo) => {
      "worklet";
      if (!sampling.value) return;
      const b = bucket.value;
      if (!b[0] || frame.timeSincePreviousFrame === null) {
        bucket.set([frame.timestamp, 0, 0, 0, 0, 0]);
        return;
      }
      const gap = frame.timeSincePreviousFrame;
      const next = [
        b[0],
        b[1] + 1,
        Math.max(b[2], gap),
        b[3] + (gap > 17 ? 1 : 0),
        b[4] + (gap > 34 ? 1 : 0),
        b[5] + (gap > 50 ? 1 : 0),
      ];
      if (frame.timestamp - b[0] >= 1000) {
        runOnJS(recordFrames)(
          sampling.value,
          frame.timestamp - b[0],
          next[1],
          next[2],
          next[3],
          next[4],
          next[5],
        );
        bucket.set([frame.timestamp, 0, 0, 0, 0, 0]);
      } else bucket.set(next);
    },
    [bucket, sampling],
  );
  const frames = useFrameCallback(onFrame, false);
  useEffect(() => {
    const update = (state: string) => {
      const enabled = Boolean(session && active && state === "active");
      bucket.set([0, 0, 0, 0, 0, 0]);
      sampling.set(enabled ? session : 0);
      frames.setActive(enabled);
    };
    update(AppState.currentState);
    const listener = AppState.addEventListener("change", update);
    return () => {
      listener.remove();
      sampling.set(0);
      frames.setActive(false);
    };
  }, [active, bucket, frames, sampling, session]);
  useLayoutEffect(() => {
    calendarPerformance.record("commit", {
      month: Number(month.replace("-", "")),
      mode: mode === "MONTH" ? 1 : 0,
    });
  });
}
