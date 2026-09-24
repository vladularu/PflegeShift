import { ruleCatalogDeliveryChannel } from "./rule-catalog-delivery-channels.mjs";

const MAXIMUM_ARTIFACT_BYTES = 524_288;
const EXPECTED_BUCKET = Object.freeze({
  public: true,
  fileSizeLimit: MAXIMUM_ARTIFACT_BYTES,
  allowedMimeTypes: Object.freeze(["application/json"]),
});
const IMMUTABLE_CACHE_CONTROL = "public, max-age=31536000, immutable";
const CURRENT_CACHE_CONTROL = "public, max-age=0, must-revalidate";
const encoder = new TextEncoder();
const decoder = new TextDecoder("utf-8", { fatal: true });

export class RuleCatalogDeliveryError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "RuleCatalogDeliveryError";
    this.code = code;
  }
}

function fail(code, message) {
  throw new RuleCatalogDeliveryError(code, message);
}

function normalizeSupabaseUrl(value) {
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    fail("INVALID_CONFIGURATION", "SUPABASE_URL must be a valid absolute URL.");
  }
  const localTestHost = parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1";
  if (parsed.protocol !== "https:" && !(parsed.protocol === "http:" && localTestHost)) {
    fail("INVALID_CONFIGURATION", "SUPABASE_URL must use HTTPS.");
  }
  if (
    parsed.username !== "" ||
    parsed.password !== "" ||
    parsed.search !== "" ||
    parsed.hash !== ""
  ) {
    fail("INVALID_CONFIGURATION", "SUPABASE_URL must not contain credentials or query data.");
  }
  if (parsed.pathname !== "/") {
    fail("INVALID_CONFIGURATION", "SUPABASE_URL must be the project root URL.");
  }
  return parsed.origin;
}

function assertSecretKey(value) {
  if (typeof value !== "string" || !/^sb_secret_[A-Za-z0-9_-]{16,}$/.test(value)) {
    fail(
      "INVALID_CONFIGURATION",
      "SUPABASE_SECRET_KEY must contain a current backend-only sb_secret_ key.",
    );
  }
}

function assertBucketName(value) {
  if (!/^[a-z0-9][a-z0-9._-]{2,62}$/.test(value)) {
    fail("INVALID_CONFIGURATION", "The Storage bucket name is invalid.");
  }
}

function encodePath(value) {
  return value.split("/").map(encodeURIComponent).join("/");
}

function requireDeliveryChannel(channel) {
  const config = ruleCatalogDeliveryChannel(channel);
  if (config === null) {
    fail("CHANNEL_NOT_ALLOWED", "The rule catalog delivery channel is unsupported.");
  }
  return config;
}

export function assertRuleCatalogRemoteDeliveryEnabled(channel) {
  const config = requireDeliveryChannel(channel);
  if (config.remote === null) {
    fail(
      "CHANNEL_REMOTE_DISABLED",
      `Remote delivery for ${config.channel} rule catalogs is not enabled.`,
    );
  }
  return config;
}

function assertObjectPath(value, channelConfig) {
  const prefix = `${channelConfig.pathSegment}/`;
  const relativePath =
    typeof value === "string" && value.startsWith(prefix) ? value.slice(prefix.length) : null;
  if (
    relativePath === null ||
    !/^(?:packages\/[a-z0-9.-]+\/[0-9A-Za-z._-]+\.json|manifests\/[1-9][0-9]*\.json|current\.json)$/.test(
      relativePath,
    )
  ) {
    fail("INVALID_ARTIFACT_SET", "The delivery contains an unsafe or unsupported object path.");
  }
}

function bytes(value) {
  return typeof value === "string" ? encoder.encode(value) : new Uint8Array(value);
}

function equalBytes(left, right) {
  const a = bytes(left);
  const b = bytes(right);
  if (a.byteLength !== b.byteLength) return false;
  for (let index = 0; index < a.byteLength; index += 1) {
    if (a[index] !== b[index]) return false;
  }
  return true;
}

function decodeUtf8(value, label) {
  try {
    return decoder.decode(value);
  } catch {
    fail("INVALID_REMOTE_STATE", `${label} is not valid UTF-8.`);
  }
}

function assertArtifactSize(contents, label) {
  if (bytes(contents).byteLength > MAXIMUM_ARTIFACT_BYTES) {
    fail("INVALID_ARTIFACT_SET", `${label} exceeds the rule artifact size limit.`);
  }
}

function expectedArtifactSet(publication) {
  const channelConfig = assertRuleCatalogRemoteDeliveryEnabled(publication.manifest.channel);
  const objectRoot = channelConfig.pathSegment;
  const expectedPackagePaths = publication.manifest.packages.map(
    (descriptor) => `${objectRoot}/${descriptor.path}`,
  );
  const expectedManifestPath = `${objectRoot}/manifests/${publication.manifest.generation}.json`;
  const artifacts = [...publication.artifacts];
  if (artifacts.length !== expectedPackagePaths.length + 2) {
    fail("INVALID_ARTIFACT_SET", "The delivery artifact count does not match the manifest.");
  }

  expectedPackagePaths.forEach((objectPath, index) => {
    const artifact = artifacts[index];
    if (
      artifact?.objectPath !== objectPath ||
      artifact.role !== "PACKAGE" ||
      artifact.immutable !== true ||
      artifact.cacheControl !== IMMUTABLE_CACHE_CONTROL
    ) {
      fail("INVALID_ARTIFACT_SET", "Package artifacts are not in signed manifest order.");
    }
  });

  const versionedManifest = artifacts.at(-2);
  const currentManifest = artifacts.at(-1);
  if (
    versionedManifest?.objectPath !== expectedManifestPath ||
    versionedManifest.role !== "VERSIONED_MANIFEST" ||
    versionedManifest.immutable !== true ||
    versionedManifest.contents !== publication.manifestJson ||
    versionedManifest.cacheControl !== IMMUTABLE_CACHE_CONTROL
  ) {
    fail("INVALID_ARTIFACT_SET", "The versioned manifest artifact is invalid.");
  }
  if (
    currentManifest?.objectPath !== `${objectRoot}/current.json` ||
    currentManifest.role !== "CURRENT_MANIFEST" ||
    currentManifest.immutable !== false ||
    currentManifest.contents !== publication.manifestJson ||
    currentManifest.cacheControl !== CURRENT_CACHE_CONTROL
  ) {
    fail("INVALID_ARTIFACT_SET", "The current manifest artifact is invalid.");
  }
  for (const artifact of artifacts) {
    assertObjectPath(artifact.objectPath, channelConfig);
    assertArtifactSize(artifact.contents, artifact.objectPath);
  }
  return artifacts;
}

function assertBucketConfiguration(bucket, expectedName) {
  const allowedMimeTypes = Array.isArray(bucket.allowed_mime_types)
    ? [...bucket.allowed_mime_types].sort()
    : [];
  if (
    bucket.id !== expectedName ||
    bucket.name !== expectedName ||
    bucket.public !== EXPECTED_BUCKET.public ||
    Number(bucket.file_size_limit) !== EXPECTED_BUCKET.fileSizeLimit ||
    allowedMimeTypes.length !== 1 ||
    allowedMimeTypes[0] !== EXPECTED_BUCKET.allowedMimeTypes[0]
  ) {
    fail(
      "BUCKET_CONFIGURATION_MISMATCH",
      `Storage bucket ${expectedName} must be public, JSON-only, and limited to ${MAXIMUM_ARTIFACT_BYTES} bytes.`,
    );
  }
}

async function responseJson(response, label) {
  try {
    return await response.json();
  } catch {
    fail("INVALID_REMOTE_RESPONSE", `${label} returned an invalid response.`);
  }
}

async function isMissingObjectResponse(response) {
  if (response.status === 404) return true;
  if (response.status !== 400) return false;

  let errorBody;
  try {
    errorBody = await response.json();
  } catch {
    return false;
  }
  return (
    errorBody !== null &&
    typeof errorBody === "object" &&
    Reflect.get(errorBody, "statusCode") === "404" &&
    Reflect.get(errorBody, "error") === "not_found" &&
    Reflect.get(errorBody, "code") === "NoSuchKey"
  );
}

export function createSupabaseRuleCatalogStorage({
  channel,
  supabaseUrl,
  secretKey,
  bucket: configuredBucket,
  fetchImplementation = globalThis.fetch,
  requestTimeoutMilliseconds = 20_000,
}) {
  const channelConfig = assertRuleCatalogRemoteDeliveryEnabled(channel);
  const bucket = configuredBucket ?? channelConfig.remote.bucket;
  const origin = normalizeSupabaseUrl(supabaseUrl);
  assertSecretKey(secretKey);
  assertBucketName(bucket);
  if (typeof fetchImplementation !== "function") {
    fail("INVALID_CONFIGURATION", "A Fetch-compatible implementation is required.");
  }

  const authorizationHeaders = Object.freeze({
    apikey: secretKey,
    Authorization: `Bearer ${secretKey}`,
  });

  async function request(pathname, init = {}) {
    try {
      return await fetchImplementation(`${origin}/storage/v1${pathname}`, {
        ...init,
        redirect: "error",
        headers: { ...authorizationHeaders, ...init.headers },
        signal: AbortSignal.timeout(requestTimeoutMilliseconds),
      });
    } catch {
      fail("NETWORK_FAILURE", "The Supabase Storage request failed before acknowledgement.");
    }
  }

  async function getBucket() {
    const response = await request(`/bucket/${encodeURIComponent(bucket)}`);
    if (response.status === 404) return null;
    if (!response.ok) {
      fail("REMOTE_REJECTED", `Supabase rejected the bucket lookup with HTTP ${response.status}.`);
    }
    return responseJson(response, "The bucket lookup");
  }

  async function ensureBucket({ createIfMissing = false } = {}) {
    let remoteBucket = await getBucket();
    if (remoteBucket === null && !createIfMissing) {
      fail(
        "MISSING_BUCKET",
        `Storage bucket ${bucket} does not exist; rerun once with --create-bucket.`,
      );
    }
    if (remoteBucket === null) {
      const response = await request("/bucket", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          id: bucket,
          name: bucket,
          public: EXPECTED_BUCKET.public,
          file_size_limit: EXPECTED_BUCKET.fileSizeLimit,
          allowed_mime_types: EXPECTED_BUCKET.allowedMimeTypes,
        }),
      });
      if (!response.ok && response.status !== 400 && response.status !== 409) {
        fail("REMOTE_REJECTED", `Supabase rejected bucket creation with HTTP ${response.status}.`);
      }
      remoteBucket = await getBucket();
      if (remoteBucket === null) {
        fail("MISSING_BUCKET", `Storage bucket ${bucket} was not created.`);
      }
    }
    assertBucketConfiguration(remoteBucket, bucket);
  }

  async function readObject(objectPath) {
    assertObjectPath(objectPath, channelConfig);
    const response = await request(
      `/object/${encodeURIComponent(bucket)}/${encodePath(objectPath)}`,
    );
    if (await isMissingObjectResponse(response)) return null;
    if (!response.ok) {
      fail("REMOTE_REJECTED", `Supabase rejected an object read with HTTP ${response.status}.`);
    }
    const contentLength = Number(response.headers.get("content-length"));
    if (Number.isFinite(contentLength) && contentLength > MAXIMUM_ARTIFACT_BYTES) {
      fail("INVALID_REMOTE_STATE", "A remote rule artifact exceeds the size limit.");
    }
    const result = new Uint8Array(await response.arrayBuffer());
    if (result.byteLength > MAXIMUM_ARTIFACT_BYTES) {
      fail("INVALID_REMOTE_STATE", "A remote rule artifact exceeds the size limit.");
    }
    return result;
  }

  async function writeObject(artifact, upsert) {
    const response = await request(
      `/object/${encodeURIComponent(bucket)}/${encodePath(artifact.objectPath)}`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "cache-control": artifact.cacheControl,
          "x-upsert": String(upsert),
        },
        body: artifact.contents,
      },
    );
    return response;
  }

  async function writeImmutable(artifact) {
    const existing = await readObject(artifact.objectPath);
    if (existing !== null) {
      if (!equalBytes(existing, artifact.contents)) {
        fail("IMMUTABLE_CONFLICT", `Immutable object conflict at ${artifact.objectPath}.`);
      }
      return "reused";
    }

    const response = await writeObject(artifact, false);
    if (response.ok) return "created";
    if (response.status === 400 || response.status === 409) {
      const raced = await readObject(artifact.objectPath);
      if (raced !== null && equalBytes(raced, artifact.contents)) return "reused";
      fail("IMMUTABLE_CONFLICT", `Immutable object conflict at ${artifact.objectPath}.`);
    }
    fail("REMOTE_REJECTED", `Supabase rejected an object upload with HTTP ${response.status}.`);
  }

  async function replaceCurrent(artifact) {
    const response = await writeObject(artifact, true);
    if (!response.ok) {
      fail(
        "REMOTE_REJECTED",
        `Supabase rejected current manifest activation with HTTP ${response.status}.`,
      );
    }
    const acknowledged = await readObject(artifact.objectPath);
    if (acknowledged === null || !equalBytes(acknowledged, artifact.contents)) {
      fail("ACTIVATION_NOT_ACKNOWLEDGED", "Supabase did not acknowledge the activated manifest.");
    }
  }

  return Object.freeze({
    channel: channelConfig.channel,
    bucket,
    ensureBucket,
    readObject,
    writeImmutable,
    replaceCurrent,
  });
}

function assertGenerationTransition(nextManifest, previousManifest, channelConfig) {
  if (previousManifest === null) {
    if (nextManifest.generation !== 1) {
      fail(
        "REMOTE_GENERATION_CONFLICT",
        `The first remote ${channelConfig.channel} generation must be 1.`,
      );
    }
    return false;
  }
  if (nextManifest.generation === previousManifest.generation) return true;
  if (nextManifest.generation !== previousManifest.generation + 1) {
    fail(
      "REMOTE_GENERATION_CONFLICT",
      `The remote ${channelConfig.channel} generation must advance by exactly one.`,
    );
  }
  if (Date.parse(nextManifest.publishedAt) <= Date.parse(previousManifest.publishedAt)) {
    fail("REMOTE_GENERATION_CONFLICT", "The publication time must advance with the generation.");
  }
  return false;
}

export async function deliverRuleCatalog({
  storage,
  publication,
  verifyRemoteManifest,
  createBucket = false,
}) {
  const channelConfig = assertRuleCatalogRemoteDeliveryEnabled(publication.manifest.channel);
  if (storage?.channel !== channelConfig.channel) {
    fail(
      "CHANNEL_MISMATCH",
      `The Storage port does not belong to the ${channelConfig.channel} delivery channel.`,
    );
  }
  const currentObjectPath = `${channelConfig.pathSegment}/current.json`;
  const artifacts = expectedArtifactSet(publication);
  await storage.ensureBucket({ createIfMissing: createBucket });

  const remoteCurrentBytes = await storage.readObject(currentObjectPath);
  let previousManifest = null;
  if (remoteCurrentBytes !== null) {
    const remoteCurrentJson = decodeUtf8(remoteCurrentBytes, "Remote current.json");
    try {
      previousManifest = await verifyRemoteManifest(remoteCurrentJson);
    } catch {
      fail(
        "INVALID_REMOTE_STATE",
        `Remote current.json is not a trusted ${channelConfig.channel} manifest.`,
      );
    }
    const remoteVersioned = await storage.readObject(
      `${channelConfig.pathSegment}/manifests/${previousManifest.generation}.json`,
    );
    if (remoteVersioned === null || !equalBytes(remoteVersioned, remoteCurrentBytes)) {
      fail(
        "INVALID_REMOTE_STATE",
        "Remote current.json does not match its immutable versioned manifest.",
      );
    }
  }

  const idempotent = assertGenerationTransition(
    publication.manifest,
    previousManifest,
    channelConfig,
  );
  if (
    idempotent &&
    remoteCurrentBytes !== null &&
    !equalBytes(remoteCurrentBytes, publication.manifestJson)
  ) {
    fail("REMOTE_GENERATION_CONFLICT", "The remote generation already has different signed bytes.");
  }

  let created = 0;
  let reused = 0;
  for (const artifact of artifacts.filter((candidate) => candidate.immutable)) {
    const result = await storage.writeImmutable(artifact);
    if (result === "created") created += 1;
    else reused += 1;
  }

  const currentArtifact = artifacts.at(-1);
  const currentChanged =
    remoteCurrentBytes === null || !equalBytes(remoteCurrentBytes, currentArtifact.contents);
  if (currentChanged) await storage.replaceCurrent(currentArtifact);

  return Object.freeze({ created, reused, currentChanged, idempotent });
}

export const ruleCatalogDeliveryConstants = Object.freeze({
  maximumArtifactBytes: MAXIMUM_ARTIFACT_BYTES,
  immutableCacheControl: IMMUTABLE_CACHE_CONTROL,
  currentCacheControl: CURRENT_CACHE_CONTROL,
});
