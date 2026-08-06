import React, { createContext, useState, type PropsWithChildren } from "react";

import { currentMonth } from "@/engine/calendar";
import { parseMonthRouteParam } from "@/navigation/route-params";

export interface ActiveMonthCoordinator {
  readonly getMonth: () => string;
  readonly setMonth: (month: string) => string;
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

export function calendarTabShouldOpenToday(calendarIsFocused: boolean): boolean {
  return calendarIsFocused;
}
