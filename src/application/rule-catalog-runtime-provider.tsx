import React, { createContext, useEffect, useState, type PropsWithChildren } from "react";

import {
  loadRuleCatalogRuntime,
  type LoadStoredRuleCatalog,
  type RuleCatalogRuntimeSnapshot,
} from "@/application/rule-catalog-runtime";
import type { SynchronizeRuleCatalog } from "@/application/rule-catalog-sync";

interface RuleCatalogRuntimeProviderProps extends PropsWithChildren {
  readonly loadStoredCatalog: LoadStoredRuleCatalog;
  readonly synchronizeCatalog: SynchronizeRuleCatalog;
  readonly recordDiagnostic: (code: string, error: unknown) => void;
}

const RuleCatalogRuntimeContext = createContext<RuleCatalogRuntimeSnapshot | null>(null);

export function RuleCatalogRuntimeProvider({
  children,
  loadStoredCatalog,
  synchronizeCatalog,
  recordDiagnostic,
}: RuleCatalogRuntimeProviderProps) {
  const [runtime, setRuntime] = useState<RuleCatalogRuntimeSnapshot | null>(null);

  useEffect(() => {
    let active = true;
    setRuntime(null);
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
      setRuntime(result.runtime);
      void synchronizeCatalog(result.runtime.diagnosis.activeGeneration).catch((error: unknown) => {
        if (active) recordDiagnostic("RULE_CATALOG_SYNC_FAILED", error);
      });
    });
    return () => {
      active = false;
    };
  }, [loadStoredCatalog, recordDiagnostic, synchronizeCatalog]);

  if (runtime === null) return null;
  return <RuleCatalogRuntimeContext value={runtime}>{children}</RuleCatalogRuntimeContext>;
}

export function useRuleCatalogRuntime(): RuleCatalogRuntimeSnapshot {
  const runtime = React.use(RuleCatalogRuntimeContext);
  if (runtime === null) {
    throw new Error("useRuleCatalogRuntime muss im RuleCatalogRuntimeProvider verwendet werden.");
  }
  return runtime;
}
