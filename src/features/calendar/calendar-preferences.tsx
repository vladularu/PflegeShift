import React, { createContext, useMemo, useState, type PropsWithChildren } from "react";

import type { CalendarViewMode } from "@/features/calendar/calendar-display";

interface CalendarPreferencesValue {
  readonly viewMode: CalendarViewMode;
  readonly showShifts: boolean;
  readonly showAppointments: boolean;
  readonly showHolidays: boolean;
  readonly setViewMode: (mode: CalendarViewMode) => void;
  readonly setShowShifts: (value: boolean) => void;
  readonly setShowAppointments: (value: boolean) => void;
  readonly setShowHolidays: (value: boolean) => void;
}

const CalendarPreferencesContext = createContext<CalendarPreferencesValue | null>(null);

export function CalendarPreferencesProvider({ children }: PropsWithChildren) {
  const [viewMode, setViewMode] = useState<CalendarViewMode>("MONTH");
  const [showShifts, setShowShifts] = useState(true);
  const [showAppointments, setShowAppointments] = useState(true);
  const [showHolidays, setShowHolidays] = useState(true);

  const value = useMemo<CalendarPreferencesValue>(
    () => ({
      viewMode,
      showShifts,
      showAppointments,
      showHolidays,
      setViewMode,
      setShowShifts,
      setShowAppointments,
      setShowHolidays,
    }),
    [showAppointments, showHolidays, showShifts, viewMode],
  );

  return (
    <CalendarPreferencesContext value={value}>
      {children}
    </CalendarPreferencesContext>
  );
}

export function useCalendarPreferences(): CalendarPreferencesValue {
  const value = React.use(CalendarPreferencesContext);
  if (value === null) {
    throw new Error("useCalendarPreferences muss innerhalb des CalendarPreferencesProvider verwendet werden.");
  }
  return value;
}
