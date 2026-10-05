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
  loadYouthProtectionPreference,
  saveYouthProtectionPreference,
  savePlanningHintsPreference,
} from "@/infrastructure/database/preferences-repository";

interface CheckPreferences {
  readonly enabled: boolean | null;
  readonly youthEnabled: boolean | null;
  readonly saveYouth: (enabled: boolean) => Promise<void>;
  readonly error: string | null;
  readonly saving: boolean;
  readonly retry: () => void;
  readonly save: (enabled: boolean) => Promise<void>;
}
// Standalone report renderers remain fail-open: never hide legal/unknown findings.
const Context = createContext<CheckPreferences>({
  enabled: true,
  youthEnabled: false,
  saveYouth: async () => {
    throw new Error("Prüfungseinstellungen nicht bereit.");
  },
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
  const [youthEnabled, setYouthEnabled] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [revision, setRevision] = useState(0);
  const busy = useRef(false);
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    let active = true;
    setError(null);
    setEnabled(null);
    setYouthEnabled(null);
    void Promise.all([loadPlanningHintsPreference(db), loadYouthProtectionPreference(db)]).then(
      ([planning, youth]) => {
        if (active) {
          setEnabled(planning);
          setYouthEnabled(youth);
        }
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
  async function saveSelection(value: boolean, youth: boolean) {
    if (busy.current || enabled === null || youthEnabled === null) return;
    busy.current = true;
    setSaving(true);
    setError(null);
    try {
      if (youth) await saveYouthProtectionPreference(db, value);
      else await savePlanningHintsPreference(db, value);
      if (mounted.current) {
        if (youth) setYouthEnabled(value);
        else setEnabled(value);
      }
    } catch {
      if (mounted.current) setError("Nicht gespeichert. Bitte betätige den Schalter erneut.");
    } finally {
      busy.current = false;
      if (mounted.current) setSaving(false);
    }
  }
  return (
    <Context.Provider
      value={{
        enabled,
        youthEnabled,
        error,
        saving,
        save: (value) => saveSelection(value, false),
        saveYouth: (value) => saveSelection(value, true),
        retry: () => setRevision((value) => value + 1),
      }}
    >
      {children}
    </Context.Provider>
  );
}
