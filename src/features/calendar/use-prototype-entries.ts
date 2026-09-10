import { useCallback, useEffect, useRef, useState } from "react";
import { useSQLiteContext } from "expo-sqlite";
import type { CalendarEntry } from "@/domain/types";
import { listCalendarEntries } from "@/infrastructure/database/repository";
import { expandCalendarEntries } from "@/engine/recurrence";

const EMPTY: readonly CalendarEntry[] = Object.freeze([]);

/** Read-only, route-local cache. Never changes the main calendar's active month. */
export function usePrototypeEntries(year: string, active: boolean) {
  const db = useSQLiteContext();
  const cache = useRef(new Map<string, readonly CalendarEntry[]>());
  const [result, setResult] = useState({ year: "", entries: EMPTY, error: false });
  const [revision, setRevision] = useState(0);
  const retry = useCallback(() => setRevision((value) => value + 1), []);

  // Leaving/backgrounding the prototype invalidates snapshots before re-entry.
  useEffect(() => {
    cache.current.clear();
    setResult({ year: "", entries: EMPTY, error: false });
  }, [db, active]);

  useEffect(() => {
    if (!active) return;
    let current = true;
    const cached = cache.current.get(year);
    if (cached) {
      setResult({ year, entries: cached, error: false });
      return;
    }
    setResult({ year: "", entries: EMPTY, error: false });
    const start = `${year}-01-01`;
    const end = `${year}-12-31`;
    void listCalendarEntries(db, start, end)
      .then((entries) => {
        if (!current) return;
        const expanded = expandCalendarEntries(entries, start, end);
        cache.current.set(year, expanded);
        while (cache.current.size > 3) cache.current.delete(cache.current.keys().next().value!);
        setResult({ year, entries: expanded, error: false });
      })
      .catch(() => {
        if (current) setResult({ year, entries: EMPTY, error: true });
      });
    return () => {
      current = false;
    };
  }, [active, db, revision, year]);

  const ready = active && result.year === year;
  return {
    entries: ready ? result.entries : EMPTY,
    loading: !ready,
    error: ready && result.error,
    retry,
  };
}
