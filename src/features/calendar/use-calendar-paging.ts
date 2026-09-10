import { useCallback, type Dispatch, type SetStateAction, type RefObject } from "react";
import type { NativeScrollEvent, NativeSyntheticEvent } from "react-native";
import type { ActiveMonthCoordinator } from "@/navigation/active-month";
import { clampDateToMonth } from "./calendar-metrics";
import { monthAtPagerOffset, shouldRecenterMonthWindow } from "./month-window";
import { selectionFeedback } from "@/ui/haptics";
import { calendarPerformance } from "@/application/calendar-performance";

export function useCalendarPaging({
  months,
  pageHeight,
  visibleMonth,
  viewMode,
  isTransitionInFlight,
  monthSelectionPending,
  settledMonthRef,
  activeMonthCoordinator,
  finishTodayScrollAtMonth,
  clearPopup,
  setHeaderDirection,
  setHeaderTransition,
  setVisibleMonth,
  setSelectedDate,
  setSelectionVisible,
  setMonthAnchor,
}: {
  months: readonly string[];
  pageHeight: number;
  visibleMonth: string;
  viewMode: "MONTH" | "YEAR";
  isTransitionInFlight: () => boolean;
  monthSelectionPending: RefObject<boolean>;
  settledMonthRef: RefObject<string>;
  activeMonthCoordinator: ActiveMonthCoordinator;
  finishTodayScrollAtMonth: (month: string) => boolean;
  clearPopup: () => void;
  setHeaderDirection: Dispatch<SetStateAction<"NEXT" | "PREVIOUS">>;
  setHeaderTransition: Dispatch<SetStateAction<"SPATIAL" | "CROSSFADE">>;
  setVisibleMonth: Dispatch<SetStateAction<string>>;
  setSelectedDate: Dispatch<SetStateAction<string>>;
  setSelectionVisible: Dispatch<SetStateAction<boolean>>;
  setMonthAnchor: Dispatch<SetStateAction<string>>;
}) {
  const eventMonth = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      if (viewMode !== "MONTH" || isTransitionInFlight() || monthSelectionPending.current)
        return null;
      return monthAtPagerOffset(months, pageHeight, event.nativeEvent.contentOffset.y);
    },
    [months, pageHeight, viewMode, isTransitionInFlight, monthSelectionPending],
  );

  const trackPaging = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const month = eventMonth(event);
      if (!month || month === visibleMonth) return;
      clearPopup();
      setHeaderDirection(month > visibleMonth ? "NEXT" : "PREVIOUS");
      setHeaderTransition("SPATIAL");
      setVisibleMonth(month);
      setSelectedDate((date) => clampDateToMonth(date, month));
      setSelectionVisible(false);
    },
    [
      eventMonth,
      visibleMonth,
      clearPopup,
      setHeaderDirection,
      setHeaderTransition,
      setVisibleMonth,
      setSelectedDate,
      setSelectionVisible,
    ],
  );

  const finishPaging = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const month = eventMonth(event);
      if (!month) return;
      clearPopup();
      if (finishTodayScrollAtMonth(month)) return;
      const didChangeMonth = settledMonthRef.current !== month;
      calendarPerformance.record("scroll-end", { month: Number(month.replace("-", "")) });
      settledMonthRef.current = month;
      setVisibleMonth(month);
      activeMonthCoordinator.setMonth(month);
      if (didChangeMonth) {
        setSelectedDate((date) => clampDateToMonth(date, month));
        setSelectionVisible(false);
      }
      if (shouldRecenterMonthWindow(months, month)) setMonthAnchor(month);
      if (didChangeMonth) selectionFeedback();
    },
    [
      eventMonth,
      clearPopup,
      finishTodayScrollAtMonth,
      settledMonthRef,
      setVisibleMonth,
      activeMonthCoordinator,
      setSelectedDate,
      setSelectionVisible,
      months,
      setMonthAnchor,
    ],
  );
  return { trackPaging, finishPaging };
}
