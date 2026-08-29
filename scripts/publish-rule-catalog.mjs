import { execFile } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { promisify } from "node:util";

import * as ed25519 from "@noble/ed25519";

import {
  createRuleCatalogPublication,
  RuleCatalogPublicationError,
} from "../src/rules/rule-catalog-publication.ts";
import {
  canonicalizeRuleJson,
  verifyRuleCatalogArtifacts,
  verifyRuleManifest,
} from "../src/rules/rule-catalog-verification.ts";
import { validateRuleCatalogPublicationRequest } from "../src/rules/validation.ts";

const execFileAsync = promisify(execFile);
const workspaceRoot = path.resolve(process.cwd());
const maximumInputBytes = 524_288;
const signingKeyEnvironmentName = "RULE_CATALOG_SIGNING_KEY_BASE64URL";

function usage() {
  return [
    "Usage: npm run rules:publish -- --request <rules/releases/*.json> [options]",
    "",
    "Options:",
    "  --output-dir <dist/rule-catalog[/...]>  Local publication root",
    "  --previous-manifest <path>              Verified current manifest override",
    "  --rollback-manifest <path>              Verified rollback target manifest",
    "  --trusted-public-key <keyId=base64url>  Previous signing key; repeatable",
    "  --dry-run                               Validate and sign without writing",
    "",
    `Secret input: ${signingKeyEnvironmentName} must contain a 32-byte unpadded base64url seed.`,
  ].join("\n");
}

function parseArguments(argv) {
  const options = {
    requestPath: null,
    outputDirectory: "dist/rule-catalog",
    previousManifestPath: null,
    rollbackManifestPath: null,
    trustedPublicKeys: [],
    dryRun: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
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
    if (argument === "--request") options.requestPath = value;
    else if (argument === "--output-dir") options.outputDirectory = value;
    else if (argument === "--previous-manifest") options.previousManifestPath = value;
    else if (argument === "--rollback-manifest") options.rollbackManifestPath = value;
    else if (argument === "--trusted-public-key") options.trustedPublicKeys.push(value);
    else throw new Error(`Unknown argument ${argument}.\n\n${usage()}`);
  }
  if (options.requestPath === null) throw new Error(`--request is required.\n\n${usage()}`);
  return options;
}

function isInside(parent, candidate) {
  const relative = path.relative(parent, candidate);
  return (
    relative === "" ||
    (!path.isAbsolute(relative) && !relative.startsWith(`..${path.sep}`) && relative !== "..")
  );
}

function resolveInsideWorkspace(inputPath, label) {
  const resolved = path.resolve(workspaceRoot, inputPath);
  if (!isInside(workspaceRoot, resolved)) {
    throw new Error(`${label} must stay inside the repository workspace.`);
  }
  return resolved;
}

function repoRelativePath(absolutePath) {
  return path.relative(workspaceRoot, absolutePath).split(path.sep).join("/");
}

function resolveRequestPath(requestPath) {
  const absolutePath = resolveInsideWorkspace(requestPath, "The publication request");
  const relativePath = repoRelativePath(absolutePath);
  if (!/^rules\/releases\/[a-z0-9][0-9A-Za-z._/-]*\.json$/.test(relativePath)) {
    throw new Error("The publication request must be a JSON file below rules/releases/.");
  }
  return absolutePath;
}

function resolveOutputDirectory(outputDirectory) {
  const allowedRoot = path.join(workspaceRoot, "dist", "rule-catalog");
  const resolved = resolveInsideWorkspace(outputDirectory, "The output directory");
  if (!isInside(allowedRoot, resolved)) {
    throw new Error("The output directory must stay below dist/rule-catalog/.");
  }
  return resolved;
}

async function readBoundedText(filePath, label) {
  const stats = await fs.stat(filePath);
  if (!stats.isFile()) throw new Error(`${label} is not a regular file.`);
  if (stats.size > maximumInputBytes) {
    throw new Error(`${label} exceeds ${maximumInputBytes} bytes.`);
  }
  return fs.readFile(filePath, "utf8");
}

async function readOptionalText(filePath, label) {
  try {
    return await readBoundedText(filePath, label);
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

function decodeBase64Url32(value, label) {
  if (!/^[A-Za-z0-9_-]{43}$/.test(value)) {
    throw new Error(`${label} must be canonical unpadded base64url for exactly 32 bytes.`);
  }
  const bytes = Uint8Array.from(Buffer.from(value, "base64url"));
  if (bytes.byteLength !== 32 || Buffer.from(bytes).toString("base64url") !== value) {
    throw new Error(`${label} must be canonical unpadded base64url for exactly 32 bytes.`);
  }
  return bytes;
}

function trustedPublicKeyMap(entries) {
  const result = new Map();
  for (const entry of entries) {
    const separator = entry.indexOf("=");
    if (separator <= 0) throw new Error("--trusted-public-key must use keyId=base64url.");
    const keyId = entry.slice(0, separator);
    const encodedKey = entry.slice(separator + 1);
    if (!/^[a-z0-9]+(?:[.-][a-z0-9]+)*$/.test(keyId)) {
      throw new Error(`Invalid trusted public key id: ${keyId}.`);
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

function parsePackageReviewCommit(sourceJson, sourcePath) {
  let value;
  try {
    value = JSON.parse(sourceJson);
  } catch {
    throw new Error(`Rule package ${sourcePath} is not valid JSON.`);
  }
  const review = value !== null && typeof value === "object" ? Reflect.get(value, "review") : null;
  const gitCommit =
    review !== null && typeof review === "object" ? Reflect.get(review, "gitCommit") : null;
  if (typeof gitCommit !== "string" || !/^[a-f0-9]{40}$/.test(gitCommit)) {
    throw new Error(`Rule package ${sourcePath} has no valid review.gitCommit.`);
  }
  return gitCommit;
}

async function assertTrackedAndClean(relativePaths) {
  const { stdout } = await execFileAsync(
    "git",
    ["status", "--porcelain=v1", "--untracked-files=all", "--", ...relativePaths],
    { cwd: workspaceRoot, encoding: "utf8", maxBuffer: 1024 * 1024 },
  );
  if (stdout.trim() !== "") {
    throw new Error(
      "The publication request and reviewed package sources must be tracked and clean.",
    );
  }
}

async function readReviewedGitContent(gitCommit, sourcePath) {
  try {
    const { stdout } = await execFileAsync("git", ["show", `${gitCommit}:${sourcePath}`], {
      cwd: workspaceRoot,
      encoding: "utf8",
      maxBuffer: maximumInputBytes + 1,
    });
    if (Buffer.byteLength(stdout, "utf8") > maximumInputBytes) {
      throw new Error("reviewed Git content is too large");
    }
    return stdout;
  } catch {
    throw new Error(`Could not load ${sourcePath} from its recorded review commit.`);
  }
}

function configureNodeCryptography(privateKey) {
  ed25519.hashes.sha512 = (message) =>
    Uint8Array.from(createHash("sha512").update(message).digest());
  const publicKey = ed25519.getPublicKey(privateKey);
  return {
    publicKey,
    signer: {
      sha256: async (bytes) => Uint8Array.from(createHash("sha256").update(bytes).digest()),
      signEd25519: async (message) => ed25519.sign(message, privateKey),
    },
    verifier: {
      sha256: async (bytes) => Uint8Array.from(createHash("sha256").update(bytes).digest()),
      verifyEd25519: async (signature, message, candidatePublicKey) =>
        ed25519.verify(signature, message, candidatePublicKey, { zip215: false }),
    },
  };
}

function manifestCanonicalJson(json, label) {
  try {
    return canonicalizeRuleJson(JSON.parse(json));
  } catch {
    throw new Error(`${label} is not canonicalizable JSON.`);
  }
}

async function verifyExistingManifest(manifestJson, request, trustedKeys, verifier) {
  return verifyRuleManifest(
    manifestJson,
    {
      expectedChannel: request.channel,
      supportedEngineContractVersions: new Set([1, 2, 3, 4, 5, 6]),
      trustedPublicKeys: trustedKeys,
    },
    verifier,
  );
}

async function preflightPublicationWrites(channelDirectory, publication, previousManifestJson) {
  for (const artifact of publication.artifacts.filter((candidate) => candidate.immutable)) {
    const targetPath = path.resolve(channelDirectory, artifact.relativePath);
    if (!isInside(channelDirectory, targetPath))
      throw new Error("Unsafe publication artifact path.");
    const existing = await readOptionalText(targetPath, `Existing ${artifact.relativePath}`);
    if (existing !== null && existing !== artifact.contents) {
      throw new Error(`Immutable publication artifact conflict at ${artifact.relativePath}.`);
    }
  }

  const currentPath = path.join(channelDirectory, "current.json");
  const existingCurrent = await readOptionalText(currentPath, "Existing current manifest");
  if (existingCurrent === null) return;
  const existingCanonical = manifestCanonicalJson(existingCurrent, "Existing current manifest");
  const publicationCanonical = manifestCanonicalJson(
    publication.manifestJson,
    "Publication manifest",
  );
  const previousCanonical =
    previousManifestJson === null
      ? null
      : manifestCanonicalJson(previousManifestJson, "Previous manifest");
  if (existingCanonical !== publicationCanonical && existingCanonical !== previousCanonical) {
    throw new Error("Local current.json does not match the verified previous or new manifest.");
  }
}

async function writeImmutable(targetPath, contents) {
  await fs.mkdir(path.dirname(targetPath), { recursive: true });
  try {
    await fs.writeFile(targetPath, contents, { encoding: "utf8", flag: "wx" });
  } catch (error) {
    if (error?.code !== "EEXIST") throw error;
    if ((await fs.readFile(targetPath, "utf8")) !== contents) {
      throw new Error(`Immutable publication artifact conflict at ${targetPath}.`);
    }
  }
}

async function writePublication(channelDirectory, publication) {
  for (const artifact of publication.artifacts.filter((candidate) => candidate.immutable)) {
    await writeImmutable(path.join(channelDirectory, artifact.relativePath), artifact.contents);
  }

  const currentArtifact = publication.artifacts.at(-1);
  if (currentArtifact?.role !== "CURRENT_MANIFEST") {
    throw new Error("The publication order does not end with current.json.");
  }
  await fs.mkdir(channelDirectory, { recursive: true });
  const currentPath = path.join(channelDirectory, currentArtifact.relativePath);
  const existing = await readOptionalText(currentPath, "Existing current manifest");
  if (existing === currentArtifact.contents) return;
  const temporaryPath = `${currentPath}.tmp-${process.pid}-${randomUUID()}`;
  try {
    await fs.writeFile(temporaryPath, currentArtifact.contents, { encoding: "utf8", flag: "wx" });
    await fs.rename(temporaryPath, currentPath);
  } finally {
    await fs.rm(temporaryPath, { force: true });
  }
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const requestPath = resolveRequestPath(options.requestPath);
  const outputDirectory = resolveOutputDirectory(options.outputDirectory);
  const requestJson = await readBoundedText(requestPath, "The publication request");
  let requestValue;
  try {
    requestValue = JSON.parse(requestJson);
  } catch {
    throw new Error("The publication request is not valid JSON.");
  }
  const requestValidation = validateRuleCatalogPublicationRequest(requestValue);
  if (!requestValidation.ok) {
    const details = requestValidation.issues
      .map((issue) => `${issue.code} ${issue.path}: ${issue.message}`)
      .join("\n");
    throw new Error(`The publication request is invalid.\n${details}`);
  }
  const request = requestValidation.value;
  const sourcePaths = request.packageSources.map((sourcePath) =>
    resolveInsideWorkspace(sourcePath, `Rule package ${sourcePath}`),
  );
  await assertTrackedAndClean([
    repoRelativePath(requestPath),
    ...sourcePaths.map(repoRelativePath),
  ]);

  const signingKeyValue = process.env[signingKeyEnvironmentName];
  if (signingKeyValue === undefined) {
    throw new Error(
      `${signingKeyEnvironmentName} is required and must not be stored in the repository.`,
    );
  }
  const privateKey = decodeBase64Url32(signingKeyValue, signingKeyEnvironmentName);
  delete process.env[signingKeyEnvironmentName];
  try {
    const nodeCryptography = configureNodeCryptography(privateKey);
    const trustedKeys = trustedPublicKeyMap(options.trustedPublicKeys);
    const configuredCurrentKey = trustedKeys.get(request.signing.keyId);
    if (
      configuredCurrentKey !== undefined &&
      !Buffer.from(configuredCurrentKey).equals(Buffer.from(nodeCryptography.publicKey))
    ) {
      throw new Error(
        `The supplied public key for ${request.signing.keyId} does not match the signing key.`,
      );
    }
    trustedKeys.set(request.signing.keyId, nodeCryptography.publicKey);

    const channelDirectory = path.join(outputDirectory, request.channel.toLowerCase());
    const automaticPreviousPath = path.join(channelDirectory, "current.json");
    const previousManifestPath =
      options.previousManifestPath === null
        ? automaticPreviousPath
        : resolveInsideWorkspace(options.previousManifestPath, "The previous manifest");
    const previousManifestJson = await readOptionalText(
      previousManifestPath,
      "The previous manifest",
    );
    const verifiedPreviousManifest =
      previousManifestJson === null
        ? null
        : await verifyExistingManifest(
            previousManifestJson,
            request,
            trustedKeys,
            nodeCryptography.verifier,
          );

    const rollbackManifestJson =
      options.rollbackManifestPath === null
        ? null
        : await readBoundedText(
            resolveInsideWorkspace(options.rollbackManifestPath, "The rollback manifest"),
            "The rollback manifest",
          );
    const verifiedRollbackManifest =
      rollbackManifestJson === null
        ? null
        : await verifyExistingManifest(
            rollbackManifestJson,
            request,
            trustedKeys,
            nodeCryptography.verifier,
          );

    const sources = await Promise.all(
      request.packageSources.map(async (sourcePath, index) => {
        const sourceJson = await readBoundedText(sourcePaths[index], `Rule package ${sourcePath}`);
        const reviewedCommit = parsePackageReviewCommit(sourceJson, sourcePath);
        return {
          sourcePath,
          sourceJson,
          reviewedCommit,
          reviewedCommitJson: await readReviewedGitContent(reviewedCommit, sourcePath),
        };
      }),
    );
    const publication = await createRuleCatalogPublication({
      request,
      sources,
      signer: nodeCryptography.signer,
      verifiedPreviousManifest,
      verifiedRollbackManifest,
    });
    await verifyRuleCatalogArtifacts(
      { manifestJson: publication.manifestJson, packageJson: publication.packageJson },
      {
        expectedChannel: request.channel,
        supportedEngineContractVersions: new Set([1, 2, 3, 4, 5, 6]),
        trustedPublicKeys: new Map([[request.signing.keyId, nodeCryptography.publicKey]]),
      },
      nodeCryptography.verifier,
    );
    await preflightPublicationWrites(channelDirectory, publication, previousManifestJson);
    if (!options.dryRun) await writePublication(channelDirectory, publication);

    console.log(
      [
        `${options.dryRun ? "Validated" : "Published"} ${request.channel} generation ${request.generation}.`,
        `Key: ${request.signing.keyId}`,
        `Packages: ${publication.packageJson.length}`,
        `Local root: ${repoRelativePath(channelDirectory)}`,
        `Result: ${publication.idempotentRetry ? "idempotent retry" : "new generation"}`,
        `Writes: ${options.dryRun ? "none (dry-run)" : "packages, versioned manifest, current.json last"}`,
      ].join("\n"),
    );
  } finally {
    privateKey.fill(0);
  }
}

main().catch((error) => {
  if (error instanceof RuleCatalogPublicationError) {
    console.error(`${error.code}: ${error.message}`);
    for (const issue of error.issues) {
      console.error(`${issue.code} ${issue.path}: ${issue.message}`);
    }
  } else {
    console.error(error instanceof Error ? error.message : "Rule catalog publication failed.");
  }
  process.exitCode = 1;
});
