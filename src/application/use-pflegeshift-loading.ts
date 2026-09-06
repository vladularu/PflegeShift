import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";

import type { PflegeShiftPorts } from "@/application/pflegeshift-ports";
import { reconcileCalendarRange } from "@/application/calendar-entry-loading";
import { reconcileLoadedEntryNotifications } from "@/application/pflegeshift-notifications";
import {
  entryRangeForYear,
  loadPflegeShiftSnapshot,
  type CalendarEntryRange,
  type PflegeShiftSnapshot,
} from "@/application/pflegeshift-snapshot";
import { DATA_LOAD_FAILURE_MESSAGE } from "@/domain/errors";
import type { CalendarEntry } from "@/domain/types";
import { calendarPerformance } from "./calendar-performance";

export function usePflegeShiftLoading(
  activeMonth: string,
  ports: PflegeShiftPorts,
  entries: readonly CalendarEntry[],
  setEntries: Dispatch<SetStateAction<readonly CalendarEntry[]>>,
  applySnapshot: (snapshot: PflegeShiftSnapshot) => void,
  publishNotificationWarning: (message: string) => void,
) {
  const { repository, diagnostics, notifications } = ports;
  const activeYear = Number(activeMonth.slice(0, 4));
  const range = useMemo(() => entryRangeForYear(activeYear), [activeYear]);
  const rangeKey = `${range.startDate}:${range.endDate}`;
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const [calendarRange, setCalendarRange] = useState<CalendarEntryRange | null>(null);
  const [error, setError] = useState<string | null>(null);
  const initialized = useRef(false);
  const sequence = useRef(0);
  const currentEntries = useRef(entries);
  const deletedDuringLoad = useRef(new Set<string>());
  const recordDeletion = useCallback((entry: CalendarEntry) => {
    deletedDuringLoad.current.add(`${entry.kind}:${entry.id}`);
  }, []);
  useEffect(() => {
    currentEntries.current = entries;
  }, [entries]);

  const load = useCallback(
    async (full: boolean) => {
      const revision = ++sequence.current;
      const finishTiming = calendarPerformance.span("load-end", {
        load: revision,
        full: full ? 1 : 0,
      });
      calendarPerformance.record("load-start", {
        load: revision,
        month: (Number(range.startDate.slice(0, 4)) + 1) * 100,
      });
      const before = currentEntries.current;
      const deleted = new Set<string>();
      deletedDuringLoad.current = deleted;
      if (full) {
        initialized.current = false;
        setLoadedKey(null);
        setCalendarRange(null);
      }
      setError(null);
      try {
        if (full || !initialized.current) {
          const snapshot = await loadPflegeShiftSnapshot(repository, range);
          if (revision !== sequence.current) {
            calendarPerformance.record("load-discard", { load: revision });
            return;
          }
          applySnapshot(snapshot);
          initialized.current = true;
          void reconcileLoadedEntryNotifications(
            snapshot.entries,
            snapshot.profile?.timeZone ?? "Europe/Berlin",
            {
              notifications,
              diagnostics,
            },
          ).then((failed) => {
            if (revision === sequence.current && failed)
              publishNotificationWarning(
                "Erinnerungen konnten nicht vollständig aktualisiert werden.",
              );
          });
        } else {
          const loaded = await repository.listCalendarEntries(range.startDate, range.endDate);
          if (revision !== sequence.current) {
            calendarPerformance.record("load-discard", { load: revision });
            return;
          }
          setEntries((current) => reconcileCalendarRange(loaded, before, current, range, deleted));
        }
        setCalendarRange(range);
      } catch (loadError) {
        calendarPerformance.record("load-error", { load: revision });
        if (revision !== sequence.current) return;
        diagnostics.record("provider", "PROVIDER_RELOAD_FAILED", loadError);
        setError(DATA_LOAD_FAILURE_MESSAGE);
      } finally {
        finishTiming();
        if (revision === sequence.current) setLoadedKey(rangeKey);
      }
    },
    [
      applySnapshot,
      diagnostics,
      notifications,
      publishNotificationWarning,
      range,
      rangeKey,
      repository,
      setEntries,
    ],
  );

  useEffect(() => {
    void load(false);
    return () => {
      sequence.current += 1;
    };
  }, [load]);
  const reload = useCallback(() => load(true), [load]);
  return { ready: loadedKey === rangeKey, calendarRange, error, reload, recordDeletion };
}
