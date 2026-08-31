import type {
  RuleCatalogPublicationRequest,
  RuleManifest,
  RulePackage,
  Track,
} from "./contracts.generated";
import {
  canonicalizeRuleJson,
  canonicalizeRuleManifestForSignature,
} from "./rule-catalog-verification";
import { isRuleCatalogRuntimeCompatible } from "./rule-resolver";
import {
  validateRuleCatalog,
  validateRuleCatalogPublicationRequest,
  validateRulePackage,
  type ValidationIssue,
} from "./validation";

const MAX_RULE_ARTIFACT_BYTES = 524_288;
const encoder = new TextEncoder();
const kindOrder: Readonly<Record<RulePackage["kind"], number>> = Object.freeze({
  TARIFF: 0,
  LEGAL: 1,
  HOLIDAY: 2,
});

export interface RuleCatalogPublicationSource {
  readonly sourcePath: string;
  readonly sourceJson: string;
  readonly reviewedCommit: string;
  readonly reviewedCommitJson: string;
}

export interface RuleCatalogPublicationSigner {
  readonly sha256: (bytes: Uint8Array) => Promise<Uint8Array>;
  readonly signEd25519: (message: Uint8Array) => Promise<Uint8Array>;
}

export interface RuleCatalogPublicationArtifact {
  readonly relativePath: string;
  readonly contents: string;
  readonly immutable: boolean;
  readonly role: "PACKAGE" | "VERSIONED_MANIFEST" | "CURRENT_MANIFEST";
  readonly cacheControl: string;
}

export interface RuleCatalogPublication {
  readonly channelRoot: "preview" | "production";
  readonly manifest: RuleManifest;
  readonly manifestJson: string;
  readonly packageJson: readonly string[];
  readonly artifacts: readonly RuleCatalogPublicationArtifact[];
  readonly idempotentRetry: boolean;
}

export type RuleCatalogPublicationErrorCode =
  | "INVALID_REQUEST"
  | "SOURCE_SET_MISMATCH"
  | "INVALID_SOURCE_PACKAGE"
  | "UNREVIEWED_PACKAGE"
  | "SOURCE_PATH_MISMATCH"
  | "REVIEW_COMMIT_MISMATCH"
  | "REVIEWED_CONTENT_MISMATCH"
  | "ARTIFACT_TOO_LARGE"
  | "CRYPTOGRAPHY_FAILED"
  | "INVALID_SIGNATURE_LENGTH"
  | "INVALID_CATALOG"
  | "RUNTIME_INCOMPATIBLE"
  | "MISSING_PREVIOUS_MANIFEST"
  | "GENERATION_CONFLICT"
  | "PUBLICATION_TIME_CONFLICT"
  | "TRACK_COVERAGE_REGRESSION"
  | "ROLLBACK_TARGET_MISMATCH";

export class RuleCatalogPublicationError extends Error {
  readonly code: RuleCatalogPublicationErrorCode;
  readonly issues: readonly ValidationIssue[];

  constructor(
    code: RuleCatalogPublicationErrorCode,
    message: string,
    issues: readonly ValidationIssue[] = [],
  ) {
    super(message);
    this.name = "RuleCatalogPublicationError";
    this.code = code;
    this.issues = issues;
  }
}

export interface CreateRuleCatalogPublicationInput {
  readonly request: unknown;
  readonly sources: readonly RuleCatalogPublicationSource[];
  readonly signer: RuleCatalogPublicationSigner;
  readonly verifiedPreviousManifest?: RuleManifest | null;
  readonly verifiedRollbackManifest?: RuleManifest | null;
}

interface PublishedPackageArtifact {
  readonly rulePackage: RulePackage;
  readonly descriptor: RuleManifest["packages"][number];
  readonly json: string;
}

function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const nested of Object.values(value)) deepFreeze(nested);
  return Object.freeze(value);
}

function canonicalJson(value: unknown, label: string): string {
  try {
    return canonicalizeRuleJson(value);
  } catch {
    throw new RuleCatalogPublicationError(
      "INVALID_SOURCE_PACKAGE",
      `${label} cannot be canonicalized as RFC 8785 JSON.`,
    );
  }
}

function parseJson(json: string, label: string): unknown {
  try {
    return JSON.parse(json, (_key, value: unknown) => {
      if (typeof value === "number" && !Number.isFinite(value)) {
        throw new Error("non-finite number");
      }
      return value;
    }) as unknown;
  } catch {
    throw new RuleCatalogPublicationError(
      "INVALID_SOURCE_PACKAGE",
      `${label} is not finite valid JSON.`,
    );
  }
}

function packageReviewPayload(rulePackage: RulePackage): unknown {
  const { status: _status, review: _review, ...reviewedContent } = rulePackage;
  return reviewedContent;
}

function expectedSourcePath(rulePackage: RulePackage): string {
  return `rules/packages/reviewed/${rulePackage.packageId}/${rulePackage.versionId}.json`;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
}

function bytesToBase64Url(bytes: Uint8Array): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
  let output = "";
  for (let index = 0; index < bytes.length; index += 3) {
    const first = bytes[index];
    const second = bytes[index + 1];
    const third = bytes[index + 2];
    output += alphabet[first >>> 2];
    output += alphabet[((first & 0x03) << 4) | ((second ?? 0) >>> 4)];
    if (second !== undefined) {
      output += alphabet[((second & 0x0f) << 2) | ((third ?? 0) >>> 6)];
    }
    if (third !== undefined) output += alphabet[third & 0x3f];
  }
  return output;
}

function packageSort(left: RulePackage, right: RulePackage): number {
  return (
    kindOrder[left.kind] - kindOrder[right.kind] ||
    left.packageId.localeCompare(right.packageId) ||
    left.validFrom.localeCompare(right.validFrom) ||
    left.versionId.localeCompare(right.versionId)
  );
}

async function publishPackage(
  source: RuleCatalogPublicationSource,
  signer: RuleCatalogPublicationSigner,
): Promise<PublishedPackageArtifact> {
  const sourceValue = parseJson(source.sourceJson, `Rule package ${source.sourcePath}`);
  const sourceValidation = validateRulePackage(sourceValue);
  if (!sourceValidation.ok) {
    throw new RuleCatalogPublicationError(
      "INVALID_SOURCE_PACKAGE",
      `Rule package ${source.sourcePath} does not satisfy the package contract.`,
      sourceValidation.issues,
    );
  }
  const sourcePackage = sourceValidation.value;
  if (sourcePackage.status !== "REVIEWED" || sourcePackage.review.status !== "REVIEWED") {
    throw new RuleCatalogPublicationError(
      "UNREVIEWED_PACKAGE",
      `Rule package ${source.sourcePath} is not REVIEWED.`,
    );
  }
  if (source.sourcePath !== expectedSourcePath(sourcePackage)) {
    throw new RuleCatalogPublicationError(
      "SOURCE_PATH_MISMATCH",
      `Rule package ${sourcePackage.packageId}:${sourcePackage.versionId} is stored at the wrong reviewed source path.`,
    );
  }
  if (source.reviewedCommit !== sourcePackage.review.gitCommit) {
    throw new RuleCatalogPublicationError(
      "REVIEW_COMMIT_MISMATCH",
      `Rule package ${sourcePackage.packageId}:${sourcePackage.versionId} was not loaded from its recorded review commit.`,
    );
  }

  const reviewedValue = parseJson(
    source.reviewedCommitJson,
    `Reviewed Git content for ${source.sourcePath}`,
  );
  const reviewedValidation = validateRulePackage(reviewedValue);
  if (!reviewedValidation.ok) {
    throw new RuleCatalogPublicationError(
      "INVALID_SOURCE_PACKAGE",
      `Reviewed Git content for ${source.sourcePath} does not satisfy the package contract.`,
      reviewedValidation.issues,
    );
  }
  if (
    reviewedValidation.value.status !== "DRAFT" &&
    reviewedValidation.value.status !== "REVIEWED"
  ) {
    throw new RuleCatalogPublicationError(
      "INVALID_SOURCE_PACKAGE",
      `The review commit for ${source.sourcePath} must contain DRAFT or REVIEWED rule content.`,
    );
  }
  if (
    canonicalJson(packageReviewPayload(sourcePackage), source.sourcePath) !==
    canonicalJson(packageReviewPayload(reviewedValidation.value), source.sourcePath)
  ) {
    throw new RuleCatalogPublicationError(
      "REVIEWED_CONTENT_MISMATCH",
      `Rule content in ${source.sourcePath} differs from the recorded review commit.`,
    );
  }

  const publishedPackage = structuredClone(sourcePackage);
  publishedPackage.status = "PUBLISHED";
  publishedPackage.review.status = "PUBLISHED";
  const json = canonicalJson(
    publishedPackage,
    `Published package ${publishedPackage.packageId}:${publishedPackage.versionId}`,
  );
  const bytes = encoder.encode(json);
  if (bytes.byteLength > MAX_RULE_ARTIFACT_BYTES) {
    throw new RuleCatalogPublicationError(
      "ARTIFACT_TOO_LARGE",
      `Published package ${publishedPackage.packageId}:${publishedPackage.versionId} exceeds ${MAX_RULE_ARTIFACT_BYTES} bytes.`,
    );
  }

  let digest: Uint8Array;
  try {
    digest = await signer.sha256(bytes);
  } catch {
    throw new RuleCatalogPublicationError(
      "CRYPTOGRAPHY_FAILED",
      `Could not hash rule package ${publishedPackage.packageId}:${publishedPackage.versionId}.`,
    );
  }
  if (digest.byteLength !== 32) {
    throw new RuleCatalogPublicationError(
      "CRYPTOGRAPHY_FAILED",
      "The publication SHA-256 provider returned an invalid digest length.",
    );
  }

  return {
    rulePackage: publishedPackage,
    descriptor: {
      packageId: publishedPackage.packageId,
      versionId: publishedPackage.versionId,
      kind: publishedPackage.kind,
      engineContractVersion: publishedPackage.engineContractVersion,
      validFrom: publishedPackage.validFrom,
      validTo: publishedPackage.validTo,
      path: `packages/${publishedPackage.packageId}/${publishedPackage.versionId}.json`,
      sha256: bytesToHex(digest),
      sizeBytes: bytes.byteLength,
    },
    json,
  };
}

function deriveTracks(packages: readonly RulePackage[]): RuleManifest["tracks"] {
  const groups = new Map<string, RulePackage[]>();
  for (const rulePackage of packages) {
    const key = `${rulePackage.kind}\u0000${rulePackage.packageId}`;
    const group = groups.get(key) ?? [];
    group.push(rulePackage);
    groups.set(key, group);
  }
  return [...groups.values()]
    .map((group): Track => {
      const sorted = [...group].sort(packageSort);
      const first = sorted[0];
      const last = sorted.at(-1);
      if (first === undefined || last === undefined) {
        throw new RuleCatalogPublicationError("INVALID_CATALOG", "A rule track is empty.");
      }
      return {
        packageId: first.packageId,
        kind: first.kind,
        coverageFrom: first.validFrom,
        coverageTo: last.validTo,
        coverage: "COMPLETE",
      };
    })
    .sort(
      (left, right) =>
        kindOrder[left.kind] - kindOrder[right.kind] ||
        left.packageId.localeCompare(right.packageId),
    ) as RuleManifest["tracks"];
}

function sameCanonicalValue(left: unknown, right: unknown): boolean {
  return (
    canonicalJson(left, "Publication metadata") === canonicalJson(right, "Publication metadata")
  );
}

function assertGenerationTransition(
  manifest: RuleManifest,
  previousManifest: RuleManifest | null,
): boolean {
  if (previousManifest === null) {
    if (manifest.generation !== 1) {
      throw new RuleCatalogPublicationError(
        "MISSING_PREVIOUS_MANIFEST",
        "Generation 1 is the only publication allowed without a verified previous manifest.",
      );
    }
    return false;
  }
  if (previousManifest.channel !== manifest.channel) {
    throw new RuleCatalogPublicationError(
      "GENERATION_CONFLICT",
      "The previous manifest belongs to a different publication channel.",
    );
  }
  if (previousManifest.generation === manifest.generation) {
    if (!sameCanonicalValue(previousManifest, manifest)) {
      throw new RuleCatalogPublicationError(
        "GENERATION_CONFLICT",
        `Generation ${manifest.generation} already exists with different signed content.`,
      );
    }
    return true;
  }
  if (manifest.generation !== previousManifest.generation + 1) {
    throw new RuleCatalogPublicationError(
      "GENERATION_CONFLICT",
      `Generation ${manifest.generation} must directly follow verified generation ${previousManifest.generation}.`,
    );
  }
  if (Date.parse(manifest.publishedAt) <= Date.parse(previousManifest.publishedAt)) {
    throw new RuleCatalogPublicationError(
      "PUBLICATION_TIME_CONFLICT",
      "publishedAt must be later than the verified previous manifest.",
    );
  }
  return false;
}

function trackIdentity(track: Track): string {
  return `${track.kind}\u0000${track.packageId}`;
}

function formatCoverage(track: Track): string {
  return `${track.coverageFrom} through ${track.coverageTo ?? "open-ended"}`;
}

function assertTrackCoverageContinuity(
  manifest: RuleManifest,
  previousManifest: RuleManifest | null,
): void {
  if (previousManifest === null || manifest.rollbackOfGeneration !== null) return;

  const nextTracks = new Map(manifest.tracks.map((track) => [trackIdentity(track), track]));
  for (const previousTrack of previousManifest.tracks) {
    const nextTrack = nextTracks.get(trackIdentity(previousTrack));
    const startsLater =
      nextTrack === undefined || nextTrack.coverageFrom > previousTrack.coverageFrom;
    const endsEarlier =
      nextTrack === undefined ||
      (previousTrack.coverageTo === null
        ? nextTrack.coverageTo !== null
        : nextTrack.coverageTo !== null && nextTrack.coverageTo < previousTrack.coverageTo);

    if (startsLater || endsEarlier) {
      const nextCoverage = nextTrack === undefined ? "missing" : formatCoverage(nextTrack);
      throw new RuleCatalogPublicationError(
        "TRACK_COVERAGE_REGRESSION",
        `Normal generation ${manifest.generation} reduces ${previousTrack.kind}:${previousTrack.packageId} coverage from ${formatCoverage(previousTrack)} to ${nextCoverage}. Retain the published coverage or create a verified rollback.`,
      );
    }
  }
}

function assertRollbackTarget(manifest: RuleManifest, rollbackManifest: RuleManifest | null): void {
  if (manifest.rollbackOfGeneration === null) {
    if (rollbackManifest !== null) {
      throw new RuleCatalogPublicationError(
        "ROLLBACK_TARGET_MISMATCH",
        "A rollback target was supplied for a normal publication.",
      );
    }
    return;
  }
  if (
    rollbackManifest === null ||
    rollbackManifest.channel !== manifest.channel ||
    rollbackManifest.generation !== manifest.rollbackOfGeneration ||
    !sameCanonicalValue(rollbackManifest.tracks, manifest.tracks) ||
    !sameCanonicalValue(rollbackManifest.packages, manifest.packages)
  ) {
    throw new RuleCatalogPublicationError(
      "ROLLBACK_TARGET_MISMATCH",
      "A rollback must reproduce the tracks and package descriptors of its verified target generation.",
    );
  }
}

export async function createRuleCatalogPublication(
  input: CreateRuleCatalogPublicationInput,
): Promise<RuleCatalogPublication> {
  const requestValidation = validateRuleCatalogPublicationRequest(input.request);
  if (!requestValidation.ok) {
    throw new RuleCatalogPublicationError(
      "INVALID_REQUEST",
      "The publication request does not satisfy the publication contract.",
      requestValidation.issues,
    );
  }
  const request: RuleCatalogPublicationRequest = requestValidation.value;
  const sourceByPath = new Map(input.sources.map((source) => [source.sourcePath, source]));
  if (
    sourceByPath.size !== input.sources.length ||
    sourceByPath.size !== request.packageSources.length ||
    request.packageSources.some((sourcePath) => !sourceByPath.has(sourcePath))
  ) {
    throw new RuleCatalogPublicationError(
      "SOURCE_SET_MISMATCH",
      "The loaded rule packages do not exactly match packageSources.",
    );
  }

  const publishedArtifacts = await Promise.all(
    request.packageSources.map((sourcePath) =>
      publishPackage(sourceByPath.get(sourcePath)!, input.signer),
    ),
  );
  publishedArtifacts.sort((left, right) => packageSort(left.rulePackage, right.rulePackage));
  const packages = publishedArtifacts.map((artifact) => artifact.rulePackage);
  const descriptors = publishedArtifacts.map(
    (artifact) => artifact.descriptor,
  ) as RuleManifest["packages"];
  const manifest: RuleManifest = {
    schemaVersion: 1,
    generation: request.generation,
    channel: request.channel,
    publishedAt: request.publishedAt,
    rollbackOfGeneration: request.rollbackOfGeneration,
    tracks: deriveTracks(packages),
    packages: descriptors,
    signing: {
      algorithm: request.signing.algorithm,
      canonicalization: request.signing.canonicalization,
      keyId: request.signing.keyId,
      signature: "A".repeat(86),
    },
  };

  let signature: Uint8Array;
  try {
    signature = await input.signer.signEd25519(canonicalizeRuleManifestForSignature(manifest));
  } catch {
    throw new RuleCatalogPublicationError(
      "CRYPTOGRAPHY_FAILED",
      "The rule catalog manifest could not be signed.",
    );
  }
  if (signature.byteLength !== 64) {
    throw new RuleCatalogPublicationError(
      "INVALID_SIGNATURE_LENGTH",
      "The Ed25519 signer returned an invalid signature length.",
    );
  }
  manifest.signing.signature = bytesToBase64Url(signature);

  const catalogValidation = validateRuleCatalog(manifest, packages);
  if (!catalogValidation.ok) {
    throw new RuleCatalogPublicationError(
      "INVALID_CATALOG",
      "The publication output does not satisfy the rule catalog contract.",
      catalogValidation.issues,
    );
  }
  if (!isRuleCatalogRuntimeCompatible(catalogValidation.value)) {
    throw new RuleCatalogPublicationError(
      "RUNTIME_INCOMPATIBLE",
      "Engine contract v1 requires exactly one tariff, legal, and holiday track.",
    );
  }

  const manifestJson = `${JSON.stringify(manifest, null, 2)}\n`;
  if (encoder.encode(manifestJson).byteLength > MAX_RULE_ARTIFACT_BYTES) {
    throw new RuleCatalogPublicationError(
      "ARTIFACT_TOO_LARGE",
      `The signed manifest exceeds ${MAX_RULE_ARTIFACT_BYTES} bytes.`,
    );
  }
  const idempotentRetry = assertGenerationTransition(
    manifest,
    input.verifiedPreviousManifest ?? null,
  );
  assertTrackCoverageContinuity(manifest, input.verifiedPreviousManifest ?? null);
  assertRollbackTarget(manifest, input.verifiedRollbackManifest ?? null);

  const packageArtifacts = publishedArtifacts.map((artifact): RuleCatalogPublicationArtifact => ({
    relativePath: artifact.descriptor.path,
    contents: artifact.json,
    immutable: true,
    role: "PACKAGE",
    cacheControl: "public, max-age=31536000, immutable",
  }));
  const versionedManifestPath = `manifests/${manifest.generation}.json`;
  const artifacts: RuleCatalogPublicationArtifact[] = [
    ...packageArtifacts,
    {
      relativePath: versionedManifestPath,
      contents: manifestJson,
      immutable: true,
      role: "VERSIONED_MANIFEST",
      cacheControl: "public, max-age=31536000, immutable",
    },
    {
      relativePath: "current.json",
      contents: manifestJson,
      immutable: false,
      role: "CURRENT_MANIFEST",
      cacheControl: "public, max-age=0, must-revalidate",
    },
  ];

  return Object.freeze({
    channelRoot: manifest.channel.toLowerCase() as "preview" | "production",
    manifest: deepFreeze(manifest),
    manifestJson,
    packageJson: Object.freeze(publishedArtifacts.map((artifact) => artifact.json)),
    artifacts: Object.freeze(artifacts.map((artifact) => Object.freeze(artifact))),
    idempotentRetry,
  });
}
