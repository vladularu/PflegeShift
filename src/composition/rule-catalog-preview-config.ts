import { channel as updateChannel } from "expo-updates";

import type { RuleCatalogVerificationPolicy } from "@/rules/rule-catalog-verification";
import { isRuleCatalogRuntimeCompatible } from "@/rules/rule-resolver";

const PREVIEW_BASE_URL =
  "https://okcxmmekwyuuiqthmydo.supabase.co/storage/v1/object/public/rule-catalog/preview";
const PREVIEW_KEY_ID = "preview-2026";
const PREVIEW_PUBLIC_KEY = Object.freeze([
  23, 51, 245, 81, 88, 150, 83, 204, 65, 85, 65, 47, 145, 96, 44, 208, 182, 0, 112, 233, 156, 127,
  221, 227, 56, 215, 81, 71, 154, 146, 246, 59,
]);
const SUPPORTED_ENGINE_CONTRACT_VERSIONS = Object.freeze([1, 2, 3, 4, 5, 6]);

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
    baseUrl: PREVIEW_BASE_URL,
    verificationPolicy: Object.freeze({
      expectedChannel: "PREVIEW",
      supportedEngineContractVersions: new Set(SUPPORTED_ENGINE_CONTRACT_VERSIONS),
      trustedPublicKeys: new Map([[PREVIEW_KEY_ID, Uint8Array.from(PREVIEW_PUBLIC_KEY)]]),
      acceptsCatalog: isRuleCatalogRuntimeCompatible,
    }),
    checkIntervalMilliseconds: PREVIEW_RULE_CATALOG_CHECK_INTERVAL_MS,
    failureRetryMilliseconds: PREVIEW_RULE_CATALOG_FAILURE_RETRY_MS,
  });
}
