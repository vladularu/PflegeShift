import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import test from "node:test";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";

import { PREVIEW_RULE_CATALOG_TRUST } from "../src/composition/rule-catalog-preview-trust.ts";
import {
  parseProductionTrustCommand,
  preflightProductionTrustPreparation,
  ProductionTrustOperatorError,
  PRODUCTION_RULE_CATALOG_INITIAL_KEY_ID,
  runProductionTrustOperator,
  validateProductionPublicKey,
} from "./production-rule-catalog-trust-operator.mjs";

const execFileAsync = promisify(execFile);
const repositoryRoot = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const contractPath = path.join(repositoryRoot, "rules", "config", "production-channel.json");
const operatorPath = path.join(
  repositoryRoot,
  "scripts",
  "production-rule-catalog-trust-operator.mjs",
);
const wrapperPath = path.join(
  repositoryRoot,
  "scripts",
  "operators",
  "prepare-production-rule-catalog-trust.ps1",
);
const require = createRequire(import.meta.url);
const tsxImport = pathToFileURL(require.resolve("tsx")).href;
const signingSeedEnvironmentName = "RULE_CATALOG_SIGNING_KEY_BASE64URL";

async function committedConfig() {
  return JSON.parse(await fs.readFile(contractPath, "utf8"));
}

function preCandidateConfig(config) {
  const result = structuredClone(config);
  result.status = "DISABLED";
  result.infrastructure.supabaseProjectUrl = null;
  result.trust.trustedPublicKeys = [];
  result.remote.publicBaseUrl = null;
  return result;
}

test("operator accepts only secret-free preflight and public-key derivation", () => {
  assert.equal(parseProductionTrustCommand(["preflight"]), "PREFLIGHT");
  assert.equal(parseProductionTrustCommand(["derive"]), "DERIVE");
  for (const argumentsValue of [[], ["generate"], ["sign"], ["deliver"], ["preflight", "derive"]]) {
    assert.throws(
      () => parseProductionTrustCommand(argumentsValue),
      (error) => error.code === "INVALID_COMMAND",
    );
  }
});

test("pre-candidate contract is ready before any seed is read", async () => {
  const config = preCandidateConfig(await committedConfig());
  assert.deepEqual(preflightProductionTrustPreparation(config), {
    status: "READY_TO_PREPARE",
    issues: [],
  });
  const environment = { [signingSeedEnvironmentName]: "must-not-be-read" };
  const result = runProductionTrustOperator({ command: "PREFLIGHT", config, environment });
  assert.equal(result.status, "READY_TO_PREPARE");
  assert.equal(result.keyId, PRODUCTION_RULE_CATALOG_INITIAL_KEY_ID);
  assert.equal(result.seedRead, false);
  assert.equal(environment[signingSeedEnvironmentName], "must-not-be-read");
  assert.equal(result.capabilities.networkAccess, false);
  assert.equal(result.capabilities.localWrite, false);
  assert.equal(result.capabilities.signing, false);
  assert.equal(result.capabilities.delivery, false);
  assert.equal(result.capabilities.activation, false);
});

test("derive returns only a canonical Production public key and removes the seed", async () => {
  const config = preCandidateConfig(await committedConfig());
  const encodedSeed = Buffer.alloc(32, 7).toString("base64url");
  const environment = { [signingSeedEnvironmentName]: encodedSeed };
  const result = runProductionTrustOperator({ command: "DERIVE", config, environment });

  assert.equal(result.status, "PUBLIC_KEY_DERIVED");
  assert.equal(result.keyId, "production-2026-r1");
  assert.match(result.publicKeyBase64Url, /^[A-Za-z0-9_-]{43}$/u);
  assert.equal(result.seedRemovedFromEnvironment, true);
  assert.equal(environment[signingSeedEnvironmentName], undefined);
  assert.equal(JSON.stringify(result).includes(encodedSeed), false);
  assert.equal(
    PREVIEW_RULE_CATALOG_TRUST.trustedPublicKeys.some(
      ({ publicKey }) => Buffer.from(publicKey).toString("base64url") === result.publicKeyBase64Url,
    ),
    false,
  );
});

test("derive rejects invalid seed input without reflecting it", async () => {
  const config = preCandidateConfig(await committedConfig());
  const environment = { [signingSeedEnvironmentName]: "invalid-secret-value" };
  assert.throws(
    () => runProductionTrustOperator({ command: "DERIVE", config, environment }),
    (error) => {
      assert.equal(error.code, "INVALID_SIGNING_SEED");
      assert.equal(error.message.includes("invalid-secret-value"), false);
      return true;
    },
  );
  assert.equal(environment[signingSeedEnvironmentName], undefined);
});

test("committed Candidate blocks preparation before environment access", async () => {
  const config = await committedConfig();
  assert.deepEqual(
    preflightProductionTrustPreparation(config).issues.map(({ code }) => code),
    [
      "PRODUCTION_NOT_DISABLED",
      "PROJECT_ALREADY_CONFIGURED",
      "REMOTE_ALREADY_CONFIGURED",
      "TRUST_ALREADY_CONFIGURED",
    ],
  );
  const environment = new Proxy(
    {},
    {
      get() {
        throw new Error("The environment was read before preflight completed.");
      },
    },
  );
  assert.throws(
    () => runProductionTrustOperator({ command: "DERIVE", config, environment }),
    (error) => error.code === "PREFLIGHT_BLOCKED",
  );
});

test("Production public-key validation rejects every Preview trust key", () => {
  for (const { publicKey } of PREVIEW_RULE_CATALOG_TRUST.trustedPublicKeys) {
    assert.throws(
      () => validateProductionPublicKey(publicKey),
      (error) => error.code === "PREVIEW_TRUST_REUSE",
    );
  }
  assert.throws(
    () => validateProductionPublicKey(new Uint8Array(31)),
    (error) => error.code === "INVALID_PUBLIC_KEY",
  );
});

test("CLI preflight fails closed after Candidate recording without printing a seed", async () => {
  const sentinelSeed = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
  await assert.rejects(
    execFileAsync(process.execPath, ["--import", tsxImport, operatorPath, "preflight"], {
      cwd: repositoryRoot,
      encoding: "utf8",
      env: { ...process.env, [signingSeedEnvironmentName]: sentinelSeed },
    }),
    (error) => {
      assert.match(error.stderr, /PREFLIGHT_BLOCKED/u);
      assert.equal(error.stdout.includes(sentinelSeed), false);
      assert.equal(error.stderr.includes(sentinelSeed), false);
      return true;
    },
  );
});

test("CLI derive refuses the committed Candidate without printing the supplied seed", async () => {
  const encodedSeed = Buffer.alloc(32, 11).toString("base64url");
  await assert.rejects(
    execFileAsync(process.execPath, ["--import", tsxImport, operatorPath, "derive"], {
      cwd: repositoryRoot,
      encoding: "utf8",
      env: { ...process.env, [signingSeedEnvironmentName]: encodedSeed },
    }),
    (error) => {
      assert.match(error.stderr, /PREFLIGHT_BLOCKED/u);
      assert.equal(error.stdout.includes(encodedSeed), false);
      assert.equal(error.stderr.includes(encodedSeed), false);
      return true;
    },
  );
});

test("operator source has no network, signing, delivery, or filesystem-write primitive", async () => {
  const source = await fs.readFile(operatorPath, "utf8");
  for (const forbiddenPrimitive of [
    "fetch(",
    "node:http",
    "node:https",
    "writeFile",
    "appendFile",
    "createWriteStream",
    "execFile",
    "spawn(",
    "SUPABASE_PRODUCTION_SECRET_KEY",
  ]) {
    assert.equal(source.includes(forbiddenPrimitive), false, forbiddenPrimitive);
  }
});

test("PowerShell wrapper preflights before random generation and protects with DPAPI", async () => {
  const source = await fs.readFile(wrapperPath, "utf8");
  assert.match(source, /production-2026-r1/u);
  assert.match(source, /ProtectedData\]::Protect/u);
  assert.match(source, /ProtectedData\]::Unprotect/u);
  assert.match(source, /DataProtectionScope\]::CurrentUser/u);
  assert.match(source, /FileMode\]::CreateNew/u);
  assert.match(source, /Remove-Item Env:RULE_CATALOG_SIGNING_KEY_BASE64URL/u);
  assert.match(source, /\[Array\]::Clear\(\$SeedBytes/u);
  assert.equal(source.includes("Set-Clipboard"), false);
  assert.ok(
    source.indexOf('"preflight"') <
      source.indexOf("[Security.Cryptography.RandomNumberGenerator]::Create()"),
  );
});

test("operator errors expose stable codes without secret values", () => {
  const error = new ProductionTrustOperatorError("TEST_CODE", "safe message");
  assert.equal(error.code, "TEST_CODE");
  assert.equal(error.message, "safe message");
});
