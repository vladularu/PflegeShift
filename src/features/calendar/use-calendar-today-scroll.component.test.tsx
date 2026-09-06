import { act, renderHook } from "@testing-library/react-native";
import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import { useMemo, useRef, useState } from "react";

import { useCalendarTodayScroll } from "@/features/calendar/use-calendar-today-scroll";
import { createMonthWindow } from "@/features/calendar/month-window";
import { createActiveMonthCoordinator } from "@/navigation/active-month";

let mockRequestRevision = 1;
jest.mock("@/navigation/active-month", () => ({
  ...jest.requireActual<typeof import("@/navigation/active-month")>("@/navigation/active-month"),
  useCalendarTodayRequestRevision: () => mockRequestRevision,
}));
jest.mock("@/engine/calendar", () => ({
  ...jest.requireActual<typeof import("@/engine/calendar")>("@/engine/calendar"),
  today: () => "2027-01-15",
}));

describe("Today scroll lifecycle", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    mockRequestRevision = 1;
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  function setup(
    initialMonth = "2024-12",
    initialView: "MONTH" | "YEAR" = "MONTH",
    reduced = false,
  ) {
    const coordinator = createActiveMonthCoordinator(initialMonth);
    coordinator.requestToday();
    const scrollToMonth = jest.fn(() => true);
    const resetTransientUi = jest.fn();
    const useHarness = (props: { ready: boolean; focused: boolean }) => {
      const [month, setVisibleMonth] = useState(initialMonth);
      const [anchor, setMonthAnchor] = useState(initialMonth);
      const [viewMode, setViewMode] = useState(initialView);
      const [selected, setSelectedDate] = useState("");
      const [selection, setSelectionVisible] = useState(false);
      const [, setHeaderDirection] = useState<"NEXT" | "PREVIOUS">("NEXT");
      const [, setHeaderTransition] = useState<"SPATIAL" | "CROSSFADE">("SPATIAL");
      const [, setPagerResetRevision] = useState(0);
      const settledMonthRef = useRef(initialMonth);
      const months = useMemo(() => createMonthWindow(anchor, 24, 36), [anchor]);
      const scroll = useCalendarTodayScroll({
        activeMonthCoordinator: coordinator,
        pagerReady: props.ready,
        isFocused: props.focused,
        months,
        pageHeight: 700,
        reduceMotion: reduced,
        resetTransientUi,
        scrollToMonth,
        setHeaderDirection,
        setHeaderTransition,
        setMonthAnchor,
        setPagerResetRevision,
        setSelectedDate,
        setSelectionVisible,
        setViewMode,
        setVisibleMonth,
        settledMonthRef,
        timeZone: "Europe/Berlin",
        viewMode,
        visibleMonth: month,
      });
      return { ...scroll, month, selected, selection, viewMode };
    };
    return { coordinator, hook: useHarness, scrollToMonth };
  }

  it("waits for the pager after a distant-year data load, then recovers a missing momentum event", async () => {
    const { hook, scrollToMonth, coordinator } = setup();
    const screen = await renderHook(hook, { initialProps: { ready: false, focused: true } });
    await act(async () => jest.advanceTimersByTime(2000));
    expect(scrollToMonth).not.toHaveBeenCalled();
    expect(coordinator.hasPendingTodayRequest(1)).toBe(true);
    await screen.rerender({ ready: true, focused: true });
    await act(async () => jest.advanceTimersByTime(32));
    expect(scrollToMonth).toHaveBeenCalledWith("2027-01", true);
    await act(async () => jest.advanceTimersByTime(1500));
    expect(scrollToMonth).toHaveBeenLastCalledWith("2027-01", false);
    expect(screen.result.current).toMatchObject({
      month: "2027-01",
      selected: "2027-01-15",
      selection: true,
      todayScrollActive: false,
    });
    expect(coordinator.hasPendingTodayRequest(1)).toBe(false);
  });

  it("resumes an interrupted request after returning to the calendar", async () => {
    const { hook, scrollToMonth } = setup();
    const screen = await renderHook(hook, { initialProps: { ready: true, focused: true } });
    await act(async () => jest.advanceTimersByTime(32));
    await screen.rerender({ ready: true, focused: false });
    scrollToMonth.mockClear();
    await act(async () => jest.advanceTimersByTime(2000));
    expect(scrollToMonth).not.toHaveBeenCalled();
    await screen.rerender({ ready: true, focused: true });
    await act(async () => jest.advanceTimersByTime(32));
    expect(scrollToMonth).toHaveBeenCalledWith("2027-01", true);
    await act(async () => screen.result.current.finishTodayScrollAtMonth("2027-01"));
    expect(screen.result.current.todayScrollActive).toBe(false);
  });

  it("completes the latest repeated tab press and cancels the older fallback", async () => {
    const { hook, coordinator } = setup();
    const screen = await renderHook(hook, { initialProps: { ready: true, focused: true } });
    await act(async () => jest.advanceTimersByTime(32));
    mockRequestRevision = coordinator.requestToday();
    await screen.rerender({ ready: true, focused: true });
    await act(async () => screen.result.current.finishTodayScrollAtMonth("2027-01"));
    await act(async () => jest.advanceTimersByTime(2000));
    expect(coordinator.hasPendingTodayRequest(2)).toBe(false);
    expect(screen.result.current).toMatchObject({ month: "2027-01", todayScrollActive: false });
  });

  it.each([false, true])("returns from the year view with reduced motion = %s", async (reduced) => {
    const { hook, scrollToMonth } = setup("2029-06", "YEAR", reduced);
    const screen = await renderHook(hook, { initialProps: { ready: true, focused: true } });
    await act(async () => jest.advanceTimersByTime(1600));
    expect(screen.result.current).toMatchObject({
      month: "2027-01",
      selected: "2027-01-15",
      viewMode: "MONTH",
      todayScrollActive: false,
    });
    if (reduced) expect(scrollToMonth).not.toHaveBeenCalled();
  });
});
