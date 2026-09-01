import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import * as ed25519 from "@noble/ed25519";

import { PREVIEW_RULE_CATALOG_TRUST } from "../src/composition/rule-catalog-preview-trust.ts";
import { preflightProductionProvisioningPlan } from "./production-rule-catalog-provisioning-operator.mjs";

const repositoryRoot = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const productionContractPath = path.join(
  repositoryRoot,
  "rules",
  "config",
  "production-channel.json",
);
const signingSeedEnvironmentName = "RULE_CATALOG_SIGNING_KEY_BASE64URL";

export const PRODUCTION_RULE_CATALOG_INITIAL_KEY_ID = "production-2026-r1";

const capabilities = Object.freeze({
  localRead: true,
  localWrite: false,
  networkAccess: false,
  remoteWrite: false,
  signing: false,
  delivery: false,
  activation: false,
});

export class ProductionTrustOperatorError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "ProductionTrustOperatorError";
    this.code = code;
  }
}

function fail(code, message) {
  throw new ProductionTrustOperatorError(code, message);
}

function issue(code, pathValue, message) {
  return Object.freeze({ code, path: pathValue, message });
}

function configureEd25519() {
  ed25519.hashes.sha512 = (message) =>
    Uint8Array.from(createHash("sha512").update(message).digest());
}

function decodeCanonicalSeed(value) {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(value)) {
    fail(
      "INVALID_SIGNING_SEED",
      `${signingSeedEnvironmentName} must be canonical base64url for exactly 32 bytes.`,
    );
  }
  const decoded = Uint8Array.from(Buffer.from(value, "base64url"));
  if (decoded.byteLength !== 32 || Buffer.from(decoded).toString("base64url") !== value) {
    decoded.fill(0);
    fail(
      "INVALID_SIGNING_SEED",
      `${signingSeedEnvironmentName} must be canonical base64url for exactly 32 bytes.`,
    );
  }
  return decoded;
}

function sameBytes(left, right) {
  if (left.byteLength !== right.byteLength) return false;
  for (let index = 0; index < left.byteLength; index += 1) {
    if (left[index] !== right[index]) return false;
  }
  return true;
}

export function validateProductionPublicKey(publicKey) {
  const canonical = Uint8Array.from(publicKey);
  if (canonical.byteLength !== 32) {
    fail("INVALID_PUBLIC_KEY", "The derived Production public key must contain exactly 32 bytes.");
  }
  const reusesPreviewTrust = PREVIEW_RULE_CATALOG_TRUST.trustedPublicKeys.some(({ publicKey }) =>
    sameBytes(canonical, Uint8Array.from(publicKey)),
  );
  if (reusesPreviewTrust) {
    fail(
      "PREVIEW_TRUST_REUSE",
      "Production must not reuse public signing key bytes trusted by Preview.",
    );
  }
  return Buffer.from(canonical).toString("base64url");
}

export function parseProductionTrustCommand(argumentsValue) {
  if (!Array.isArray(argumentsValue) || argumentsValue.length !== 1) {
    fail("INVALID_COMMAND", "Expected exactly one command: preflight or derive.");
  }
  if (argumentsValue[0] === "preflight") return "PREFLIGHT";
  if (argumentsValue[0] === "derive") return "DERIVE";
  fail(
    "INVALID_COMMAND",
    "Only preflight and derive are supported; generation, signing, delivery, and activation are unavailable.",
  );
}

export function preflightProductionTrustPreparation(config) {
  const provisioningPreflight = preflightProductionProvisioningPlan(config);
  if (provisioningPreflight.status !== "PLAN_READY") {
    return Object.freeze({
      status: "BLOCKED",
      issues: Object.freeze(
        provisioningPreflight.issues.map(({ code, path: pathValue }) =>
          issue(
            code,
            pathValue,
            "Production trust preparation requires the verified disabled pre-candidate contract.",
          ),
        ),
      ),
    });
  }
  return Object.freeze({ status: "READY_TO_PREPARE", issues: Object.freeze([]) });
}

function assertPreflightReady(config) {
  const preflight = preflightProductionTrustPreparation(config);
  if (preflight.status !== "READY_TO_PREPARE") {
    fail(
      "PREFLIGHT_BLOCKED",
      `Production trust preparation is blocked: ${preflight.issues
        .map(({ code }) => code)
        .join(", ")}.`,
    );
  }
  return preflight;
}

export function runProductionTrustOperator({ command, config, environment = process.env }) {
  const preflight = assertPreflightReady(config);
  if (command === "PREFLIGHT") {
    return Object.freeze({
      schemaVersion: 1,
      command,
      ...preflight,
      keyId: PRODUCTION_RULE_CATALOG_INITIAL_KEY_ID,
      seedRead: false,
      capabilities,
    });
  }
  if (command !== "DERIVE") {
    fail("INVALID_COMMAND", "The Production trust operator received an unsupported command.");
  }

  let encodedSeed = environment[signingSeedEnvironmentName];
  delete environment[signingSeedEnvironmentName];
  if (encodedSeed === undefined) {
    fail(
      "MISSING_SIGNING_SEED",
      `${signingSeedEnvironmentName} is required for public-key derivation and must not be stored in the repository.`,
    );
  }

  let seed = null;
  try {
    seed = decodeCanonicalSeed(encodedSeed);
    encodedSeed = null;
    configureEd25519();
    const publicKeyBase64Url = validateProductionPublicKey(ed25519.getPublicKey(seed));
    return Object.freeze({
      schemaVersion: 1,
      command,
      status: "PUBLIC_KEY_DERIVED",
      keyId: PRODUCTION_RULE_CATALOG_INITIAL_KEY_ID,
      algorithm: "ED25519",
      publicKeyBase64Url,
      seedRemovedFromEnvironment: environment[signingSeedEnvironmentName] === undefined,
      capabilities,
    });
  } finally {
    encodedSeed = null;
    if (seed !== null) seed.fill(0);
  }
}

async function loadCommittedConfig() {
  try {
    return JSON.parse(await readFile(productionContractPath, "utf8"));
  } catch {
    fail("CONTRACT_UNREADABLE", "The committed Production channel contract is unreadable.");
  }
}

async function main() {
  const command = parseProductionTrustCommand(process.argv.slice(2));
  const output = runProductionTrustOperator({
    command,
    config: await loadCommittedConfig(),
  });
  console.log(`PRODUCTION_TRUST_RESULT ${JSON.stringify(output)}`);
}

const invokedPath = process.argv[1] === undefined ? null : path.resolve(process.argv[1]);
if (invokedPath === fileURLToPath(import.meta.url)) {
  try {
    await main();
  } catch (error) {
    const code = error instanceof ProductionTrustOperatorError ? error.code : "OPERATOR_FAILED";
    console.error(`${code}: ${error instanceof Error ? error.message : "Unknown operator error."}`);
    process.exitCode = 1;
  }
}
