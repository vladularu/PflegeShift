import { channel as updateChannel } from "expo-updates";

import { PREVIEW_RULE_CATALOG_TRUST } from "@/composition/rule-catalog-preview-trust";
import { RULE_CATALOG_SUPPORTED_ENGINE_CONTRACT_VERSIONS } from "@/rules/rule-catalog-engine-support";
import type { RuleCatalogVerificationPolicy } from "@/rules/rule-catalog-verification";
import { isRuleCatalogRuntimeCompatible } from "@/rules/rule-resolver";

export const PREVIEW_RULE_CATALOG_CHECK_INTERVAL_MS = 24 * 60 * 60 * 1_000;
export const PREVIEW_RULE_CATALOG_FAILURE_RETRY_MS = 60 * 60 * 1_000;

export interface PreviewRuleCatalogConfig {
  readonly enabled: boolean;
  readonly baseUrl: string;
  readonly verificationPolicy: RuleCatalogVerificationPolicy;
  readonly checkIntervalMilliseconds: number;
  readonly failureRetryMilliseconds: number;
}

export function createPreviewRuleCatalogConfig(
  configuredChannel: unknown = updateChannel,
): PreviewRuleCatalogConfig {
  return Object.freeze({
    enabled: configuredChannel === "preview",
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
    checkIntervalMilliseconds: PREVIEW_RULE_CATALOG_CHECK_INTERVAL_MS,
    failureRetryMilliseconds: PREVIEW_RULE_CATALOG_FAILURE_RETRY_MS,
  });
}
