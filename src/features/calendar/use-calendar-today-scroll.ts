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
  readonly isFocused: boolean;
  readonly months: readonly string[];
  readonly pageHeight: number;
  readonly reduceMotion: boolean | null;
  readonly resetTransientUi: () => void;
  readonly scrollToMonth: (month: string, animated?: boolean) => boolean;
  readonly setHeaderDirection: Dispatch<SetStateAction<"NEXT" | "PREVIOUS">>;
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
  isFocused,
  months,
  pageHeight,
  reduceMotion,
  resetTransientUi,
  scrollToMonth,
  setHeaderDirection,
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
      setViewMode(target.viewMode);

      if (!changesVisibleMonth || reduceMotion) {
        if (changesVisibleMonth) {
          setHeaderDirection(target.visibleMonth > visibleMonth ? "NEXT" : "PREVIOUS");
          setMonthAnchor(target.visibleMonth);
          setPagerResetRevision(requestRevision);
        }
        completeTodayScroll(scroll);
        return;
      }

      setHeaderDirection(target.visibleMonth > visibleMonth ? "NEXT" : "PREVIOUS");
      setSelectedDate(target.selectedDate);
      setSelectionVisible(false);
      setVisibleMonth(scroll.startMonth);
      activeMonthCoordinator.setMonth(scroll.startMonth);
      settledMonthRef.current = scroll.startMonth;
      setMonthAnchor(scroll.startMonth);
      setPagerResetRevision(requestRevision);
      startedTodayScrollRevision.current = null;
      setTodayScroll(scroll);
    },
    [
      activeMonthCoordinator,
      completeTodayScroll,
      reduceMotion,
      resetTransientUi,
      setHeaderDirection,
      setMonthAnchor,
      setPagerResetRevision,
      setSelectedDate,
      setSelectionVisible,
      setViewMode,
      setVisibleMonth,
      settledMonthRef,
      timeZone,
      visibleMonth,
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
      viewMode !== "MONTH" ||
      pageHeight <= 0 ||
      startedTodayScrollRevision.current === todayScroll.requestRevision ||
      months.indexOf(todayScroll.targetMonth) < 0
    ) {
      return;
    }

    startedTodayScrollRevision.current = todayScroll.requestRevision;
    const frame = requestAnimationFrame(() => {
      if (!scrollToMonth(todayScroll.targetMonth, true)) {
        startedTodayScrollRevision.current = null;
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [isFocused, months, pageHeight, scrollToMonth, todayScroll, viewMode]);

  const finishTodayScrollAtMonth = useCallback(
    (month: string): boolean => {
      if (todayScroll === null || month !== todayScroll.targetMonth) return false;
      completeTodayScroll(todayScroll);
      return true;
    },
    [completeTodayScroll, todayScroll],
  );

  return {
    finishTodayScrollAtMonth,
    todayScrollActive: todayScroll !== null,
  } as const;
}
