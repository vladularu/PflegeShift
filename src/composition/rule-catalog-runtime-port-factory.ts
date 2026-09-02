import type { SQLiteDatabase } from "expo-sqlite";

import type { LoadStoredRuleCatalog } from "@/application/rule-catalog-runtime";
import {
  synchronizeRuleCatalog,
  type SynchronizeRuleCatalog,
} from "@/application/rule-catalog-sync";
import {
  createRuleCatalogChannelConfig,
  type RuleCatalogChannelConfig,
} from "@/composition/rule-catalog-channel-config";
import {
  activateRuleCatalog,
  loadActiveRuleCatalog,
} from "@/infrastructure/database/rule-catalog-repository";
import {
  claimRuleCatalogCheck,
  completeRuleCatalogCheck,
} from "@/infrastructure/database/rule-catalog-sync-state";
import { recordDiagnostic } from "@/infrastructure/diagnostics";
import { createRuleCatalogHttpClient } from "@/infrastructure/rule-catalog-http-client";
import {
  verifyRuleCatalogArtifactsOnDevice,
  verifyRuleManifestOnDevice,
} from "@/infrastructure/rule-catalog-cryptography";

export interface RuleCatalogRuntimePort {
  readonly loadStoredCatalog: LoadStoredRuleCatalog;
  readonly synchronizeCatalog: SynchronizeRuleCatalog;
  readonly recordDiagnostic: (code: string, error: unknown) => void;
}

export interface RuleCatalogRuntimePortOptions {
  readonly config?: RuleCatalogChannelConfig;
  readonly fetchImplementation?: typeof fetch;
  readonly now?: () => Date;
}

export function buildRuleCatalogRuntimePort(
  db: SQLiteDatabase,
  options: RuleCatalogRuntimePortOptions,
): RuleCatalogRuntimePort {
  const config = options.config ?? createRuleCatalogChannelConfig();
  const remoteConfig = config.remote;
  const verificationPolicy = config.verificationPolicy;
  const now = options.now ?? (() => new Date());
  const remote =
    remoteConfig !== null && verificationPolicy !== null
      ? createRuleCatalogHttpClient({
          baseUrl: remoteConfig.baseUrl,
          fetchImplementation: options.fetchImplementation,
        })
      : null;
  const synchronizeCatalog: SynchronizeRuleCatalog = (activeGeneration, syncOptions = {}) => {
    if (remote === null || remoteConfig === null || verificationPolicy === null) {
      return Promise.resolve(Object.freeze({ status: "DISABLED" }));
    }
    const activeRemoteConfig = remoteConfig;
    const activeVerificationPolicy = verificationPolicy;
    return synchronizeRuleCatalog(activeGeneration, {
      remote,
      claimCheck: () =>
        syncOptions.force === true
          ? claimRuleCatalogCheck(
              db,
              activeVerificationPolicy.expectedChannel,
              now(),
              activeRemoteConfig.failureRetryMilliseconds,
              true,
            )
          : claimRuleCatalogCheck(
              db,
              activeVerificationPolicy.expectedChannel,
              now(),
              activeRemoteConfig.failureRetryMilliseconds,
            ),
      completeCheck: (generation) =>
        completeRuleCatalogCheck(
          db,
          activeVerificationPolicy.expectedChannel,
          generation,
          now(),
          activeRemoteConfig.checkIntervalMilliseconds,
        ),
      verifyManifest: (manifestJson) =>
        verifyRuleManifestOnDevice(manifestJson, activeVerificationPolicy),
      verifyArtifacts: (artifacts) =>
        verifyRuleCatalogArtifactsOnDevice(artifacts, activeVerificationPolicy),
      activate: (artifacts) => activateRuleCatalog(db, artifacts),
    });
  };

  return Object.freeze({
    loadStoredCatalog: () => loadActiveRuleCatalog(db, config.acceptsStoredCatalog),
    synchronizeCatalog,
    recordDiagnostic: (code: string, error: unknown) =>
      recordDiagnostic("rule-catalog", code, error),
  });
}
