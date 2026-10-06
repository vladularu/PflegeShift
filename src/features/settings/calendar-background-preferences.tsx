import {
  DEFAULT_CALENDAR_IMAGE_STRENGTH,
  type CalendarImageStrength,
} from "@/theme/calendar-image";
import { CalendarBackgroundContext } from "./calendar-background-context";
import * as storage from "./calendar-background-storage";
import * as picker from "expo-image-picker";
import { useEffect, useRef, useState, type PropsWithChildren } from "react";
import { Platform } from "react-native";
import { useSQLiteContext } from "expo-sqlite";
import { recordDiagnostic } from "@/infrastructure/diagnostics";
export { useCalendarBackground } from "./calendar-background-context";

export function CalendarBackgroundProvider({ children }: PropsWithChildren) {
  const db = useSQLiteContext();
  const [uri, setUri] = useState<string | null>(null);
  const [strength, setStrength] = useState<CalendarImageStrength>(DEFAULT_CALENDAR_IMAGE_STRENGTH);
  const [removedUri, setRemovedUri] = useState<string | null>(null);
  const removed = useRef<string | null>(null);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadRevision, setLoadRevision] = useState(0);
  const locked = useRef(false);
  const mounted = useRef(true);
  const current = useRef<string | null>(null);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    let active = true;
    if (Platform.OS === "web") {
      setReady(true);
      return;
    }
    setReady(false);
    void Promise.all([
      storage.loadCalendarBackground(db),
      storage.loadCalendarBackgroundStrength(db),
      storage.loadRemovedCalendarBackground(db),
    ])
      .then(([loaded, loadedStrength, loadedRemoved]) => {
        if (!active) return;
        current.current = loaded;
        setUri(loaded);
        setStrength(loadedStrength);
        removed.current = loadedRemoved;
        setRemovedUri(loadedRemoved);
        setError(null);
        setReady(true);
      })
      .catch((cause) => {
        recordDiagnostic("preferences", "CALENDAR_BACKGROUND_LOAD_FAILED", cause);
        if (active) setError("Kalenderbild konnte nicht geladen werden.");
      });
    return () => {
      active = false;
    };
  }, [db, loadRevision]);

  function cleanup(uri: string | null) {
    if (!uri) return;
    try {
      storage.deleteCalendarBackground(uri);
    } catch (cause) {
      recordDiagnostic("preferences", "CALENDAR_BACKGROUND_CLEANUP_FAILED", cause);
    }
  }

  async function change(action: "choose" | "remove" | "undo" | "reset"): Promise<boolean> {
    if (locked.current || !ready || Platform.OS === "web") return false;
    if ((action === "undo" && !removed.current) || (action === "remove" && !current.current))
      return false;
    locked.current = true;
    setBusy(true);
    setError(null);
    let imported: string | null = null;
    let saved = false;
    try {
      if (action === "choose") {
        const result = await picker.launchImageLibraryAsync({
          mediaTypes: ["images"],
          allowsMultipleSelection: false,
          allowsEditing: false,
          quality: 0.8,
          exif: false,
        });
        if (result.canceled) return false;
        imported = await storage.importCalendarBackground(result.assets[0]);
      }
      const previous = current.current;
      const previousRemoved = removed.current;
      const next = action === "undo" ? previousRemoved : imported;
      const nextRemoved = action === "remove" ? previous : null;
      await storage.saveCalendarBackgroundChange(db, next, nextRemoved, action === "reset");
      saved = true;
      current.current = next;
      removed.current = nextRemoved;
      if (mounted.current) {
        setUri(next);
        setRemovedUri(nextRemoved);
        if (action === "reset") setStrength(DEFAULT_CALENDAR_IMAGE_STRENGTH);
      }
      for (const old of new Set([previous, previousRemoved]))
        if (old !== next && old !== nextRemoved) cleanup(old);
      return true;
    } catch (cause) {
      recordDiagnostic("preferences", "CALENDAR_BACKGROUND_SAVE_FAILED", cause);
      if (mounted.current)
        setError(
          action === "choose"
            ? "Kalenderbild konnte nicht gespeichert werden. Bitte versuche es erneut oder wähle ein kleineres Bild (max. 20 MB)."
            : "Kalenderhintergrund konnte nicht gespeichert werden. Die bisherige Auswahl bleibt erhalten.",
        );
      return false;
    } finally {
      if (imported && !saved) cleanup(imported);
      locked.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  async function changeStrength(next: CalendarImageStrength) {
    if (locked.current || !ready || !current.current || Platform.OS === "web" || next === strength)
      return;
    locked.current = true;
    setBusy(true);
    setError(null);
    const previousStrength = strength;
    setStrength(next);
    try {
      await storage.saveCalendarBackgroundStrength(db, next);
      if (mounted.current) setStrength(next);
    } catch (cause) {
      recordDiagnostic("preferences", "CALENDAR_BACKGROUND_STRENGTH_SAVE_FAILED", cause);
      if (mounted.current) setStrength(previousStrength);
      if (mounted.current)
        setError(
          "Bildstärke konnte nicht gespeichert werden. Die bisherige Auswahl bleibt erhalten.",
        );
    } finally {
      locked.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  return (
    <CalendarBackgroundContext
      value={{
        uri,
        strength,
        setStrength: changeStrength,
        ready,
        busy,
        error,
        supported: Platform.OS !== "web",
        choose: async () => {
          await change("choose");
        },
        remove: async () => {
          await change("remove");
        },
        canUndoRemoval: removedUri !== null,
        undoRemove: async () => {
          await change("undo");
        },
        reset: () => change("reset"),
        retry: () => {
          if (!locked.current) setLoadRevision((value) => value + 1);
        },
      }}
    >
      {children}
    </CalendarBackgroundContext>
  );
}
