import {
  loadRuleCatalogRuntime,
  type LoadStoredRuleCatalog,
  type RuleCatalogRuntimeSnapshot,
} from "@/application/rule-catalog-runtime";
import type { RuleCatalogSyncResult } from "@/application/rule-catalog-sync";

export type RuleCatalogRuntimeRefreshErrorCode = "SYNCHRONIZED_GENERATION_NOT_SELECTED";

export class RuleCatalogRuntimeRefreshError extends Error {
  readonly code: RuleCatalogRuntimeRefreshErrorCode;
  readonly expectedGeneration: number;
  readonly activeGeneration: number | null;
  readonly selectedGeneration: number | null;

  constructor(expectedGeneration: number, runtime: RuleCatalogRuntimeSnapshot) {
    super(
      "The synchronized rule catalog generation could not be selected as one runtime snapshot.",
    );
    this.name = "RuleCatalogRuntimeRefreshError";
    this.code = "SYNCHRONIZED_GENERATION_NOT_SELECTED";
    this.expectedGeneration = expectedGeneration;
    this.activeGeneration = runtime.diagnosis.activeGeneration;
    this.selectedGeneration = runtime.diagnosis.selectedGeneration;
  }
}

export type RuleCatalogRuntimeRefreshResult = Readonly<
  | {
      status: "UNCHANGED" | "REPLACED";
      runtime: RuleCatalogRuntimeSnapshot;
      refreshError: null;
    }
  | {
      status: "FAILED";
      runtime: RuleCatalogRuntimeSnapshot;
      refreshError: unknown;
    }
>;

function synchronizedGeneration(result: RuleCatalogSyncResult): number | null {
  return result.status === "DISABLED" || result.status === "THROTTLED" ? null : result.generation;
}

function selectsCompleteGeneration(
  runtime: RuleCatalogRuntimeSnapshot,
  minimumGeneration: number,
): boolean {
  const { diagnosis } = runtime;
  return (
    diagnosis.source === "STORED" &&
    diagnosis.fallbackReason === null &&
    diagnosis.activeGeneration !== null &&
    diagnosis.activeGeneration === diagnosis.selectedGeneration &&
    diagnosis.selectedGeneration >= minimumGeneration
  );
}

export async function reconcileRuleCatalogRuntimeAfterSync(
  current: RuleCatalogRuntimeSnapshot,
  syncResult: RuleCatalogSyncResult,
  loadStoredCatalog: LoadStoredRuleCatalog,
): Promise<RuleCatalogRuntimeRefreshResult> {
  const expectedGeneration = synchronizedGeneration(syncResult);
  if (expectedGeneration === null || selectsCompleteGeneration(current, expectedGeneration)) {
    return Object.freeze({ status: "UNCHANGED", runtime: current, refreshError: null });
  }

  const loaded = await loadRuleCatalogRuntime(loadStoredCatalog);
  if (loaded.loadError !== null) {
    return Object.freeze({ status: "FAILED", runtime: current, refreshError: loaded.loadError });
  }
  if (!selectsCompleteGeneration(loaded.runtime, expectedGeneration)) {
    return Object.freeze({
      status: "FAILED",
      runtime: current,
      refreshError: new RuleCatalogRuntimeRefreshError(expectedGeneration, loaded.runtime),
    });
  }
  return Object.freeze({ status: "REPLACED", runtime: loaded.runtime, refreshError: null });
}
