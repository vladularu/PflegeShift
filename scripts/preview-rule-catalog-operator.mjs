import { createHash, randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";

import * as ed25519 from "@noble/ed25519";

import { PREVIEW_RULE_CATALOG_TRUST } from "../src/composition/rule-catalog-preview-trust.ts";
import { RULE_CATALOG_SUPPORTED_ENGINE_CONTRACT_VERSIONS } from "../src/rules/rule-catalog-engine-support.ts";
import {
  verifyRuleCatalogArtifacts,
  verifyRuleManifest,
} from "../src/rules/rule-catalog-verification.ts";
import { validateRuleCatalogPublicationRequest } from "../src/rules/validation.ts";
import { RULE_CATALOG_OPERATOR_ROOT } from "./rule-catalog-publication-paths.mjs";

const execFileAsync = promisify(execFile);
const signingKeyEnvironmentName = "RULE_CATALOG_SIGNING_KEY_BASE64URL";
const secretKeyEnvironmentName = "SUPABASE_SECRET_KEY";
const supabaseUrlEnvironmentName = "SUPABASE_URL";
const maximumArtifactBytes = 524_288;
const defaultRetryDelaysMilliseconds = Object.freeze([0, 500, 1_500, 3_000, 5_000, 10_000]);

export class PreviewRuleCatalogOperatorError extends Error {
  constructor(code, message, options) {
    super(message, options);
    this.name = "PreviewRuleCatalogOperatorError";
    this.code = code;
  }
}

function usage() {
  return [
    "Usage:",
    "  npm run rules:preview:recover -- --generation <positive integer>",
    "  npm run rules:preview:prepare -- --request rules/releases/<request>.json",
    "  npm run rules:preview:preflight -- --generation <positive integer>",
    "  npm run rules:preview:activate -- --generation <positive integer> [--create-bucket]",
    "  npm run rules:preview:verify -- --generation <positive integer>",
    "",
    "Recover performs public reads and local writes only and never accepts a secret.",
    "Prepare performs public reads and local writes only.",
    "Preflight verifies prepared local artifacts and never accepts a secret.",
    "Activate is the only command that writes to Supabase.",
    "Verify performs public reads only and never accepts a secret.",
  ].join("\n");
}

function parsePositiveInteger(value, label) {
  if (!/^[1-9][0-9]*$/.test(value ?? "")) {
    throw new Error(`${label} must be a positive integer.\n\n${usage()}`);
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) {
    throw new Error(`${label} must be a safe positive integer.\n\n${usage()}`);
  }
  return parsed;
}

function parseNamedOptions(argv, allowedFlags) {
  const values = new Map();
  const flags = new Set();
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (allowedFlags.has(argument)) {
      if (flags.has(argument))
        throw new Error(`${argument} may be supplied only once.\n\n${usage()}`);
      flags.add(argument);
      continue;
    }
    if (!argument.startsWith("--"))
      throw new Error(`Unexpected argument ${argument}.\n\n${usage()}`);
    const value = argv[index + 1];
    if (value === undefined || value.startsWith("--")) {
      throw new Error(`Missing value for ${argument}.\n\n${usage()}`);
    }
    if (values.has(argument))
      throw new Error(`${argument} may be supplied only once.\n\n${usage()}`);
    values.set(argument, value);
    index += 1;
  }
  return { values, flags };
}

export function parsePreviewOperatorArguments(command, argv) {
  if (command === "recover") {
    const { values, flags } = parseNamedOptions(argv, new Set());
    if (flags.size > 0 || [...values.keys()].some((key) => key !== "--generation")) {
      throw new Error(`Recover accepts only --generation.\n\n${usage()}`);
    }
    return {
      command,
      generation: parsePositiveInteger(values.get("--generation"), "--generation"),
    };
  }
  if (command === "prepare") {
    const { values, flags } = parseNamedOptions(argv, new Set());
    if (flags.size > 0 || [...values.keys()].some((key) => key !== "--request")) {
      throw new Error(`Prepare accepts only --request.\n\n${usage()}`);
    }
    const requestPath = values.get("--request");
    if (requestPath === undefined) throw new Error(`--request is required.\n\n${usage()}`);
    return { command, requestPath };
  }
  if (command === "preflight") {
    const { values, flags } = parseNamedOptions(argv, new Set());
    if (flags.size > 0 || [...values.keys()].some((key) => key !== "--generation")) {
      throw new Error(`Preflight accepts only --generation.\n\n${usage()}`);
    }
    return {
      command,
      generation: parsePositiveInteger(values.get("--generation"), "--generation"),
    };
  }
  if (command === "activate") {
    const { values, flags } = parseNamedOptions(argv, new Set(["--create-bucket"]));
    if ([...values.keys()].some((key) => key !== "--generation")) {
      throw new Error(`Activate accepts only --generation and --create-bucket.\n\n${usage()}`);
    }
    return {
      command,
      generation: parsePositiveInteger(values.get("--generation"), "--generation"),
      createBucket: flags.has("--create-bucket"),
    };
  }
  if (command === "verify") {
    const { values, flags } = parseNamedOptions(argv, new Set());
    if (flags.size > 0 || [...values.keys()].some((key) => key !== "--generation")) {
      throw new Error(`Verify accepts only --generation.\n\n${usage()}`);
    }
    return {
      command,
      generation: parsePositiveInteger(values.get("--generation"), "--generation"),
    };
  }
  throw new Error(`Unknown Preview operator command ${command ?? "<missing>"}.\n\n${usage()}`);
}

function trustedPublicKeyMap() {
  return new Map(
    PREVIEW_RULE_CATALOG_TRUST.trustedPublicKeys.map(({ keyId, publicKey }) => [
      keyId,
      Uint8Array.from(publicKey),
    ]),
  );
}

export function previewTrustedPublicKeyArguments() {
  return PREVIEW_RULE_CATALOG_TRUST.trustedPublicKeys.flatMap(({ keyId, publicKey }) => [
    "--trusted-public-key",
    `${keyId}=${Buffer.from(publicKey).toString("base64url")}`,
  ]);
}

function verificationPolicy() {
  return Object.freeze({
    expectedChannel: PREVIEW_RULE_CATALOG_TRUST.channel,
    supportedEngineContractVersions: new Set(RULE_CATALOG_SUPPORTED_ENGINE_CONTRACT_VERSIONS),
    trustedPublicKeys: trustedPublicKeyMap(),
  });
}

function nodeCryptography() {
  ed25519.hashes.sha512 = (message) =>
    Uint8Array.from(createHash("sha512").update(message).digest());
  return Object.freeze({
    sha256: async (bytes) => Uint8Array.from(createHash("sha256").update(bytes).digest()),
    verifyEd25519: async (signature, message, publicKey) =>
      ed25519.verify(signature, message, publicKey, { zip215: false }),
  });
}

async function verifyPreviewManifestJson(manifestJson) {
  return verifyRuleManifest(manifestJson, verificationPolicy(), nodeCryptography());
}

async function verifyPreviewCatalogArtifacts(artifacts) {
  return verifyRuleCatalogArtifacts(artifacts, verificationPolicy(), nodeCryptography());
}

function isInside(parent, candidate) {
  const relative = path.relative(parent, candidate);
  return (
    relative === "" ||
    (!path.isAbsolute(relative) && !relative.startsWith(`..${path.sep}`) && relative !== "..")
  );
}

function repoRelativePath(workspaceRoot, absolutePath) {
  return path.relative(workspaceRoot, absolutePath).split(path.sep).join("/");
}

function resolveRequestPath(workspaceRoot, requestPath) {
  const resolved = path.resolve(workspaceRoot, requestPath);
  if (!isInside(workspaceRoot, resolved)) {
    throw new PreviewRuleCatalogOperatorError(
      "REQUEST_PATH_NOT_ALLOWED",
      "The publication request must stay inside the repository workspace.",
    );
  }
  const relative = repoRelativePath(workspaceRoot, resolved);
  if (!/^rules\/releases\/[a-z0-9][0-9A-Za-z._/-]*\.json$/.test(relative)) {
    throw new PreviewRuleCatalogOperatorError(
      "REQUEST_PATH_NOT_ALLOWED",
      "The publication request must be a JSON file below rules/releases/.",
    );
  }
  return { resolved, relative };
}

function operatorManifestPath(generation) {
  return `${RULE_CATALOG_OPERATOR_ROOT}/preview/manifests/${generation}.json`;
}

function operatorCurrentManifestPath() {
  return `${RULE_CATALOG_OPERATOR_ROOT}/preview/current.json`;
}

function operatorPackagePath(packagePath) {
  assertSafePublicArtifactPath(packagePath);
  return `${RULE_CATALOG_OPERATOR_ROOT}/preview/${packagePath}`;
}

function operatorPreviousManifestPath(generation) {
  return `${RULE_CATALOG_OPERATOR_ROOT}/state/previous-for-generation-${generation}.json`;
}

function operatorRollbackManifestPath(generation, rollbackGeneration) {
  return `${RULE_CATALOG_OPERATOR_ROOT}/state/rollback-target-${rollbackGeneration}-for-generation-${generation}.json`;
}

function sanitizeEnvironment(environment) {
  const clean = { ...environment };
  delete clean[signingKeyEnvironmentName];
  delete clean[secretKeyEnvironmentName];
  delete clean[supabaseUrlEnvironmentName];
  return clean;
}

function validateBase64Url32(value, label) {
  if (!/^[A-Za-z0-9_-]{43}$/.test(value ?? "")) {
    throw new PreviewRuleCatalogOperatorError(
      "INVALID_SECRET_INPUT",
      `${label} must be canonical unpadded base64url for exactly 32 bytes.`,
    );
  }
  const decoded = Buffer.from(value, "base64url");
  if (decoded.byteLength !== 32 || decoded.toString("base64url") !== value) {
    throw new PreviewRuleCatalogOperatorError(
      "INVALID_SECRET_INPUT",
      `${label} must be canonical unpadded base64url for exactly 32 bytes.`,
    );
  }
}

async function readPublicationRequest(workspaceRoot, requestPath) {
  const location = resolveRequestPath(workspaceRoot, requestPath);
  const raw = await fs.readFile(location.resolved, "utf8");
  if (Buffer.byteLength(raw, "utf8") > maximumArtifactBytes) {
    throw new PreviewRuleCatalogOperatorError(
      "INVALID_PUBLICATION_REQUEST",
      "The publication request exceeds the rule artifact size limit.",
    );
  }
  let value;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new PreviewRuleCatalogOperatorError(
      "INVALID_PUBLICATION_REQUEST",
      "The publication request is not valid JSON.",
    );
  }
  const validation = validateRuleCatalogPublicationRequest(value);
  if (!validation.ok) {
    throw new PreviewRuleCatalogOperatorError(
      "INVALID_PUBLICATION_REQUEST",
      `The publication request is invalid: ${validation.issues
        .map((issue) => `${issue.code} ${issue.path}`)
        .join(", ")}`,
    );
  }
  if (validation.value.channel !== PREVIEW_RULE_CATALOG_TRUST.channel) {
    throw new PreviewRuleCatalogOperatorError(
      "CHANNEL_NOT_ALLOWED",
      "The versioned Preview operator accepts only PREVIEW publication requests.",
    );
  }
  return { request: validation.value, relativePath: location.relative };
}

async function writeTextAtomically(workspaceRoot, relativePath, contents) {
  const target = path.resolve(workspaceRoot, ...relativePath.split("/"));
  const operatorRoot = path.resolve(workspaceRoot, ...RULE_CATALOG_OPERATOR_ROOT.split("/"));
  if (!isInside(operatorRoot, target)) {
    throw new PreviewRuleCatalogOperatorError(
      "OPERATOR_PATH_NOT_ALLOWED",
      "Operator state must stay inside the stable rule-catalog operator root.",
    );
  }
  await fs.mkdir(path.dirname(target), { recursive: true });
  const temporary = `${target}.tmp-${process.pid}-${randomUUID()}`;
  try {
    await fs.writeFile(temporary, contents, { encoding: "utf8", flag: "wx", mode: 0o600 });
    await fs.rename(temporary, target);
  } finally {
    await fs.rm(temporary, { force: true });
  }
}

async function readBoundedUtf8(filePath, label) {
  const stats = await fs.stat(filePath);
  if (!stats.isFile() || stats.size === 0 || stats.size > maximumArtifactBytes) {
    throw new PreviewRuleCatalogOperatorError(
      "LOCAL_ARTIFACT_SIZE_INVALID",
      `${label} is empty, not a regular file, or exceeds the size limit.`,
    );
  }
  const bytes = await fs.readFile(filePath);
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new PreviewRuleCatalogOperatorError(
      "LOCAL_ARTIFACT_ENCODING_INVALID",
      `${label} is not valid UTF-8.`,
    );
  }
}

async function preflightImmutableLocalObject(workspaceRoot, relativePath, contents) {
  const filePath = path.resolve(workspaceRoot, ...relativePath.split("/"));
  let existing;
  try {
    existing = await readBoundedUtf8(filePath, `Local immutable object ${relativePath}`);
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw new PreviewRuleCatalogOperatorError(
      "LOCAL_IMMUTABLE_CONFLICT",
      `Local immutable object ${relativePath} is unreadable or invalid.`,
      { cause: error },
    );
  }
  if (existing !== contents) {
    throw new PreviewRuleCatalogOperatorError(
      "LOCAL_IMMUTABLE_CONFLICT",
      `Local immutable object ${relativePath} differs from the verified public bytes.`,
    );
  }
  return true;
}

export function resolveNpmInvocation(
  argumentsList,
  {
    platform = process.platform,
    npmExecPath = process.env.npm_execpath,
    nodeExecutable = process.execPath,
  } = {},
) {
  if (platform !== "win32") {
    return { executable: "npm", argumentsList };
  }
  if (typeof npmExecPath !== "string" || !path.win32.isAbsolute(npmExecPath)) {
    throw new PreviewRuleCatalogOperatorError(
      "NPM_EXECUTABLE_UNAVAILABLE",
      "The absolute npm CLI path is required to start nested npm commands safely on Windows.",
    );
  }
  return {
    executable: nodeExecutable,
    argumentsList: [npmExecPath, ...argumentsList],
  };
}

async function defaultRunNpm(argumentsList, { workspaceRoot, environment }) {
  const invocation = resolveNpmInvocation(argumentsList, {
    npmExecPath: environment.npm_execpath,
  });
  const { stdout, stderr } = await execFileAsync(invocation.executable, invocation.argumentsList, {
    cwd: workspaceRoot,
    encoding: "utf8",
    env: environment,
    maxBuffer: 8 * 1024 * 1024,
    windowsHide: true,
  });
  if (stdout !== "") process.stdout.write(stdout);
  if (stderr !== "") process.stderr.write(stderr);
}

function assertSafePublicArtifactPath(relativePath) {
  if (
    relativePath !== "current.json" &&
    !/^manifests\/[1-9][0-9]*\.json$/.test(relativePath) &&
    !/^packages\/[a-z0-9.-]+\/[0-9A-Za-z._-]+\.json$/.test(relativePath)
  ) {
    throw new PreviewRuleCatalogOperatorError(
      "PUBLIC_PATH_NOT_ALLOWED",
      "The requested public rule-catalog object path is not allowed.",
    );
  }
}

async function responseBytes(response, relativePath) {
  const declaredLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > maximumArtifactBytes) {
    throw new PreviewRuleCatalogOperatorError(
      "PUBLIC_ARTIFACT_TOO_LARGE",
      `Public rule-catalog object ${relativePath} exceeds the size limit.`,
    );
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength === 0 || bytes.byteLength > maximumArtifactBytes) {
    throw new PreviewRuleCatalogOperatorError(
      "PUBLIC_ARTIFACT_SIZE_INVALID",
      `Public rule-catalog object ${relativePath} is empty or exceeds the size limit.`,
    );
  }
  return bytes;
}

export async function fetchPublicPreviewArtifact(
  relativePath,
  { allowMissing = false, fetchImplementation = fetch } = {},
) {
  assertSafePublicArtifactPath(relativePath);
  const url = new URL(`${PREVIEW_RULE_CATALOG_TRUST.baseUrl}/${relativePath}`);
  url.searchParams.set("catalog_operator", `${Date.now()}-${randomUUID()}`);
  const response = await fetchImplementation(url, {
    method: "GET",
    cache: "no-store",
    redirect: "error",
    headers: { "Cache-Control": "no-cache", Pragma: "no-cache" },
  });
  if (response.status === 404 && allowMissing) return null;
  if (response.status === 400 && allowMissing) {
    const errorBytes = await responseBytes(response, relativePath);
    try {
      const payload = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(errorBytes));
      if (payload?.code === "NoSuchKey") return null;
    } catch {
      // The generic HTTP failure below deliberately hides an untrusted error body.
    }
  }
  if (!response.ok) {
    throw new PreviewRuleCatalogOperatorError(
      "PUBLIC_DOWNLOAD_FAILED",
      `Public rule-catalog object ${relativePath} returned HTTP ${response.status}.`,
    );
  }
  const bytes = await responseBytes(response, relativePath);
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new PreviewRuleCatalogOperatorError(
      "PUBLIC_ARTIFACT_ENCODING_INVALID",
      `Public rule-catalog object ${relativePath} is not valid UTF-8.`,
    );
  }
}

async function prepareVerifiedRollbackTarget({
  request,
  workspaceRoot,
  fetchPublicArtifact,
  verifyManifestJson,
  verifyCatalogArtifacts,
}) {
  const rollbackGeneration = request.rollbackOfGeneration;
  if (rollbackGeneration === null) return [];

  const manifestJson = await fetchPublicArtifact(`manifests/${rollbackGeneration}.json`, {
    allowMissing: true,
  });
  if (manifestJson === null) {
    throw new PreviewRuleCatalogOperatorError(
      "ROLLBACK_TARGET_MISSING",
      `Public PREVIEW generation ${rollbackGeneration} is unavailable as a rollback target.`,
    );
  }

  let manifest;
  try {
    manifest = await verifyManifestJson(manifestJson);
  } catch (error) {
    throw new PreviewRuleCatalogOperatorError(
      "ROLLBACK_TARGET_VERIFICATION_FAILED",
      `Public PREVIEW generation ${rollbackGeneration} failed manifest verification.`,
      { cause: error },
    );
  }
  if (
    manifest.channel !== PREVIEW_RULE_CATALOG_TRUST.channel ||
    manifest.generation !== rollbackGeneration ||
    !Array.isArray(manifest.packages)
  ) {
    throw new PreviewRuleCatalogOperatorError(
      "ROLLBACK_TARGET_IDENTITY_MISMATCH",
      `The verified rollback target is not PREVIEW generation ${rollbackGeneration}.`,
    );
  }

  let packageJson;
  try {
    packageJson = await Promise.all(
      manifest.packages.map(({ path: packagePath }) => {
        assertSafePublicArtifactPath(packagePath);
        return fetchPublicArtifact(packagePath);
      }),
    );
    await verifyCatalogArtifacts({ manifestJson, packageJson });
  } catch (error) {
    throw new PreviewRuleCatalogOperatorError(
      "ROLLBACK_TARGET_VERIFICATION_FAILED",
      `Public PREVIEW generation ${rollbackGeneration} failed complete catalog verification.`,
      { cause: error },
    );
  }

  const rollbackPath = operatorRollbackManifestPath(request.generation, rollbackGeneration);
  await writeTextAtomically(workspaceRoot, rollbackPath, manifestJson);
  return ["--rollback-manifest", rollbackPath];
}

export async function recoverPreviewRuleCatalog({
  generation,
  workspaceRoot = process.cwd(),
  fetchPublicArtifact = fetchPublicPreviewArtifact,
  verifyManifestJson = verifyPreviewManifestJson,
  verifyCatalogArtifacts = verifyPreviewCatalogArtifacts,
  log = console.log,
}) {
  parsePositiveInteger(String(generation), "generation");
  const manifestJson = await fetchPublicArtifact("current.json");
  const versionedManifestJson = await fetchPublicArtifact(`manifests/${generation}.json`);
  if (manifestJson !== versionedManifestJson) {
    throw new PreviewRuleCatalogOperatorError(
      "PUBLIC_MANIFEST_MISMATCH",
      `Public current.json is not byte-identical to PREVIEW generation ${generation}.`,
    );
  }

  let manifest;
  try {
    manifest = await verifyManifestJson(manifestJson);
  } catch (error) {
    throw new PreviewRuleCatalogOperatorError(
      "RECOVERY_VERIFICATION_FAILED",
      `Public PREVIEW generation ${generation} failed manifest verification.`,
      { cause: error },
    );
  }
  if (
    manifest.generation !== generation ||
    manifest.channel !== PREVIEW_RULE_CATALOG_TRUST.channel ||
    !Array.isArray(manifest.packages)
  ) {
    throw new PreviewRuleCatalogOperatorError(
      "PUBLIC_MANIFEST_IDENTITY_MISMATCH",
      `The verified public current manifest is not PREVIEW generation ${generation}.`,
    );
  }

  let packageJson;
  try {
    packageJson = await Promise.all(
      manifest.packages.map(({ path: packagePath }) => {
        assertSafePublicArtifactPath(packagePath);
        return fetchPublicArtifact(packagePath);
      }),
    );
    await verifyCatalogArtifacts({ manifestJson, packageJson });
  } catch (error) {
    throw new PreviewRuleCatalogOperatorError(
      "RECOVERY_VERIFICATION_FAILED",
      `Public PREVIEW generation ${generation} failed complete catalog verification.`,
      { cause: error },
    );
  }

  const immutableObjects = [
    ...manifest.packages.map((descriptor, index) => ({
      relativePath: operatorPackagePath(descriptor.path),
      contents: packageJson[index],
    })),
    { relativePath: operatorManifestPath(generation), contents: manifestJson },
  ];
  const reuse = [];
  for (const object of immutableObjects) {
    reuse.push(
      await preflightImmutableLocalObject(workspaceRoot, object.relativePath, object.contents),
    );
  }
  for (let index = 0; index < immutableObjects.length; index += 1) {
    if (!reuse[index]) {
      const object = immutableObjects[index];
      await writeTextAtomically(workspaceRoot, object.relativePath, object.contents);
    }
  }
  await writeTextAtomically(workspaceRoot, operatorCurrentManifestPath(), manifestJson);

  const reusedImmutableObjects = reuse.filter(Boolean).length;
  const result = Object.freeze({
    generation,
    keyId: manifest.signing.keyId,
    packageCount: packageJson.length,
    createdImmutableObjects: immutableObjects.length - reusedImmutableObjects,
    reusedImmutableObjects,
  });
  log(
    `RECOVERED: public PREVIEW generation ${generation} restored the local operator state (${result.createdImmutableObjects} immutable objects created, ${reusedImmutableObjects} reused).`,
  );
  return result;
}

function publicSupabaseProjectUrl() {
  return new URL(PREVIEW_RULE_CATALOG_TRUST.baseUrl).origin;
}

function previewDeliveryArguments(generation) {
  return [
    "run",
    "rules:deliver",
    "--",
    "--manifest",
    operatorManifestPath(generation),
    ...previewTrustedPublicKeyArguments(),
  ];
}

export async function preparePreviewRuleCatalog({
  requestPath,
  workspaceRoot = process.cwd(),
  environment = process.env,
  fetchPublicArtifact = fetchPublicPreviewArtifact,
  verifyManifestJson = verifyPreviewManifestJson,
  verifyCatalogArtifacts = verifyPreviewCatalogArtifacts,
  runNpm = defaultRunNpm,
  log = console.log,
}) {
  const { request, relativePath } = await readPublicationRequest(workspaceRoot, requestPath);
  let signingSeed = environment[signingKeyEnvironmentName];
  delete environment[signingKeyEnvironmentName];
  if (signingSeed === undefined) {
    throw new PreviewRuleCatalogOperatorError(
      "SIGNING_SEED_REQUIRED",
      `${signingKeyEnvironmentName} is required for Prepare and must not be stored in the repository.`,
    );
  }
  validateBase64Url32(signingSeed, signingKeyEnvironmentName);

  try {
    log(`Prepare PREVIEW generation ${request.generation}`);
    const remoteCurrent = await fetchPublicArtifact("current.json", { allowMissing: true });
    let previousArguments = [];
    if (remoteCurrent === null) {
      if (request.generation !== 1) {
        throw new PreviewRuleCatalogOperatorError(
          "REMOTE_CURRENT_MISSING",
          `Public current.json is missing, so generation ${request.generation} cannot continue from a verified predecessor.`,
        );
      }
    } else {
      let remoteValue;
      try {
        remoteValue = JSON.parse(remoteCurrent);
      } catch {
        throw new PreviewRuleCatalogOperatorError(
          "REMOTE_CURRENT_INVALID",
          "Public current.json is not valid JSON.",
        );
      }
      if (
        remoteValue?.channel !== PREVIEW_RULE_CATALOG_TRUST.channel ||
        ![request.generation - 1, request.generation].includes(remoteValue?.generation)
      ) {
        throw new PreviewRuleCatalogOperatorError(
          "REMOTE_GENERATION_CONFLICT",
          `Public current.json generation does not permit preparing generation ${request.generation}.`,
        );
      }
      const previousPath = operatorPreviousManifestPath(request.generation);
      await writeTextAtomically(workspaceRoot, previousPath, remoteCurrent);
      previousArguments = ["--previous-manifest", previousPath];
    }

    const rollbackArguments = await prepareVerifiedRollbackTarget({
      request,
      workspaceRoot,
      fetchPublicArtifact,
      verifyManifestJson,
      verifyCatalogArtifacts,
    });

    const trustedArguments = previewTrustedPublicKeyArguments();
    const publishArguments = [
      "run",
      "rules:publish",
      "--",
      "--request",
      relativePath,
      "--output-dir",
      RULE_CATALOG_OPERATOR_ROOT,
      ...previousArguments,
      ...rollbackArguments,
      ...trustedArguments,
    ];
    const cleanEnvironment = sanitizeEnvironment(environment);
    const publisherEnvironment = {
      ...cleanEnvironment,
      [signingKeyEnvironmentName]: signingSeed,
    };
    await runNpm([...publishArguments, "--dry-run"], {
      workspaceRoot,
      environment: publisherEnvironment,
    });
    await runNpm(publishArguments, { workspaceRoot, environment: publisherEnvironment });

    const manifestPath = operatorManifestPath(request.generation);
    await runNpm(
      ["run", "rules:deliver", "--", "--manifest", manifestPath, ...trustedArguments, "--dry-run"],
      { workspaceRoot, environment: cleanEnvironment },
    );
    log(
      `PREPARED: generation ${request.generation} is signed and locally verified at ${manifestPath}.`,
    );
    return Object.freeze({ generation: request.generation, manifestPath });
  } finally {
    signingSeed = null;
    delete environment[signingKeyEnvironmentName];
  }
}

export async function verifyPublishedPreviewRuleCatalog({
  generation,
  workspaceRoot = process.cwd(),
  fetchPublicArtifact = fetchPublicPreviewArtifact,
  verifyManifestJson = verifyPreviewManifestJson,
  verifyCatalogArtifacts = verifyPreviewCatalogArtifacts,
  log = console.log,
}) {
  parsePositiveInteger(String(generation), "generation");
  const manifestRelativePath = operatorManifestPath(generation);
  const localManifestJson = await readBoundedUtf8(
    path.resolve(workspaceRoot, ...manifestRelativePath.split("/")),
    "The prepared local manifest",
  );
  const publicCurrentJson = await fetchPublicArtifact("current.json");
  const publicVersionedJson = await fetchPublicArtifact(`manifests/${generation}.json`);
  if (publicCurrentJson !== publicVersionedJson || publicCurrentJson !== localManifestJson) {
    throw new PreviewRuleCatalogOperatorError(
      "PUBLIC_MANIFEST_MISMATCH",
      "Public current.json, the immutable public manifest, and the prepared local manifest are not byte-identical.",
    );
  }

  const manifest = await verifyManifestJson(publicCurrentJson);
  if (
    manifest.generation !== generation ||
    manifest.channel !== PREVIEW_RULE_CATALOG_TRUST.channel ||
    !Array.isArray(manifest.packages)
  ) {
    throw new PreviewRuleCatalogOperatorError(
      "PUBLIC_MANIFEST_IDENTITY_MISMATCH",
      `The verified public manifest is not PREVIEW generation ${generation}.`,
    );
  }
  const packageJson = await Promise.all(
    manifest.packages.map(({ path: packagePath }) => {
      assertSafePublicArtifactPath(packagePath);
      return fetchPublicArtifact(packagePath);
    }),
  );
  await verifyCatalogArtifacts({ manifestJson: publicCurrentJson, packageJson });
  const result = Object.freeze({
    generation,
    keyId: manifest.signing.keyId,
    packageCount: packageJson.length,
  });
  log(
    `VERIFIED: public PREVIEW generation ${generation} is byte-identical and cryptographically valid (${packageJson.length} packages, key ${manifest.signing.keyId}).`,
  );
  return result;
}

function waitMilliseconds(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

export async function preflightPreviewRuleCatalogActivation({
  generation,
  workspaceRoot = process.cwd(),
  environment = process.env,
  runNpm = defaultRunNpm,
  log = console.log,
}) {
  parsePositiveInteger(String(generation), "generation");
  const manifestPath = operatorManifestPath(generation);
  const deliveryArguments = previewDeliveryArguments(generation);
  const cleanEnvironment = sanitizeEnvironment(environment);
  log(`Preflight PREVIEW generation ${generation}: local delivery validation`);
  await runNpm([...deliveryArguments, "--dry-run"], {
    workspaceRoot,
    environment: cleanEnvironment,
  });
  log(`PREFLIGHTED: generation ${generation} is locally valid at ${manifestPath}.`);
  return Object.freeze({ generation, manifestPath });
}

export async function activatePreviewRuleCatalog({
  generation,
  createBucket = false,
  workspaceRoot = process.cwd(),
  environment = process.env,
  runNpm = defaultRunNpm,
  verifyPublished = verifyPublishedPreviewRuleCatalog,
  retryDelaysMilliseconds = defaultRetryDelaysMilliseconds,
  wait = waitMilliseconds,
  log = console.log,
}) {
  parsePositiveInteger(String(generation), "generation");
  let secretKey = environment[secretKeyEnvironmentName];
  delete environment[secretKeyEnvironmentName];
  delete environment[supabaseUrlEnvironmentName];

  try {
    const deliveryArguments = previewDeliveryArguments(generation);
    const cleanEnvironment = sanitizeEnvironment(environment);
    await preflightPreviewRuleCatalogActivation({
      generation,
      workspaceRoot,
      environment,
      runNpm,
      log,
    });
    if (secretKey === undefined || !secretKey.startsWith("sb_secret_") || secretKey.length < 20) {
      throw new PreviewRuleCatalogOperatorError(
        "SUPABASE_SECRET_REQUIRED",
        `${secretKeyEnvironmentName} must contain the dedicated sb_secret_ Preview delivery key.`,
      );
    }

    log(`Activate PREVIEW generation ${generation}: authorized Supabase delivery`);
    await runNpm(createBucket ? [...deliveryArguments, "--create-bucket"] : deliveryArguments, {
      workspaceRoot,
      environment: {
        ...cleanEnvironment,
        [supabaseUrlEnvironmentName]: publicSupabaseProjectUrl(),
        [secretKeyEnvironmentName]: secretKey,
      },
    });
    secretKey = null;

    let lastVerificationError;
    for (const delay of retryDelaysMilliseconds) {
      if (delay > 0) await wait(delay);
      try {
        const verified = await verifyPublished({ generation, workspaceRoot, log });
        log(`ACTIVATED: PREVIEW generation ${generation} was delivered and publicly verified.`);
        return verified;
      } catch (error) {
        lastVerificationError = error;
      }
    }
    throw new PreviewRuleCatalogOperatorError(
      "PUBLIC_VERIFICATION_PENDING",
      `Delivery completed for PREVIEW generation ${generation}, but public verification is still pending. No rollback was attempted. Run Verify again without a secret.`,
      { cause: lastVerificationError },
    );
  } finally {
    secretKey = null;
    delete environment[secretKeyEnvironmentName];
    delete environment[supabaseUrlEnvironmentName];
  }
}

async function main() {
  if (process.argv.includes("--help") || process.argv.includes("-h")) {
    console.log(usage());
    return;
  }
  const options = parsePreviewOperatorArguments(process.argv[2], process.argv.slice(3));
  if (options.command === "recover") await recoverPreviewRuleCatalog(options);
  else if (options.command === "prepare") await preparePreviewRuleCatalog(options);
  else if (options.command === "preflight") await preflightPreviewRuleCatalogActivation(options);
  else if (options.command === "activate") await activatePreviewRuleCatalog(options);
  else await verifyPublishedPreviewRuleCatalog(options);
}

const invokedPath =
  process.argv[1] === undefined ? null : pathToFileURL(path.resolve(process.argv[1])).href;
if (invokedPath === import.meta.url) {
  main().catch((error) => {
    if (error instanceof PreviewRuleCatalogOperatorError) {
      console.error(`${error.code}: ${error.message}`);
    } else {
      console.error(
        error instanceof Error ? error.message : "Preview rule-catalog operator failed.",
      );
    }
    process.exitCode = 1;
  });
}
