import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { createRequire } from "node:module";

import { PREVIEW_RULE_CATALOG_TRUST } from "../src/composition/rule-catalog-preview-trust.ts";
import { preflightProductionRuleCatalogConfig } from "./production-rule-catalog-preflight.mjs";

const execFileAsync = promisify(execFile);
const repositoryRoot = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const contractPath = path.join(repositoryRoot, "rules", "config", "production-channel.json");
const preflightCliPath = path.join(
  repositoryRoot,
  "scripts",
  "production-rule-catalog-preflight.mjs",
);
const require = createRequire(import.meta.url);
const tsxImport = pathToFileURL(require.resolve("tsx")).href;

function candidateConfig() {
  const projectUrl = "https://abcdefghijklmnopqrst.supabase.co";
  return {
    schemaVersion: 1,
    channel: "PRODUCTION",
    status: "CANDIDATE",
    infrastructure: {
      isolationMode: "DEDICATED_SUPABASE_PROJECT",
      supabaseProjectUrl: projectUrl,
      region: "eu-central-1",
      bucketName: "rule-catalog-production",
      objectRoot: "production",
      deliverySecretEnvironmentName: "SUPABASE_PRODUCTION_SECRET_KEY",
      storagePolicy: {
        publicRead: true,
        administrativeWriteOnly: true,
        allowedMimeTypes: ["application/json"],
        maximumObjectBytes: 524_288,
      },
    },
    trust: {
      algorithm: "ED25519",
      canonicalization: "RFC8785",
      trustedPublicKeys: [
        {
          keyId: "production-2026-r1",
          publicKeyBase64Url: Buffer.alloc(32, 7).toString("base64url"),
        },
      ],
    },
    remote: {
      publicBaseUrl: `${projectUrl}/storage/v1/object/public/rule-catalog-production/production`,
      checkIntervalMilliseconds: 86_400_000,
      failureRetryMilliseconds: 3_600_000,
    },
  };
}

test("committed Production contract is schema-valid, disabled, and locally blocked", async () => {
  const config = JSON.parse(await fs.readFile(contractPath, "utf8"));
  let networkTouched = false;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    networkTouched = true;
    throw new Error("Network access is forbidden in the local preflight.");
  };
  try {
    const result = preflightProductionRuleCatalogConfig(config);
    assert.equal(result.status, "BLOCKED");
    assert.deepEqual(
      result.issues.map(({ code }) => code),
      [
        "PRODUCTION_DISABLED",
        "INFRASTRUCTURE_NOT_CONFIGURED",
        "REMOTE_NOT_CONFIGURED",
        "TRUST_NOT_CONFIGURED",
      ],
    );
    assert.equal(networkTouched, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("complete isolated candidate is ready only for separate manual approval", () => {
  assert.deepEqual(preflightProductionRuleCatalogConfig(candidateConfig()), {
    status: "READY_FOR_APPROVAL",
    issues: [],
  });
});

test("preflight rejects Preview project and trust reuse", () => {
  const config = candidateConfig();
  const previewBaseUrl = new URL(PREVIEW_RULE_CATALOG_TRUST.baseUrl);
  config.infrastructure.supabaseProjectUrl = previewBaseUrl.origin;
  config.remote.publicBaseUrl = `${previewBaseUrl.origin}/storage/v1/object/public/rule-catalog-production/production`;
  config.trust.trustedPublicKeys[0].publicKeyBase64Url = Buffer.from(
    PREVIEW_RULE_CATALOG_TRUST.trustedPublicKeys[0].publicKey,
  ).toString("base64url");

  const result = preflightProductionRuleCatalogConfig(config);
  assert.equal(result.status, "BLOCKED");
  assert.deepEqual(
    result.issues.map(({ code }) => code),
    ["PREVIEW_PROJECT_REUSE", "PREVIEW_TRUST_REUSE"],
  );
});

test("preflight rejects remote derivation drift and duplicate key identities", () => {
  const config = candidateConfig();
  config.remote.publicBaseUrl =
    "https://zyxwvutsrqponmlkjihg.supabase.co/storage/v1/object/public/rule-catalog-production/production";
  config.trust.trustedPublicKeys.push({
    ...config.trust.trustedPublicKeys[0],
    publicKeyBase64Url: Buffer.alloc(32, 8).toString("base64url"),
  });

  const result = preflightProductionRuleCatalogConfig(config);
  assert.equal(result.status, "BLOCKED");
  assert.deepEqual(
    result.issues.map(({ code }) => code),
    ["REMOTE_BASE_URL_MISMATCH", "DUPLICATE_TRUST_KEY_ID"],
  );
});

test("preflight rejects undocumented fields instead of accepting possible secrets", () => {
  const config = candidateConfig();
  config.infrastructure.secretKey = "must-never-be-accepted";

  const result = preflightProductionRuleCatalogConfig(config);
  assert.equal(result.status, "BLOCKED");
  assert.equal(result.issues[0].code, "SCHEMA_INVALID");
  assert.equal(JSON.stringify(result).includes("must-never-be-accepted"), false);
});

test("CLI reads only the committed public contract and exits blocked without leaking secrets", async () => {
  const sentinelSecret = "sb_secret_must_not_be_read_or_printed";
  await assert.rejects(
    execFileAsync(process.execPath, ["--import", tsxImport, preflightCliPath], {
      cwd: repositoryRoot,
      encoding: "utf8",
      env: {
        ...process.env,
        SUPABASE_PRODUCTION_SECRET_KEY: sentinelSecret,
      },
    }),
    (error) => {
      assert.match(error.stdout, /Production rule catalog preflight: BLOCKED/);
      assert.match(error.stdout, /Network access: none/);
      assert.match(error.stdout, /Secrets read: none/);
      assert.equal(error.stdout.includes(sentinelSecret), false);
      assert.equal(error.stderr, "");
      return true;
    },
  );
});
