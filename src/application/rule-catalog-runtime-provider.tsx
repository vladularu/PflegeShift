import React, {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from "react";

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
  const selectRuntime = useCallback((next: RuleCatalogRuntimeSnapshot | null) => {
    setRuntime(next);
  }, []);

  useEffect(() => {
    let active = true;
    selectRuntime(null);
    void loadRuleCatalogRuntime(loadStoredCatalog).then(async (result) => {
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
      let syncResult: RuleCatalogSyncResult;
      try {
        syncResult = await synchronizeCatalog(result.runtime.diagnosis.activeGeneration);
      } catch (error) {
        if (active) recordDiagnostic("RULE_CATALOG_SYNC_FAILED", error);
        return;
      }
      if (!active) return;
      try {
        const refresh = await reconcileRuleCatalogRuntimeAfterSync(
          result.runtime,
          syncResult,
          loadStoredCatalog,
        );
        if (!active) return;
        if (refresh.status === "FAILED") {
          recordDiagnostic("RULE_CATALOG_REFRESH_FAILED", refresh.refreshError);
        } else if (refresh.status === "REPLACED") {
          selectRuntime(refresh.runtime);
        }
      } catch (error) {
        if (active) recordDiagnostic("RULE_CATALOG_REFRESH_FAILED", error);
      }
    });
    return () => {
      active = false;
    };
  }, [loadStoredCatalog, recordDiagnostic, selectRuntime, synchronizeCatalog]);

  const synchronizeNow = useCallback(async () => {
    const current = runtime;
    if (current === null) throw new Error("Der Regelkatalog ist noch nicht bereit.");

    let syncResult: RuleCatalogSyncResult;
    try {
      syncResult = await synchronizeCatalog(current.diagnosis.activeGeneration, { force: true });
    } catch (error) {
      recordDiagnostic("RULE_CATALOG_MANUAL_SYNC_FAILED", error);
      throw error;
    }

    let refresh;
    try {
      refresh = await reconcileRuleCatalogRuntimeAfterSync(current, syncResult, loadStoredCatalog);
    } catch (error) {
      recordDiagnostic("RULE_CATALOG_MANUAL_REFRESH_FAILED", error);
      throw error;
    }
    if (refresh.status === "FAILED") {
      recordDiagnostic("RULE_CATALOG_MANUAL_REFRESH_FAILED", refresh.refreshError);
      throw refresh.refreshError;
    }
    if (refresh.status === "REPLACED") selectRuntime(refresh.runtime);
    return syncResult;
  }, [loadStoredCatalog, recordDiagnostic, runtime, selectRuntime, synchronizeCatalog]);

  const contextValue = useMemo<RuleCatalogRuntimeContextValue | null>(
    () => (runtime === null ? null : Object.freeze({ ...runtime, synchronizeNow })),
    [runtime, synchronizeNow],
  );

  if (contextValue === null) return null;
  return <RuleCatalogRuntimeContext value={contextValue}>{children}</RuleCatalogRuntimeContext>;
}

export function useRuleCatalogRuntime(): RuleCatalogRuntimeContextValue {
  const runtime = React.use(RuleCatalogRuntimeContext);
  if (runtime === null) {
    throw new Error("useRuleCatalogRuntime muss im RuleCatalogRuntimeProvider verwendet werden.");
  }
  return runtime;
}
