import React, {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PropsWithChildren,
} from "react";
import type { TrainingRepositoryPort } from "./training-ports";
import type { PflegeShiftDiagnosticsPort } from "./pflegeshift-ports";
import type {
  TrainingSnapshot,
  SaveTrainingProfileInput,
  SaveShiftTrainingInput,
} from "@/domain/training-data";

export const TRAINING_LOAD_ERROR =
  "Ausbildungs- und Pausendaten konnten nicht geladen werden. Bitte erneut versuchen.";
interface State extends TrainingSnapshot {
  readonly status: "loading" | "ready" | "error";
  readonly error: string | null;
}
interface Value extends State {
  readonly reload: () => Promise<void>;
  readonly saveProfile: TrainingRepositoryPort["saveProfile"];
  readonly saveShift: TrainingRepositoryPort["saveShift"];
}
const EMPTY: State = Object.freeze({
  profiles: Object.freeze([]),
  shifts: Object.freeze([]),
  status: "loading",
  error: null,
});
const TrainingContext = createContext<Value | null>(null);

export function TrainingProvider({
  repository,
  diagnostics,
  reloadRevision,
  children,
}: PropsWithChildren<{
  readonly repository: TrainingRepositoryPort;
  readonly diagnostics: PflegeShiftDiagnosticsPort;
  readonly reloadRevision: number;
}>) {
  const [state, setState] = useState<
    State & { source: TrainingRepositoryPort | null; loadRevision: number }
  >({ ...EMPTY, source: null, loadRevision: -1 });
  const lifecycleRef = useRef<{
    source: TrainingRepositoryPort;
    active: boolean;
    sequence: number;
    pendingWrites: number;
    loadRevision: number;
  } | null>(null);
  const reload = useCallback(async () => {
    const life = lifecycleRef.current;
    if (!life?.active || life.source !== repository) return;
    const sequence = ++life.sequence,
      loadRevision = life.loadRevision;
    setState((old) => ({
      ...(old.source === repository ? old : EMPTY),
      source: repository,
      loadRevision,
      status: "loading",
      error: null,
    }));
    if (life.pendingWrites > 0) return;
    try {
      const snapshot = await repository.loadSnapshot();
      if (!life.active || life.sequence !== sequence) return;
      setState({ ...snapshot, status: "ready", error: null, source: repository, loadRevision });
    } catch {
      if (!life.active || life.sequence !== sequence) return;
      // Parser and DB messages may contain a birth date or other personal values.
      diagnostics.record("provider", "TRAINING_LOAD_FAILED", new Error(TRAINING_LOAD_ERROR));
      setState((old) => ({ ...old, status: "error", error: TRAINING_LOAD_ERROR }));
    }
  }, [repository, diagnostics]);
  useEffect(() => {
    let life = lifecycleRef.current;
    if (life === null || life.source !== repository) {
      life = {
        source: repository,
        active: true,
        sequence: 0,
        pendingWrites: 0,
        loadRevision: reloadRevision,
      };
      lifecycleRef.current = life;
    }
    life.active = true;
    life.loadRevision = reloadRevision;
    void reload();
    return () => {
      life.active = false;
      life.sequence += 1;
    };
  }, [repository, reload, reloadRevision]);
  const persist = useCallback(
    async <T,>(write: () => Promise<T>): Promise<T> => {
      const life = lifecycleRef.current;
      if (!life?.active || life.source !== repository)
        throw new Error("Ausbildungsdaten sind noch nicht bereit.");
      life.pendingWrites += 1;
      life.sequence += 1;
      setState((old) => ({
        ...(old.source === repository ? old : EMPTY),
        source: repository,
        loadRevision: life.loadRevision,
        status: "loading",
        error: null,
      }));
      try {
        return await write();
      } finally {
        life.pendingWrites -= 1;
        // A committed write stays successful even if the following read fails.
        if (life.active && life.pendingWrites === 0) await reload();
      }
    },
    [repository, reload],
  );
  const saveProfile = useCallback(
    (input: SaveTrainingProfileInput) => persist(() => repository.saveProfile(input)),
    [persist, repository],
  );
  const saveShift = useCallback(
    (input: SaveShiftTrainingInput) => persist(() => repository.saveShift(input)),
    [persist, repository],
  );
  const value = useMemo<Value>(() => {
    const current =
      state.source === repository && state.loadRevision === reloadRevision ? state : EMPTY;
    return {
      profiles: current.profiles,
      shifts: current.shifts,
      status: current.status,
      error: current.error,
      reload,
      saveProfile,
      saveShift,
    };
  }, [state, repository, reloadRevision, reload, saveProfile, saveShift]);
  return <TrainingContext value={value}>{children}</TrainingContext>;
}

export function useTrainingData(): Value {
  const value = React.use(TrainingContext);
  if (value === null) throw new Error("useTrainingData benötigt den TrainingProvider.");
  return value;
}
