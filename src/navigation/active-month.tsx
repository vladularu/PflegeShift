import React, { createContext, useRef, type PropsWithChildren } from "react";

import { currentMonth } from "@/engine/calendar";
import { requireLocalDate } from "@/domain/validation";

export interface ActiveMonthCoordinator {
  readonly getMonth: () => string;
  readonly setMonth: (month: string) => string;
}

export function requireActiveMonth(month: string): string {
  if (!/^\d{4}-\d{2}$/.test(month)) {
    throw new Error("Ungültiger Monat.");
  }
  return requireLocalDate(`${month}-01`).slice(0, 7);
}

export function createActiveMonthCoordinator(
  initialMonth = currentMonth(),
): ActiveMonthCoordinator {
  let activeMonth = requireActiveMonth(initialMonth);

  return Object.freeze({
    getMonth: () => activeMonth,
    setMonth: (month: string) => {
      activeMonth = requireActiveMonth(month);
      return activeMonth;
    },
  });
}

const ActiveMonthContext = createContext<ActiveMonthCoordinator | null>(null);

export function ActiveMonthProvider({ children }: PropsWithChildren) {
  const coordinator = useRef<ActiveMonthCoordinator | null>(null);
  coordinator.current ??= createActiveMonthCoordinator();

  return (
    <ActiveMonthContext value={coordinator.current}>
      {children}
    </ActiveMonthContext>
  );
}

export function useActiveMonthCoordinator(): ActiveMonthCoordinator {
  const value = React.use(ActiveMonthContext);
  if (value === null) {
    throw new Error("useActiveMonthCoordinator muss innerhalb des ActiveMonthProvider verwendet werden.");
  }
  return value;
}

export function calendarTabShouldOpenToday(calendarIsFocused: boolean): boolean {
  return calendarIsFocused;
}
