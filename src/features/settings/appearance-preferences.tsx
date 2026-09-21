import { useSQLiteContext } from "expo-sqlite";
import {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PropsWithChildren,
} from "react";
import { Appearance } from "react-native";
import {
  DEFAULT_APPEARANCE,
  type AppearanceMode,
  type AppearancePreferences,
  type ThemeId,
} from "@/domain/appearance";
import {
  loadAppearancePreferences,
  saveAppearancePreferences,
} from "@/infrastructure/database/appearance-repository";
import { recordDiagnostic } from "@/infrastructure/diagnostics";
import { AppearanceContext } from "@/theme/appearance-context";

export function AppearancePreferencesProvider({ children }: PropsWithChildren) {
  const db = useSQLiteContext();
  const [preferences, setPreferences] = useState(DEFAULT_APPEARANCE);
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const current = useRef(DEFAULT_APPEARANCE);
  const persisted = useRef(DEFAULT_APPEARANCE);
  const failed = useRef<AppearancePreferences | null>(null);
  const queue = useRef<Promise<void>>(Promise.resolve());
  const revision = useRef(0);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const load = useCallback(async () => {
    const version = revision.current;
    try {
      const loaded = await loadAppearancePreferences(db);
      if (!mounted.current || version !== revision.current) return;
      current.current = persisted.current = loaded;
      failed.current = null;
      setPreferences(loaded);
      setError(null);
    } catch (cause) {
      recordDiagnostic("preferences", "APPEARANCE_LOAD_FAILED", cause);
      if (mounted.current && version === revision.current)
        setError("Darstellung konnte nicht geladen werden.");
    } finally {
      if (mounted.current) setReady(true);
    }
  }, [db]);
  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    if (ready)
      Appearance.setColorScheme(preferences.mode === "system" ? "unspecified" : preferences.mode);
  }, [preferences.mode, ready]);
  useEffect(() => () => Appearance.setColorScheme("unspecified"), []);

  const persist = useCallback(
    (snapshot: AppearancePreferences) => {
      setSaving(true);
      setError(null);
      queue.current = queue.current.then(async () => {
        try {
          await saveAppearancePreferences(db, snapshot);
          persisted.current = snapshot;
          if (!mounted.current || current.current !== snapshot) return;
          failed.current = null;
          setSaving(false);
        } catch (cause) {
          recordDiagnostic("preferences", "APPEARANCE_SAVE_FAILED", cause);
          if (!mounted.current || current.current !== snapshot) return;
          failed.current = snapshot;
          current.current = persisted.current;
          setPreferences(persisted.current);
          setSaving(false);
          setError("Darstellung konnte nicht gespeichert werden.");
        }
      });
    },
    [db],
  );
  const update = useCallback(
    (patch: Partial<AppearancePreferences>) => {
      revision.current += 1;
      const next = Object.freeze({ ...current.current, ...patch });
      current.current = next;
      failed.current = null;
      setPreferences(next);
      persist(next);
    },
    [persist],
  );
  const retry = useCallback(() => {
    if (failed.current === null) {
      void load();
      return;
    }
    update(failed.current);
  }, [load, update]);
  const setTheme = useCallback((themeId: ThemeId) => update({ themeId }), [update]);
  const setMode = useCallback((mode: AppearanceMode) => update({ mode }), [update]);
  const reset = useCallback(() => update(DEFAULT_APPEARANCE), [update]);
  const value = useMemo(
    () => ({ ...preferences, ready, error, saving, setTheme, setMode, retry, reset }),
    [preferences, ready, error, saving, setTheme, setMode, retry, reset],
  );
  return <AppearanceContext value={value}>{children}</AppearanceContext>;
}
export function useAppearancePreferences() {
  const value = useContext(AppearanceContext);
  if (value === null) throw new Error("Darstellung ist außerhalb ihres Providers nicht verfügbar.");
  return value;
}
