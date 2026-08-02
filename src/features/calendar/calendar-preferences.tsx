import { useSQLiteContext } from "expo-sqlite";
import React, { createContext, useCallback, useEffect, useMemo, useRef, useState, type PropsWithChildren } from "react";

import type { CalendarLabelMode, CalendarPreferencesData, CalendarViewMode } from "@/domain/types";
import {
  DEFAULT_CALENDAR_PREFERENCES,
  loadCalendarPreferences,
  saveCalendarPreferences,
} from "@/infrastructure/database/repository";

interface CalendarPreferencesValue {
  readonly viewMode: CalendarViewMode;
  readonly showShifts: boolean;
  readonly showAppointments: boolean;
  readonly showHolidays: boolean;
  readonly labelMode: CalendarLabelMode;
  readonly showShiftTimes: boolean;
  readonly showShiftDuration: boolean;
  readonly setViewMode: (mode: CalendarViewMode) => void;
  readonly setShowShifts: (value: boolean) => void;
  readonly setShowAppointments: (value: boolean) => void;
  readonly setShowHolidays: (value: boolean) => void;
  readonly setLabelMode: (value: CalendarLabelMode) => void;
  readonly setShowShiftTimes: (value: boolean) => void;
  readonly setShowShiftDuration: (value: boolean) => void;
}

const CalendarPreferencesContext = createContext<CalendarPreferencesValue | null>(null);

export function CalendarPreferencesProvider({ children }: PropsWithChildren) {
  const db = useSQLiteContext();
  const [preferences, setPreferences] = useState<CalendarPreferencesData>(
    DEFAULT_CALENDAR_PREFERENCES,
  );
  const preferencesRef = useRef<CalendarPreferencesData>(DEFAULT_CALENDAR_PREFERENCES);
  const writeQueueRef = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    let active = true;
    void loadCalendarPreferences(db).then((loaded) => {
      if (!active) return;
      preferencesRef.current = loaded;
      setPreferences(loaded);
    }).catch(() => undefined);
    return () => {
      active = false;
    };
  }, [db]);

  const update = useCallback((patch: Partial<CalendarPreferencesData>) => {
    const next = Object.freeze({ ...preferencesRef.current, ...patch });
    preferencesRef.current = next;
    setPreferences(next);
    writeQueueRef.current = writeQueueRef.current
      .then(() => saveCalendarPreferences(db, next))
      .catch(() => undefined);
  }, [db]);

  const setViewMode = useCallback((viewMode: CalendarViewMode) => update({ viewMode }), [update]);
  const setShowShifts = useCallback((showShifts: boolean) => update({ showShifts }), [update]);
  const setShowAppointments = useCallback((showAppointments: boolean) => update({ showAppointments }), [update]);
  const setShowHolidays = useCallback((showHolidays: boolean) => update({ showHolidays }), [update]);
  const setLabelMode = useCallback((labelMode: CalendarLabelMode) => update({ labelMode }), [update]);
  const setShowShiftTimes = useCallback((showShiftTimes: boolean) => update({ showShiftTimes }), [update]);
  const setShowShiftDuration = useCallback((showShiftDuration: boolean) => update({ showShiftDuration }), [update]);

  const value = useMemo<CalendarPreferencesValue>(
    () => ({
      ...preferences,
      setViewMode,
      setShowShifts,
      setShowAppointments,
      setShowHolidays,
      setLabelMode,
      setShowShiftTimes,
      setShowShiftDuration,
    }),
    [preferences, setLabelMode, setShowAppointments, setShowHolidays, setShowShiftDuration, setShowShiftTimes, setShowShifts, setViewMode],
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
