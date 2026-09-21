import { useSQLiteContext } from "expo-sqlite";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PropsWithChildren,
} from "react";
import { DEFAULT_ANALYSIS_VIEW, type AnalysisViewPreferences } from "@/domain/analysis-view";
import {
  loadAnalysisView,
  saveAnalysisView,
} from "@/infrastructure/database/analysis-view-repository";
import { recordDiagnostic } from "@/infrastructure/diagnostics";

interface AnalysisViewState {
  readonly preferences: AnalysisViewPreferences;
  readonly ready: boolean;
  readonly saving: boolean;
  readonly error: string | null;
  readonly update: (change: (current: AnalysisViewPreferences) => AnalysisViewPreferences) => void;
  readonly retry: () => void;
}
const defaultState: AnalysisViewState = {
  preferences: DEFAULT_ANALYSIS_VIEW,
  ready: false,
  saving: false,
  error: null,
  update: () => {},
  retry: () => {},
};
const AnalysisViewContext = createContext(defaultState);
export function AnalysisViewProvider({ children }: PropsWithChildren) {
  const db = useSQLiteContext();
  const [preferences, setPreferences] = useState(DEFAULT_ANALYSIS_VIEW);
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const current = useRef(DEFAULT_ANALYSIS_VIEW);
  const persisted = useRef(DEFAULT_ANALYSIS_VIEW);
  const failed = useRef<AnalysisViewPreferences | null>(null);
  const mounted = useRef(false);
  const loaded = useRef(false);
  const queue = useRef<Promise<void>>(Promise.resolve());
  const load = useCallback(async () => {
    try {
      const next = await loadAnalysisView(db);
      if (!mounted.current) return;
      current.current = persisted.current = next;
      loaded.current = true;
      setPreferences(next);
      setReady(true);
      setError(null);
    } catch (cause) {
      recordDiagnostic("preferences", "ANALYSIS_VIEW_LOAD_FAILED", cause);
      if (mounted.current) setError("Deine Ansicht konnte nicht geladen werden.");
    }
  }, [db]);
  useEffect(() => {
    mounted.current = true;
    void load();
    return () => {
      mounted.current = false;
    };
  }, [load]);
  const persist = useCallback(
    (next: AnalysisViewPreferences) => {
      current.current = next;
      failed.current = null;
      setPreferences(next);
      setSaving(true);
      setError(null);
      queue.current = queue.current.then(async () => {
        try {
          await saveAnalysisView(db, next);
          persisted.current = next;
          if (!mounted.current || current.current !== next) return;
          failed.current = null;
          setSaving(false);
        } catch (cause) {
          recordDiagnostic("preferences", "ANALYSIS_VIEW_SAVE_FAILED", cause);
          if (!mounted.current || current.current !== next) return;
          failed.current = next;
          current.current = persisted.current;
          setPreferences(persisted.current);
          setSaving(false);
          setError("Deine Ansicht konnte nicht gespeichert werden.");
        }
      });
    },
    [db],
  );
  const update = useCallback(
    (change: (p: AnalysisViewPreferences) => AnalysisViewPreferences) => {
      if (!loaded.current) return;
      const next = change(current.current);
      if (JSON.stringify(next) !== JSON.stringify(current.current)) persist(next);
    },
    [persist],
  );
  const retry = useCallback(() => {
    if (failed.current) persist(failed.current);
    else void load();
  }, [load, persist]);
  const value = useMemo(
    () => ({ preferences, ready, saving, error, update, retry }),
    [preferences, ready, saving, error, update, retry],
  );
  return <AnalysisViewContext value={value}>{children}</AnalysisViewContext>;
}
export const useAnalysisView = () => useContext(AnalysisViewContext);
