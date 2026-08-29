import type { SQLiteDatabase } from "expo-sqlite";

import type { LoadStoredRuleCatalog } from "@/application/rule-catalog-runtime";
import {
  synchronizePreviewRuleCatalog,
  type SynchronizeRuleCatalog,
} from "@/application/rule-catalog-sync";
import {
  createPreviewRuleCatalogConfig,
  type PreviewRuleCatalogConfig,
} from "@/composition/rule-catalog-preview-config";
import {
  activateRuleCatalog,
  loadActiveRuleCatalog,
} from "@/infrastructure/database/rule-catalog-repository";
import {
  claimPreviewRuleCatalogCheck,
  completePreviewRuleCatalogCheck,
} from "@/infrastructure/database/rule-catalog-sync-state";
import { recordDiagnostic } from "@/infrastructure/diagnostics";
import { createRuleCatalogHttpClient } from "@/infrastructure/rule-catalog-http-client";
import {
  verifyRuleCatalogArtifactsOnDevice,
  verifyRuleManifestOnDevice,
} from "@/infrastructure/rule-catalog-cryptography";
import { isRuleCatalogRuntimeCompatible } from "@/rules/rule-resolver";

export interface RuleCatalogRuntimePort {
  readonly loadStoredCatalog: LoadStoredRuleCatalog;
  readonly synchronizeCatalog: SynchronizeRuleCatalog;
  readonly recordDiagnostic: (code: string, error: unknown) => void;
}

export interface RuleCatalogRuntimePortOptions {
  readonly config?: PreviewRuleCatalogConfig;
  readonly fetchImplementation?: typeof fetch;
  readonly now?: () => Date;
}

export function buildRuleCatalogRuntimePort(
  db: SQLiteDatabase,
  options: RuleCatalogRuntimePortOptions,
): RuleCatalogRuntimePort {
  const config = options.config ?? createPreviewRuleCatalogConfig();
  const now = options.now ?? (() => new Date());
  const remote = config.enabled
    ? createRuleCatalogHttpClient({
        baseUrl: config.baseUrl,
        fetchImplementation: options.fetchImplementation,
      })
    : null;

  return Object.freeze({
    loadStoredCatalog: () => loadActiveRuleCatalog(db, isRuleCatalogRuntimeCompatible),
    synchronizeCatalog: (activeGeneration: number | null) => {
      if (remote === null) return Promise.resolve(Object.freeze({ status: "DISABLED" }));
      return synchronizePreviewRuleCatalog(activeGeneration, {
        remote,
        claimCheck: () => claimPreviewRuleCatalogCheck(db, now(), config.failureRetryMilliseconds),
        completeCheck: (generation) =>
          completePreviewRuleCatalogCheck(db, generation, now(), config.checkIntervalMilliseconds),
        verifyManifest: (manifestJson) =>
          verifyRuleManifestOnDevice(manifestJson, config.verificationPolicy),
        verifyArtifacts: (artifacts) =>
          verifyRuleCatalogArtifactsOnDevice(artifacts, config.verificationPolicy),
        activate: (artifacts) => activateRuleCatalog(db, artifacts),
      });
    },
    recordDiagnostic: (code: string, error: unknown) =>
      recordDiagnostic("rule-catalog", code, error),
  });
}
