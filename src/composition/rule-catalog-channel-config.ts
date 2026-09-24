import { channel as updateChannel } from "expo-updates";

import { PREVIEW_RULE_CATALOG_TRUST } from "@/composition/rule-catalog-preview-trust";
import { PRODUCTION_RULE_CATALOG_TRUST } from "@/composition/rule-catalog-production-trust";
import type { RuleManifest } from "@/rules/contracts.generated";
import { RULE_CATALOG_SUPPORTED_ENGINE_CONTRACT_VERSIONS } from "@/rules/rule-catalog-engine-support";
import type { RuleCatalogVerificationPolicy } from "@/rules/rule-catalog-verification";
import type { ValidatedRuleCatalog } from "@/rules/validation";
import { isRuleCatalogRuntimeCompatible } from "@/rules/rule-resolver";

export const RULE_CATALOG_CHECK_INTERVAL_MS = 24 * 60 * 60 * 1_000;
export const RULE_CATALOG_FAILURE_RETRY_MS = 60 * 60 * 1_000;
export const PREVIEW_REQUIRED_CATALOG_GENERATION = 5;

export interface RuleCatalogRemoteConfig {
  readonly baseUrl: string;
  readonly checkIntervalMilliseconds: number;
  readonly failureRetryMilliseconds: number;
  readonly requiredGeneration: number;
}

export interface RuleCatalogChannelConfig {
  readonly catalogChannel: RuleManifest["channel"] | null;
  readonly verificationPolicy: RuleCatalogVerificationPolicy | null;
  readonly remote: RuleCatalogRemoteConfig | null;
  readonly acceptsStoredCatalog: (catalog: ValidatedRuleCatalog) => boolean;
}

function previewRemoteConfig(): RuleCatalogRemoteConfig {
  return Object.freeze({
    baseUrl: PREVIEW_RULE_CATALOG_TRUST.baseUrl,
    checkIntervalMilliseconds: RULE_CATALOG_CHECK_INTERVAL_MS,
    failureRetryMilliseconds: RULE_CATALOG_FAILURE_RETRY_MS,
    requiredGeneration: PREVIEW_REQUIRED_CATALOG_GENERATION,
  });
}

interface RuleCatalogTrustConfig {
  readonly channel: RuleManifest["channel"];
  readonly trustedPublicKeys: readonly {
    readonly keyId: string;
    readonly publicKey: readonly number[];
  }[];
}

function verificationPolicy(trust: RuleCatalogTrustConfig): RuleCatalogVerificationPolicy {
  return Object.freeze({
    expectedChannel: trust.channel,
    supportedEngineContractVersions: new Set(RULE_CATALOG_SUPPORTED_ENGINE_CONTRACT_VERSIONS),
    trustedPublicKeys: new Map(
      trust.trustedPublicKeys.map(({ keyId, publicKey }) => [keyId, Uint8Array.from(publicKey)]),
    ),
    acceptsCatalog: isRuleCatalogRuntimeCompatible,
  });
}

function acceptsStoredCatalog(
  policy: RuleCatalogVerificationPolicy,
  catalog: ValidatedRuleCatalog,
): boolean {
  return (
    catalog.manifest.channel === policy.expectedChannel &&
    policy.trustedPublicKeys.has(catalog.manifest.signing.keyId) &&
    isRuleCatalogRuntimeCompatible(catalog)
  );
}

export function createRuleCatalogChannelConfig(
  configuredChannel: unknown = updateChannel,
): RuleCatalogChannelConfig {
  if (configuredChannel === "preview") {
    const policy = verificationPolicy(PREVIEW_RULE_CATALOG_TRUST);
    const remote = previewRemoteConfig();
    return Object.freeze({
      catalogChannel: policy.expectedChannel,
      verificationPolicy: policy,
      remote,
      acceptsStoredCatalog: (catalog: ValidatedRuleCatalog) =>
        acceptsStoredCatalog(policy, catalog),
    });
  }

  if (configuredChannel === "production") {
    const policy = verificationPolicy(PRODUCTION_RULE_CATALOG_TRUST);
    return Object.freeze({
      catalogChannel: policy.expectedChannel,
      verificationPolicy: policy,
      remote: null,
      acceptsStoredCatalog: () => false,
    });
  }

  return Object.freeze({
    catalogChannel: null,
    verificationPolicy: null,
    remote: null,
    acceptsStoredCatalog: () => false,
  });
}
