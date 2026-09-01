import { channel as updateChannel } from "expo-updates";

import { PREVIEW_RULE_CATALOG_TRUST } from "@/composition/rule-catalog-preview-trust";
import type { RuleManifest } from "@/rules/contracts.generated";
import { RULE_CATALOG_SUPPORTED_ENGINE_CONTRACT_VERSIONS } from "@/rules/rule-catalog-engine-support";
import type { RuleCatalogVerificationPolicy } from "@/rules/rule-catalog-verification";
import type { ValidatedRuleCatalog } from "@/rules/validation";
import { isRuleCatalogRuntimeCompatible } from "@/rules/rule-resolver";

export const RULE_CATALOG_CHECK_INTERVAL_MS = 24 * 60 * 60 * 1_000;
export const RULE_CATALOG_FAILURE_RETRY_MS = 60 * 60 * 1_000;

export interface RuleCatalogRemoteConfig {
  readonly channel: RuleManifest["channel"];
  readonly baseUrl: string;
  readonly verificationPolicy: RuleCatalogVerificationPolicy;
  readonly checkIntervalMilliseconds: number;
  readonly failureRetryMilliseconds: number;
}

export interface RuleCatalogChannelConfig {
  readonly catalogChannel: RuleManifest["channel"] | null;
  readonly remote: RuleCatalogRemoteConfig | null;
  readonly acceptsStoredCatalog: (catalog: ValidatedRuleCatalog) => boolean;
}

function previewRemoteConfig(): RuleCatalogRemoteConfig {
  return Object.freeze({
    channel: PREVIEW_RULE_CATALOG_TRUST.channel,
    baseUrl: PREVIEW_RULE_CATALOG_TRUST.baseUrl,
    verificationPolicy: Object.freeze({
      expectedChannel: PREVIEW_RULE_CATALOG_TRUST.channel,
      supportedEngineContractVersions: new Set(RULE_CATALOG_SUPPORTED_ENGINE_CONTRACT_VERSIONS),
      trustedPublicKeys: new Map(
        PREVIEW_RULE_CATALOG_TRUST.trustedPublicKeys.map(({ keyId, publicKey }) => [
          keyId,
          Uint8Array.from(publicKey),
        ]),
      ),
      acceptsCatalog: isRuleCatalogRuntimeCompatible,
    }),
    checkIntervalMilliseconds: RULE_CATALOG_CHECK_INTERVAL_MS,
    failureRetryMilliseconds: RULE_CATALOG_FAILURE_RETRY_MS,
  });
}

function acceptsStoredCatalog(
  remote: RuleCatalogRemoteConfig,
  catalog: ValidatedRuleCatalog,
): boolean {
  return (
    catalog.manifest.channel === remote.channel &&
    remote.verificationPolicy.trustedPublicKeys.has(catalog.manifest.signing.keyId) &&
    isRuleCatalogRuntimeCompatible(catalog)
  );
}

export function createRuleCatalogChannelConfig(
  configuredChannel: unknown = updateChannel,
): RuleCatalogChannelConfig {
  if (configuredChannel === "preview") {
    const remote = previewRemoteConfig();
    return Object.freeze({
      catalogChannel: remote.channel,
      remote,
      acceptsStoredCatalog: (catalog: ValidatedRuleCatalog) =>
        acceptsStoredCatalog(remote, catalog),
    });
  }

  if (configuredChannel === "production") {
    return Object.freeze({
      catalogChannel: "PRODUCTION" as const,
      remote: null,
      acceptsStoredCatalog: () => false,
    });
  }

  return Object.freeze({
    catalogChannel: null,
    remote: null,
    acceptsStoredCatalog: () => false,
  });
}
