import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";

import * as ed25519 from "@noble/ed25519";

import {
  RuleCatalogVerificationError,
  verifyRuleCatalogArtifacts,
  verifyRuleManifest,
} from "../src/rules/rule-catalog-verification.ts";
import {
  createSupabaseRuleCatalogStorage,
  deliverPreviewRuleCatalog,
  RuleCatalogDeliveryError,
  ruleCatalogDeliveryConstants,
} from "./supabase-rule-catalog-storage.mjs";

const workspaceRoot = path.resolve(process.cwd());
const allowedPublicationRoot = path.join(workspaceRoot, "dist", "rule-catalog");
const secretKeyEnvironmentName = "SUPABASE_SECRET_KEY";
const supabaseUrlEnvironmentName = "SUPABASE_URL";

function usage() {
  return [
    "Usage: npm run rules:deliver -- --manifest <dist/rule-catalog/.../preview/manifests/N.json> [options]",
    "",
    "Options:",
    "  --trusted-public-key <keyId=base64url>  Trusted PREVIEW public key; repeatable",
    "  --create-bucket                         Create the locked-down bucket if absent",
    "  --dry-run                               Verify local artifacts without network access",
    "",
    `Secret input: ${secretKeyEnvironmentName} must contain a backend-only sb_secret_ key.`,
    `${supabaseUrlEnvironmentName} must contain the Supabase project root URL.`,
  ].join("\n");
}

function parseArguments(argv) {
  const options = {
    manifestPath: null,
    trustedPublicKeys: [],
    createBucket: false,
    dryRun: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--create-bucket") {
      options.createBucket = true;
      continue;
    }
    if (argument === "--dry-run") {
      options.dryRun = true;
      continue;
    }
    if (argument === "--help" || argument === "-h") {
      console.log(usage());
      process.exit(0);
    }
    const value = argv[index + 1];
    if (value === undefined || value.startsWith("--")) {
      throw new Error(`Missing value for ${argument}.\n\n${usage()}`);
    }
    index += 1;
    if (argument === "--manifest") options.manifestPath = value;
    else if (argument === "--trusted-public-key") options.trustedPublicKeys.push(value);
    else throw new Error(`Unknown argument ${argument}.\n\n${usage()}`);
  }
  if (options.manifestPath === null) throw new Error(`--manifest is required.\n\n${usage()}`);
  if (options.trustedPublicKeys.length === 0) {
    throw new Error(`At least one --trusted-public-key is required.\n\n${usage()}`);
  }
  return options;
}

function isInside(parent, candidate) {
  const relative = path.relative(parent, candidate);
  return (
    relative === "" ||
    (!path.isAbsolute(relative) && !relative.startsWith(`..${path.sep}`) && relative !== "..")
  );
}

function repoRelativePath(absolutePath) {
  return path.relative(workspaceRoot, absolutePath).split(path.sep).join("/");
}

function resolveManifestPath(inputPath) {
  const resolved = path.resolve(workspaceRoot, inputPath);
  if (!isInside(allowedPublicationRoot, resolved)) {
    throw new Error("The manifest must stay below dist/rule-catalog/.");
  }
  if (path.basename(path.dirname(resolved)) !== "manifests") {
    throw new Error("The manifest must be inside a manifests directory.");
  }
  const channelRoot = path.dirname(path.dirname(resolved));
  if (path.basename(channelRoot) !== "preview") {
    throw new Error("WP4b accepts only a local preview publication directory.");
  }
  const generationMatch = /^([1-9][0-9]*)\.json$/.exec(path.basename(resolved));
  if (generationMatch === null) {
    throw new Error("The manifest filename must be its positive generation number.");
  }
  return { resolved, channelRoot, fileGeneration: Number(generationMatch[1]) };
}

async function readBoundedUtf8(filePath, label) {
  const stat = await fs.stat(filePath);
  if (!stat.isFile()) throw new Error(`${label} is not a regular file.`);
  if (stat.size > ruleCatalogDeliveryConstants.maximumArtifactBytes) {
    throw new Error(`${label} exceeds the rule artifact size limit.`);
  }
  const contents = await fs.readFile(filePath);
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(contents);
  } catch {
    throw new Error(`${label} is not valid UTF-8.`);
  }
}

function decodeBase64Url32(value, label) {
  if (!/^[A-Za-z0-9_-]{43}$/.test(value)) {
    throw new Error(`${label} must be canonical unpadded base64url for exactly 32 bytes.`);
  }
  const decoded = Uint8Array.from(Buffer.from(value, "base64url"));
  if (decoded.byteLength !== 32 || Buffer.from(decoded).toString("base64url") !== value) {
    throw new Error(`${label} must be canonical unpadded base64url for exactly 32 bytes.`);
  }
  return decoded;
}

function trustedPublicKeyMap(entries) {
  const result = new Map();
  for (const entry of entries) {
    const separator = entry.indexOf("=");
    if (separator <= 0) throw new Error("--trusted-public-key must use keyId=base64url.");
    const keyId = entry.slice(0, separator);
    const encodedKey = entry.slice(separator + 1);
    if (!/^[a-z0-9]+(?:[.-][a-z0-9]+)*$/.test(keyId) || !keyId.startsWith("preview-")) {
      throw new Error(`Invalid PREVIEW public key id: ${keyId}.`);
    }
    const publicKey = decodeBase64Url32(encodedKey, `Public key ${keyId}`);
    const existing = result.get(keyId);
    if (existing !== undefined && !Buffer.from(existing).equals(Buffer.from(publicKey))) {
      throw new Error(`Conflicting public keys were supplied for ${keyId}.`);
    }
    result.set(keyId, publicKey);
  }
  return result;
}

function nodeCryptography() {
  ed25519.hashes.sha512 = (message) =>
    Uint8Array.from(createHash("sha512").update(message).digest());
  return Object.freeze({
    sha256: async (value) => Uint8Array.from(createHash("sha256").update(value).digest()),
    verifyEd25519: async (signature, message, publicKey) =>
      ed25519.verify(signature, message, publicKey, { zip215: false }),
  });
}

function packagePath(channelRoot, relativePath) {
  if (!/^packages\/[a-z0-9.-]+\/[0-9A-Za-z._-]+\.json$/.test(relativePath)) {
    throw new Error("The signed manifest contains an unsupported package path.");
  }
  const resolved = path.resolve(channelRoot, ...relativePath.split("/"));
  if (!isInside(channelRoot, resolved)) throw new Error("The signed package path is unsafe.");
  return resolved;
}

function publicationArtifacts(manifest, manifestJson, packageJson) {
  return Object.freeze([
    ...manifest.packages.map((descriptor, index) =>
      Object.freeze({
        objectPath: `preview/${descriptor.path}`,
        contents: packageJson[index],
        immutable: true,
        role: "PACKAGE",
        cacheControl: ruleCatalogDeliveryConstants.immutableCacheControl,
      }),
    ),
    Object.freeze({
      objectPath: `preview/manifests/${manifest.generation}.json`,
      contents: manifestJson,
      immutable: true,
      role: "VERSIONED_MANIFEST",
      cacheControl: ruleCatalogDeliveryConstants.immutableCacheControl,
    }),
    Object.freeze({
      objectPath: "preview/current.json",
      contents: manifestJson,
      immutable: false,
      role: "CURRENT_MANIFEST",
      cacheControl: ruleCatalogDeliveryConstants.currentCacheControl,
    }),
  ]);
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const manifestLocation = resolveManifestPath(options.manifestPath);
  const manifestJson = await readBoundedUtf8(manifestLocation.resolved, "The local manifest");
  const trustedPublicKeys = trustedPublicKeyMap(options.trustedPublicKeys);
  const cryptography = nodeCryptography();
  const verificationPolicy = Object.freeze({
    expectedChannel: "PREVIEW",
    supportedEngineContractVersions: new Set([1, 2, 3, 4]),
    trustedPublicKeys,
  });
  const manifest = await verifyRuleManifest(manifestJson, verificationPolicy, cryptography);
  if (manifest.generation !== manifestLocation.fileGeneration) {
    throw new Error("The signed manifest generation does not match its filename.");
  }
  const packageJson = await Promise.all(
    manifest.packages.map((descriptor) =>
      readBoundedUtf8(
        packagePath(manifestLocation.channelRoot, descriptor.path),
        `Rule package ${descriptor.packageId}:${descriptor.versionId}`,
      ),
    ),
  );
  await verifyRuleCatalogArtifacts({ manifestJson, packageJson }, verificationPolicy, cryptography);
  const publication = Object.freeze({
    manifest,
    manifestJson,
    artifacts: publicationArtifacts(manifest, manifestJson, packageJson),
  });

  if (options.dryRun) {
    console.log(
      [
        `Validated local PREVIEW generation ${manifest.generation} for delivery.`,
        `Key: ${manifest.signing.keyId}`,
        `Packages: ${packageJson.length}`,
        `Local manifest: ${repoRelativePath(manifestLocation.resolved)}`,
        "Network writes: none (dry-run)",
      ].join("\n"),
    );
    return;
  }

  const supabaseUrl = process.env[supabaseUrlEnvironmentName];
  const secretKey = process.env[secretKeyEnvironmentName];
  delete process.env[secretKeyEnvironmentName];
  if (supabaseUrl === undefined) {
    throw new Error(`${supabaseUrlEnvironmentName} is required for remote delivery.`);
  }
  if (secretKey === undefined) {
    throw new Error(
      `${secretKeyEnvironmentName} is required and must not be stored in the repository.`,
    );
  }
  const storage = createSupabaseRuleCatalogStorage({ supabaseUrl, secretKey });
  const result = await deliverPreviewRuleCatalog({
    storage,
    publication,
    verifyRemoteManifest: (remoteManifestJson) =>
      verifyRuleManifest(remoteManifestJson, verificationPolicy, cryptography),
    createBucket: options.createBucket,
  });

  console.log(
    [
      `Delivered PREVIEW generation ${manifest.generation}.`,
      `Key: ${manifest.signing.keyId}`,
      `Bucket: ${storage.bucket}`,
      `Immutable objects: ${result.created} created, ${result.reused} reused`,
      `Activation: ${result.currentChanged ? "current.json updated last" : "already current"}`,
      `Result: ${result.idempotent ? "idempotent retry" : "new generation"}`,
    ].join("\n"),
  );
}

main().catch((error) => {
  if (error instanceof RuleCatalogVerificationError || error instanceof RuleCatalogDeliveryError) {
    console.error(`${error.code}: ${error.message}`);
    if (error instanceof RuleCatalogVerificationError) {
      for (const issue of error.issues) {
        console.error(`${issue.code} ${issue.path}: ${issue.message}`);
      }
    }
  } else {
    console.error(error instanceof Error ? error.message : "Rule catalog delivery failed.");
  }
  process.exitCode = 1;
});
