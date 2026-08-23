import React, {
  createContext,
  useState,
  useSyncExternalStore,
  type PropsWithChildren,
} from "react";

import { currentMonth } from "@/engine/calendar";
import { parseMonthRouteParam } from "@/navigation/route-params";

export interface ActiveMonthCoordinator {
  readonly completeTodayRequest: (revision: number) => void;
  readonly getMonth: () => string;
  readonly getTodayRequestRevision: () => number;
  readonly hasPendingTodayRequest: (revision: number) => boolean;
  readonly requestToday: () => number;
  readonly setMonth: (month: string) => string;
  readonly subscribeTodayRequests: (listener: () => void) => () => void;
}

export function requireActiveMonth(month: string): string {
  const parsed = parseMonthRouteParam(month);
  if (parsed.status !== "valid") {
    throw new Error("Ungültiger Monat.");
  }
  return parsed.value;
}

export function createActiveMonthCoordinator(
  initialMonth = currentMonth(),
): ActiveMonthCoordinator {
  let activeMonth = requireActiveMonth(initialMonth);
  let todayRequestRevision = 0;
  let completedTodayRequestRevision = 0;
  const todayRequestListeners = new Set<() => void>();

  return Object.freeze({
    completeTodayRequest: (revision: number) => {
      completedTodayRequestRevision = Math.max(
        completedTodayRequestRevision,
        Math.min(revision, todayRequestRevision),
      );
    },
    getMonth: () => activeMonth,
    getTodayRequestRevision: () => todayRequestRevision,
    hasPendingTodayRequest: (revision: number) => revision > completedTodayRequestRevision,
    requestToday: () => {
      todayRequestRevision += 1;
      for (const listener of todayRequestListeners) listener();
      return todayRequestRevision;
    },
    setMonth: (month: string) => {
      activeMonth = requireActiveMonth(month);
      return activeMonth;
    },
    subscribeTodayRequests: (listener: () => void) => {
      todayRequestListeners.add(listener);
      return () => todayRequestListeners.delete(listener);
    },
  });
}

const ActiveMonthContext = createContext<ActiveMonthCoordinator | null>(null);

export function ActiveMonthProvider({ children }: PropsWithChildren) {
  const [coordinator] = useState(createActiveMonthCoordinator);

  return <ActiveMonthContext value={coordinator}>{children}</ActiveMonthContext>;
}

export function useActiveMonthCoordinator(): ActiveMonthCoordinator {
  const value = React.use(ActiveMonthContext);
  if (value === null) {
    throw new Error(
      "useActiveMonthCoordinator muss innerhalb des ActiveMonthProvider verwendet werden.",
    );
  }
  return value;
}

export function useCalendarTodayRequestRevision(): number {
  const coordinator = useActiveMonthCoordinator();
  return useSyncExternalStore(
    coordinator.subscribeTodayRequests,
    coordinator.getTodayRequestRevision,
    coordinator.getTodayRequestRevision,
  );
}

export function calendarTabShouldOpenToday(calendarIsFocused: boolean): boolean {
  return calendarIsFocused;
}

export function requestCalendarTodayOnReselect(
  coordinator: ActiveMonthCoordinator,
  calendarIsFocused: boolean,
): boolean {
  if (!calendarTabShouldOpenToday(calendarIsFocused)) return false;
  coordinator.requestToday();
  return true;
}
