import { useSQLiteContext } from "expo-sqlite";
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type PropsWithChildren,
} from "react";
import {
  loadPlanningHintsPreference,
  savePlanningHintsPreference,
} from "@/infrastructure/database/preferences-repository";

interface CheckPreferences {
  readonly enabled: boolean | null;
  readonly error: string | null;
  readonly saving: boolean;
  readonly retry: () => void;
  readonly save: (enabled: boolean) => Promise<void>;
}
// Standalone report renderers remain fail-open: never hide legal/unknown findings.
const Context = createContext<CheckPreferences>({
  enabled: true,
  error: null,
  saving: false,
  retry: () => {},
  save: async () => {
    throw new Error("Prüfungseinstellungen nicht bereit.");
  },
});
export const useCheckPreferences = () => useContext(Context);

export function CheckPreferencesProvider({ children }: PropsWithChildren) {
  const db = useSQLiteContext();
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [revision, setRevision] = useState(0);
  const busy = useRef(false);
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    let active = true;
    setError(null);
    void loadPlanningHintsPreference(db).then(
      (value) => {
        if (active) setEnabled(value);
      },
      () => {
        if (active) setError("Prüfungseinstellungen konnten nicht geladen werden.");
      },
    );
    return () => {
      active = false;
      mounted.current = false;
    };
  }, [db, revision]);
  async function save(value: boolean) {
    if (busy.current || enabled === null) return;
    busy.current = true;
    setSaving(true);
    setError(null);
    try {
      await savePlanningHintsPreference(db, value);
      if (mounted.current) setEnabled(value);
    } catch {
      if (mounted.current) setError("Nicht gespeichert. Bitte betätige den Schalter erneut.");
    } finally {
      busy.current = false;
      if (mounted.current) setSaving(false);
    }
  }
  return (
    <Context.Provider
      value={{ enabled, error, saving, save, retry: () => setRevision((value) => value + 1) }}
    >
      {children}
    </Context.Provider>
  );
}
