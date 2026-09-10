import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";

import { today } from "@/engine/calendar";
import { calendarTodayTarget } from "@/features/calendar/calendar-layout";
import { boundedMonthScrollStart } from "@/features/calendar/month-window";
import {
  useCalendarTodayRequestRevision,
  type ActiveMonthCoordinator,
} from "@/navigation/active-month";
import { selectionFeedback } from "@/ui/haptics";

interface TodayScrollState {
  readonly requestRevision: number;
  readonly startMonth: string;
  readonly targetDate: string;
  readonly targetMonth: string;
}

interface CalendarTodayScrollOptions {
  readonly activeMonthCoordinator: ActiveMonthCoordinator;
  readonly pagerReady: boolean;
  readonly isFocused: boolean;
  readonly months: readonly string[];
  readonly pageHeight: number;
  readonly reduceMotion: boolean | null;
  readonly resetTransientUi: () => void;
  readonly scrollToMonth: (month: string, animated?: boolean) => boolean;
  readonly setHeaderDirection: Dispatch<SetStateAction<"NEXT" | "PREVIOUS">>;
  readonly setHeaderTransition: Dispatch<SetStateAction<"SPATIAL" | "CROSSFADE">>;
  readonly setMonthAnchor: Dispatch<SetStateAction<string>>;
  readonly setPagerResetRevision: Dispatch<SetStateAction<number>>;
  readonly setSelectedDate: Dispatch<SetStateAction<string>>;
  readonly setSelectionVisible: Dispatch<SetStateAction<boolean>>;
  readonly setViewMode: (viewMode: "MONTH") => void;
  readonly setVisibleMonth: Dispatch<SetStateAction<string>>;
  readonly settledMonthRef: { current: string };
  readonly timeZone: string;
  readonly viewMode: "MONTH" | "YEAR";
  readonly visibleMonth: string;
}

export function useCalendarTodayScroll({
  activeMonthCoordinator,
  pagerReady,
  isFocused,
  months,
  pageHeight,
  reduceMotion,
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
  timeZone,
  viewMode,
  visibleMonth,
}: CalendarTodayScrollOptions) {
  const todayRequestRevision = useCalendarTodayRequestRevision();
  const [todayScroll, setTodayScroll] = useState<TodayScrollState | null>(null);
  const startedTodayScrollRevision = useRef<number | null>(null);

  const completeTodayScroll = useCallback(
    (scroll: TodayScrollState) => {
      setSelectedDate(scroll.targetDate);
      setSelectionVisible(true);
      setVisibleMonth(scroll.targetMonth);
      activeMonthCoordinator.setMonth(scroll.targetMonth);
      settledMonthRef.current = scroll.targetMonth;
      startedTodayScrollRevision.current = null;
      setTodayScroll(null);
      activeMonthCoordinator.completeTodayRequest(scroll.requestRevision);
      selectionFeedback();
    },
    [
      activeMonthCoordinator,
      setSelectedDate,
      setSelectionVisible,
      setVisibleMonth,
      settledMonthRef,
    ],
  );

  const goToToday = useCallback(
    (requestRevision: number) => {
      const target = calendarTodayTarget(today(timeZone));
      const changesVisibleMonth = target.visibleMonth !== visibleMonth;
      const scroll: TodayScrollState = {
        requestRevision,
        startMonth: boundedMonthScrollStart(visibleMonth, target.visibleMonth),
        targetDate: target.selectedDate,
        targetMonth: target.visibleMonth,
      };

      resetTransientUi();
      setHeaderTransition(viewMode === "MONTH" ? "SPATIAL" : "CROSSFADE");
      setViewMode(target.viewMode);
      // A live native swipe can differ from the committed month (even within
      // the same page). Every Today request must cancel that gesture/preview.
      setPagerResetRevision((revision) => revision + 1);

      if (!changesVisibleMonth || reduceMotion) {
        if (changesVisibleMonth || todayScroll !== null) {
          setHeaderDirection(target.visibleMonth > visibleMonth ? "NEXT" : "PREVIOUS");
          setMonthAnchor(target.visibleMonth);
        }
        completeTodayScroll(scroll);
        return;
      }

      setHeaderDirection(target.visibleMonth > visibleMonth ? "NEXT" : "PREVIOUS");
      setSelectedDate(target.selectedDate);
      setSelectionVisible(false);
      setVisibleMonth(scroll.startMonth);
      // Load the destination once; intermediate animation pages stay local.
      activeMonthCoordinator.setMonth(scroll.targetMonth);
      settledMonthRef.current = scroll.targetMonth;
      setMonthAnchor(scroll.startMonth);
      startedTodayScrollRevision.current = null;
      setTodayScroll(scroll);
    },
    [
      activeMonthCoordinator,
      completeTodayScroll,
      reduceMotion,
      resetTransientUi,
      setHeaderDirection,
      setHeaderTransition,
      setMonthAnchor,
      setPagerResetRevision,
      setSelectedDate,
      setSelectionVisible,
      setViewMode,
      setVisibleMonth,
      settledMonthRef,
      timeZone,
      todayScroll,
      visibleMonth,
      viewMode,
    ],
  );

  useEffect(() => {
    if (
      !isFocused ||
      todayScroll?.requestRevision === todayRequestRevision ||
      !activeMonthCoordinator.hasPendingTodayRequest(todayRequestRevision)
    ) {
      return;
    }
    goToToday(todayRequestRevision);
  }, [activeMonthCoordinator, goToToday, isFocused, todayRequestRevision, todayScroll]);

  useEffect(() => {
    if (
      todayScroll === null ||
      !isFocused ||
      !pagerReady ||
      viewMode !== "MONTH" ||
      pageHeight <= 0 ||
      startedTodayScrollRevision.current === todayScroll.requestRevision ||
      months.indexOf(todayScroll.targetMonth) < 0
    ) {
      return;
    }

    const frame = requestAnimationFrame(() => {
      if (scrollToMonth(todayScroll.targetMonth, true))
        startedTodayScrollRevision.current = todayScroll.requestRevision;
    });
    // Native momentum completion can be lost when a pager is remounted or blurred.
    const fallback = setTimeout(() => {
      if (scrollToMonth(todayScroll.targetMonth, false)) completeTodayScroll(todayScroll);
    }, 1500);
    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(fallback);
      startedTodayScrollRevision.current = null;
    };
  }, [
    completeTodayScroll,
    isFocused,
    months,
    pageHeight,
    pagerReady,
    scrollToMonth,
    todayScroll,
    viewMode,
  ]);

  const finishTodayScrollAtMonth = useCallback(
    (month: string): boolean => {
      if (todayScroll === null) return false;
      if (month === todayScroll.targetMonth) completeTodayScroll(todayScroll);
      return true;
    },
    [completeTodayScroll, todayScroll],
  );

  return {
    finishTodayScrollAtMonth,
    todayScrollActive: todayScroll !== null,
  } as const;
}
