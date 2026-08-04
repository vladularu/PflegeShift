import { useSQLiteContext } from "expo-sqlite";
import React, {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PropsWithChildren,
} from "react";

import type { CalendarLabelMode, CalendarPreferencesData, CalendarViewMode } from "@/domain/types";
import { userFacingErrorMessage } from "@/domain/errors";
import {
  DEFAULT_CALENDAR_PREFERENCES,
  loadCalendarPreferences,
  saveCalendarPreferences,
} from "@/infrastructure/database/repository";
import { recordDiagnostic } from "@/infrastructure/diagnostics";

interface CalendarPreferencesValue {
  readonly viewMode: CalendarViewMode;
  readonly showShifts: boolean;
  readonly showAppointments: boolean;
  readonly showHolidays: boolean;
  readonly labelMode: CalendarLabelMode;
  readonly showShiftTimes: boolean;
  readonly showShiftDuration: boolean;
  readonly error: string | null;
  readonly saving: boolean;
  readonly retry: () => void;
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
  const persistedPreferencesRef = useRef<CalendarPreferencesData>(DEFAULT_CALENDAR_PREFERENCES);
  const failedPreferencesRef = useRef<CalendarPreferencesData | null>(null);
  const writeQueueRef = useRef<Promise<void>>(Promise.resolve());
  const updateVersionRef = useRef(0);
  const mountedRef = useRef(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const load = useCallback(async () => {
    const expectedVersion = updateVersionRef.current;
    try {
      const loaded = await loadCalendarPreferences(db);
      if (!mountedRef.current || updateVersionRef.current !== expectedVersion) return;
      preferencesRef.current = loaded;
      persistedPreferencesRef.current = loaded;
      failedPreferencesRef.current = null;
      setPreferences(loaded);
      setError(null);
    } catch (loadError) {
      recordDiagnostic("preferences", "CALENDAR_PREFERENCES_LOAD_FAILED", loadError);
      if (!mountedRef.current || updateVersionRef.current !== expectedVersion) return;
      failedPreferencesRef.current = null;
      setError(userFacingErrorMessage(loadError, "Kalenderansicht konnte nicht geladen werden."));
    }
  }, [db]);

  useEffect(() => {
    void load();
  }, [load]);

  const persist = useCallback(
    (snapshot: CalendarPreferencesData) => {
      setSaving(true);
      setError(null);
      writeQueueRef.current = writeQueueRef.current.then(async () => {
        try {
          await saveCalendarPreferences(db, snapshot);
          persistedPreferencesRef.current = snapshot;
          if (!mountedRef.current || preferencesRef.current !== snapshot) return;
          failedPreferencesRef.current = null;
          setSaving(false);
          setError(null);
        } catch (saveError) {
          recordDiagnostic("preferences", "CALENDAR_PREFERENCES_SAVE_FAILED", saveError);
          if (!mountedRef.current || preferencesRef.current !== snapshot) return;
          failedPreferencesRef.current = snapshot;
          preferencesRef.current = persistedPreferencesRef.current;
          setPreferences(persistedPreferencesRef.current);
          setSaving(false);
          setError(
            userFacingErrorMessage(saveError, "Kalenderansicht konnte nicht gespeichert werden."),
          );
        }
      });
    },
    [db],
  );

  const update = useCallback(
    (patch: Partial<CalendarPreferencesData>) => {
      updateVersionRef.current += 1;
      const next = Object.freeze({ ...preferencesRef.current, ...patch });
      preferencesRef.current = next;
      setPreferences(next);
      persist(next);
    },
    [persist],
  );

  const retry = useCallback(() => {
    const failed = failedPreferencesRef.current;
    if (failed === null) {
      void load();
      return;
    }
    updateVersionRef.current += 1;
    preferencesRef.current = failed;
    setPreferences(failed);
    persist(failed);
  }, [load, persist]);

  const setViewMode = useCallback((viewMode: CalendarViewMode) => update({ viewMode }), [update]);
  const setShowShifts = useCallback((showShifts: boolean) => update({ showShifts }), [update]);
  const setShowAppointments = useCallback(
    (showAppointments: boolean) => update({ showAppointments }),
    [update],
  );
  const setShowHolidays = useCallback(
    (showHolidays: boolean) => update({ showHolidays }),
    [update],
  );
  const setLabelMode = useCallback(
    (labelMode: CalendarLabelMode) => update({ labelMode }),
    [update],
  );
  const setShowShiftTimes = useCallback(
    (showShiftTimes: boolean) => update({ showShiftTimes }),
    [update],
  );
  const setShowShiftDuration = useCallback(
    (showShiftDuration: boolean) => update({ showShiftDuration }),
    [update],
  );

  const value = useMemo<CalendarPreferencesValue>(
    () => ({
      ...preferences,
      error,
      saving,
      retry,
      setViewMode,
      setShowShifts,
      setShowAppointments,
      setShowHolidays,
      setLabelMode,
      setShowShiftTimes,
      setShowShiftDuration,
    }),
    [
      error,
      preferences,
      retry,
      saving,
      setLabelMode,
      setShowAppointments,
      setShowHolidays,
      setShowShiftDuration,
      setShowShiftTimes,
      setShowShifts,
      setViewMode,
    ],
  );

  return <CalendarPreferencesContext value={value}>{children}</CalendarPreferencesContext>;
}

export function useCalendarPreferences(): CalendarPreferencesValue {
  const value = React.use(CalendarPreferencesContext);
  if (value === null) {
    throw new Error(
      "useCalendarPreferences muss innerhalb des CalendarPreferencesProvider verwendet werden.",
    );
  }
  return value;
}
