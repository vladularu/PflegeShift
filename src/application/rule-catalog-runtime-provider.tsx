import React, {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PropsWithChildren,
} from "react";
import { AppState } from "react-native";

import {
  loadRuleCatalogRuntime,
  type LoadStoredRuleCatalog,
  type RuleCatalogRuntimeSnapshot,
} from "@/application/rule-catalog-runtime";
import { reconcileRuleCatalogRuntimeAfterSync } from "@/application/rule-catalog-runtime-refresh";
import type {
  RuleCatalogSyncResult,
  SynchronizeRuleCatalog,
} from "@/application/rule-catalog-sync";

interface RuleCatalogRuntimeProviderProps extends PropsWithChildren {
  readonly loadStoredCatalog: LoadStoredRuleCatalog;
  readonly synchronizeCatalog: SynchronizeRuleCatalog;
  readonly recordDiagnostic: (code: string, error: unknown) => void;
}

export interface RuleCatalogRuntimeContextValue extends RuleCatalogRuntimeSnapshot {
  readonly synchronizeNow: () => Promise<RuleCatalogSyncResult>;
}

const RuleCatalogRuntimeContext = createContext<RuleCatalogRuntimeContextValue | null>(null);

export function RuleCatalogRuntimeProvider({
  children,
  loadStoredCatalog,
  synchronizeCatalog,
  recordDiagnostic,
}: RuleCatalogRuntimeProviderProps) {
  const [runtime, setRuntime] = useState<RuleCatalogRuntimeSnapshot | null>(null);
  const selectedRuntime = useRef<RuleCatalogRuntimeSnapshot | null>(null);
  const pendingSync = useRef<Promise<RuleCatalogSyncResult> | null>(null);
  const lifecycle = useRef(0);
  const selectRuntime = useCallback((next: RuleCatalogRuntimeSnapshot | null) => {
    selectedRuntime.current = next;
    setRuntime(next);
  }, []);

  const synchronizeCurrentRuntime = useCallback(
    (force = false): Promise<RuleCatalogSyncResult> => {
      if (pendingSync.current !== null) return pendingSync.current;
      const current = selectedRuntime.current;
      if (current === null)
        return Promise.reject(new Error("Der Regelkatalog ist noch nicht bereit."));
      const currentLifecycle = lifecycle.current;
      const check = async (): Promise<RuleCatalogSyncResult> => {
        let syncResult: RuleCatalogSyncResult;
        try {
          syncResult = force
            ? await synchronizeCatalog(current.diagnosis.activeGeneration, { force: true })
            : await synchronizeCatalog(current.diagnosis.activeGeneration);
        } catch (error) {
          if (currentLifecycle === lifecycle.current) {
            recordDiagnostic(
              force ? "RULE_CATALOG_MANUAL_SYNC_FAILED" : "RULE_CATALOG_SYNC_FAILED",
              error,
            );
          }
          throw error;
        }
        if (currentLifecycle !== lifecycle.current) return syncResult;
        try {
          const refresh = await reconcileRuleCatalogRuntimeAfterSync(
            current,
            syncResult,
            loadStoredCatalog,
          );
          if (currentLifecycle !== lifecycle.current) return syncResult;
          if (refresh.status === "FAILED") throw refresh.refreshError;
          if (refresh.status === "REPLACED") selectRuntime(refresh.runtime);
        } catch (error) {
          if (currentLifecycle === lifecycle.current) {
            recordDiagnostic(
              force ? "RULE_CATALOG_MANUAL_REFRESH_FAILED" : "RULE_CATALOG_REFRESH_FAILED",
              error,
            );
          }
          throw error;
        }
        return syncResult;
      };
      const pending = check();
      pendingSync.current = pending;
      const clearPending = () => {
        if (pendingSync.current === pending) pendingSync.current = null;
      };
      void pending.then(clearPending, clearPending);
      return pending;
    },
    [loadStoredCatalog, recordDiagnostic, selectRuntime, synchronizeCatalog],
  );

  useEffect(() => {
    let active = true;
    lifecycle.current += 1;
    pendingSync.current = null;
    selectRuntime(null);
    let previousAppState = AppState.currentState;
    const checkAutomatically = () => {
      if (active && selectedRuntime.current !== null) {
        void synchronizeCurrentRuntime().catch(() => undefined);
      }
    };
    const subscription = AppState.addEventListener("change", (nextAppState) => {
      const returningToApp = previousAppState !== "active" && nextAppState === "active";
      previousAppState = nextAppState;
      if (returningToApp) checkAutomatically();
    });
    void loadRuleCatalogRuntime(loadStoredCatalog).then((result) => {
      if (!active) return;
      if (result.loadError !== null) {
        recordDiagnostic("RULE_CATALOG_LOAD_FAILED", result.loadError);
      } else if (result.runtime.diagnosis.fallbackReason === "ACTIVE_GENERATION_INVALID") {
        recordDiagnostic(
          "RULE_CATALOG_LAST_KNOWN_GOOD",
          new Error("The active rule catalog generation was invalid or runtime-incompatible."),
        );
      }
      selectRuntime(result.runtime);
      if (previousAppState !== "background" && previousAppState !== "inactive")
        checkAutomatically();
    });
    return () => {
      active = false;
      lifecycle.current += 1;
      subscription.remove();
    };
  }, [loadStoredCatalog, recordDiagnostic, selectRuntime, synchronizeCurrentRuntime]);

  const synchronizeNow = useCallback(
    () => synchronizeCurrentRuntime(true),
    [synchronizeCurrentRuntime],
  );
  const contextValue = useMemo<RuleCatalogRuntimeContextValue | null>(
    () => (runtime === null ? null : { ...runtime, synchronizeNow }),
    [runtime, synchronizeNow],
  );

  if (runtime === null) return null;
  return <RuleCatalogRuntimeContext value={contextValue}>{children}</RuleCatalogRuntimeContext>;
}

export function useRuleCatalogRuntime(): RuleCatalogRuntimeContextValue {
  const runtime = React.use(RuleCatalogRuntimeContext);
  if (runtime === null) {
    throw new Error("useRuleCatalogRuntime muss im RuleCatalogRuntimeProvider verwendet werden.");
  }
  return runtime;
}
