import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { PREVIEW_RULE_CATALOG_TRUST } from "../src/composition/rule-catalog-preview-trust.ts";
import { validateProductionRuleCatalogChannelConfigSchema } from "../src/rules/schema-validators.generated.js";
import { ruleCatalogDeliveryChannel } from "./rule-catalog-delivery-channels.mjs";
import { ruleCatalogDeliveryConstants } from "./supabase-rule-catalog-storage.mjs";

const repositoryRoot = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const productionContractPath = path.join(
  repositoryRoot,
  "rules",
  "config",
  "production-channel.json",
);

function issue(code, pathValue, message) {
  return Object.freeze({ code, path: pathValue, message });
}

function result(status, issues) {
  return Object.freeze({ status, issues: Object.freeze(issues) });
}

function schemaIssues() {
  const errors = validateProductionRuleCatalogChannelConfigSchema.errors ?? [];
  return errors.map((error) =>
    issue(
      "SCHEMA_INVALID",
      error.instancePath || "/",
      `Production channel contract violates ${error.keyword}.`,
    ),
  );
}

function productionPublicBaseUrl(config) {
  return `${config.infrastructure.supabaseProjectUrl}/storage/v1/object/public/${config.infrastructure.bucketName}/${config.infrastructure.objectRoot}`;
}

function decodeCanonicalPublicKey(value) {
  const decoded = Buffer.from(value, "base64url");
  if (decoded.byteLength !== 32 || decoded.toString("base64url") !== value) return null;
  return decoded;
}

export function preflightProductionRuleCatalogConfig(config) {
  if (!validateProductionRuleCatalogChannelConfigSchema(config)) {
    return result("BLOCKED", schemaIssues());
  }

  const issues = [];
  const deliveryChannel = ruleCatalogDeliveryChannel("PRODUCTION");
  if (deliveryChannel === null) {
    issues.push(
      issue(
        "DELIVERY_CHANNEL_MISSING",
        "/channel",
        "The Production delivery channel contract is missing.",
      ),
    );
  } else if (deliveryChannel.remote !== null) {
    issues.push(
      issue(
        "DELIVERY_REMOTE_ALREADY_ENABLED",
        "/channel",
        "Production remote delivery must remain disabled before a separate activation approval.",
      ),
    );
  }

  if (config.status === "DISABLED") {
    issues.push(
      issue(
        "PRODUCTION_DISABLED",
        "/status",
        "The committed Production channel contract is deliberately disabled.",
      ),
    );
  }

  const previewOrigin = new URL(PREVIEW_RULE_CATALOG_TRUST.baseUrl).origin;
  const projectUrl = config.infrastructure.supabaseProjectUrl;
  if (projectUrl === null) {
    issues.push(
      issue(
        "INFRASTRUCTURE_NOT_CONFIGURED",
        "/infrastructure/supabaseProjectUrl",
        "No dedicated Production Supabase project is configured.",
      ),
    );
  } else if (new URL(projectUrl).origin === previewOrigin) {
    issues.push(
      issue(
        "PREVIEW_PROJECT_REUSE",
        "/infrastructure/supabaseProjectUrl",
        "Production must not reuse the Preview Supabase project.",
      ),
    );
  }

  if (
    config.infrastructure.storagePolicy.maximumObjectBytes !==
    ruleCatalogDeliveryConstants.maximumArtifactBytes
  ) {
    issues.push(
      issue(
        "STORAGE_LIMIT_MISMATCH",
        "/infrastructure/storagePolicy/maximumObjectBytes",
        "The Production storage limit differs from the signed artifact limit.",
      ),
    );
  }

  const remoteBaseUrl = config.remote.publicBaseUrl;
  if (remoteBaseUrl === null) {
    issues.push(
      issue(
        "REMOTE_NOT_CONFIGURED",
        "/remote/publicBaseUrl",
        "No public Production catalog URL is configured.",
      ),
    );
  } else if (projectUrl === null || remoteBaseUrl !== productionPublicBaseUrl(config)) {
    issues.push(
      issue(
        "REMOTE_BASE_URL_MISMATCH",
        "/remote/publicBaseUrl",
        "The public Production URL is not derived exactly from its project, bucket, and namespace.",
      ),
    );
  }

  const trustedPublicKeys = config.trust.trustedPublicKeys;
  if (trustedPublicKeys.length === 0) {
    issues.push(
      issue(
        "TRUST_NOT_CONFIGURED",
        "/trust/trustedPublicKeys",
        "No Production public signing key is configured.",
      ),
    );
  } else {
    const previewKeyBytes = new Set(
      PREVIEW_RULE_CATALOG_TRUST.trustedPublicKeys.map(({ publicKey }) =>
        Buffer.from(publicKey).toString("base64url"),
      ),
    );
    const keyIds = new Set();
    let reusedPreviewKey = false;
    let duplicateKeyId = false;
    let invalidPublicKey = false;
    for (const { keyId, publicKeyBase64Url } of trustedPublicKeys) {
      if (keyIds.has(keyId)) duplicateKeyId = true;
      keyIds.add(keyId);
      const decoded = decodeCanonicalPublicKey(publicKeyBase64Url);
      if (decoded === null) invalidPublicKey = true;
      else if (previewKeyBytes.has(decoded.toString("base64url"))) reusedPreviewKey = true;
    }
    if (reusedPreviewKey) {
      issues.push(
        issue(
          "PREVIEW_TRUST_REUSE",
          "/trust/trustedPublicKeys",
          "Production must not reuse Preview public signing key bytes.",
        ),
      );
    }
    if (duplicateKeyId) {
      issues.push(
        issue(
          "DUPLICATE_TRUST_KEY_ID",
          "/trust/trustedPublicKeys",
          "Production public signing key IDs must be unique.",
        ),
      );
    }
    if (invalidPublicKey) {
      issues.push(
        issue(
          "INVALID_PUBLIC_KEY",
          "/trust/trustedPublicKeys",
          "Production public signing keys must be canonical base64url for exactly 32 bytes.",
        ),
      );
    }
  }

  return issues.length === 0 ? result("READY_FOR_APPROVAL", []) : result("BLOCKED", issues);
}

async function main() {
  let config;
  try {
    config = JSON.parse(await fs.readFile(productionContractPath, "utf8"));
  } catch {
    const blocked = result("BLOCKED", [
      issue(
        "CONTRACT_UNREADABLE",
        "/",
        "The committed Production channel contract could not be read as JSON.",
      ),
    ]);
    printResult(blocked);
    process.exitCode = 1;
    return;
  }

  const preflight = preflightProductionRuleCatalogConfig(config);
  printResult(preflight);
  if (preflight.status !== "READY_FOR_APPROVAL") process.exitCode = 1;
}

function printResult(preflight) {
  console.log(`Production rule catalog preflight: ${preflight.status}`);
  for (const entry of preflight.issues) {
    console.log(`- ${entry.code} ${entry.path}: ${entry.message}`);
  }
  console.log("Network access: none");
  console.log("Remote writes: none");
  console.log("Secrets read: none");
  if (preflight.status === "READY_FOR_APPROVAL") {
    console.log("Activation: still disabled; separate approval required");
  }
}

const invokedPath = process.argv[1] === undefined ? null : path.resolve(process.argv[1]);
if (invokedPath === fileURLToPath(import.meta.url)) {
  await main();
}
