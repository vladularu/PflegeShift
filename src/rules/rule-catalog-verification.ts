import canonicalize from "canonicalize";

import type { RuleManifest } from "@/rules/contracts.generated";
import { validateManifest, validateRuleCatalog, type ValidationIssue } from "@/rules/validation";

const MAX_RULE_ARTIFACT_BYTES = 524_288;
const verifiedRuleCatalogArtifacts: unique symbol = Symbol("verifiedRuleCatalogArtifacts");
const encoder = new TextEncoder();

export interface UntrustedRuleCatalogArtifacts {
  readonly manifestJson: string;
  readonly packageJson: readonly string[];
}

export interface VerifiedRuleCatalogArtifacts extends UntrustedRuleCatalogArtifacts {
  readonly [verifiedRuleCatalogArtifacts]: true;
}

export interface RuleCatalogVerificationPolicy {
  readonly expectedChannel: RuleManifest["channel"];
  readonly supportedEngineContractVersions: ReadonlySet<number>;
  readonly trustedPublicKeys: ReadonlyMap<string, Uint8Array>;
}

export interface RuleCatalogCryptography {
  readonly sha256: (bytes: Uint8Array) => Promise<Uint8Array>;
  readonly verifyEd25519: (
    signature: Uint8Array,
    message: Uint8Array,
    publicKey: Uint8Array,
  ) => Promise<boolean>;
}

export type RuleCatalogVerificationErrorCode =
  | "ARTIFACT_TOO_LARGE"
  | "INVALID_ARTIFACT_JSON"
  | "INVALID_MANIFEST"
  | "CHANNEL_MISMATCH"
  | "UNTRUSTED_KEY"
  | "INVALID_TRUSTED_KEY"
  | "INVALID_SIGNATURE"
  | "PACKAGE_COUNT_MISMATCH"
  | "PACKAGE_SIZE_MISMATCH"
  | "PACKAGE_HASH_MISMATCH"
  | "INVALID_CATALOG"
  | "UNSUPPORTED_ENGINE_CONTRACT"
  | "CRYPTO_UNAVAILABLE";

export class RuleCatalogVerificationError extends Error {
  readonly code: RuleCatalogVerificationErrorCode;
  readonly issues: readonly ValidationIssue[];

  constructor(
    code: RuleCatalogVerificationErrorCode,
    message: string,
    issues: readonly ValidationIssue[] = [],
  ) {
    super(message);
    this.name = "RuleCatalogVerificationError";
    this.code = code;
    this.issues = issues;
  }
}

function artifactBytes(json: string, label: string): Uint8Array {
  const bytes = encoder.encode(json);
  if (bytes.byteLength > MAX_RULE_ARTIFACT_BYTES) {
    throw new RuleCatalogVerificationError(
      "ARTIFACT_TOO_LARGE",
      `${label} exceeds the maximum rule artifact size.`,
    );
  }
  return bytes;
}

function parseArtifact(json: string, label: string): unknown {
  try {
    return JSON.parse(json, (_key, value: unknown) => {
      if (typeof value === "number" && !Number.isFinite(value)) {
        throw new Error("non-finite number");
      }
      return value;
    }) as unknown;
  } catch {
    throw new RuleCatalogVerificationError(
      "INVALID_ARTIFACT_JSON",
      `${label} is not finite valid JSON.`,
    );
  }
}

function canonicalManifestPayload(manifest: RuleManifest): Uint8Array {
  const { signature: _signature, ...signing } = manifest.signing;
  try {
    const serialized = canonicalize({ ...manifest, signing });
    if (serialized === undefined) throw new Error("undefined canonical output");
    return encoder.encode(serialized);
  } catch {
    throw new RuleCatalogVerificationError(
      "INVALID_MANIFEST",
      "The manifest cannot be canonicalized according to RFC 8785.",
    );
  }
}

function decodeBase64Url(value: string): Uint8Array {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
  const output = new Uint8Array(Math.floor((value.length * 6) / 8));
  let buffer = 0;
  let bitCount = 0;
  let outputIndex = 0;

  for (const character of value) {
    const digit = alphabet.indexOf(character);
    if (digit < 0) throw new Error("invalid base64url character");
    buffer = (buffer << 6) | digit;
    bitCount += 6;
    if (bitCount >= 8) {
      bitCount -= 8;
      output[outputIndex] = (buffer >>> bitCount) & 0xff;
      outputIndex += 1;
      buffer &= (1 << bitCount) - 1;
    }
  }

  if (outputIndex !== output.length || (bitCount > 0 && buffer !== 0)) {
    throw new Error("non-canonical base64url value");
  }
  return output;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
}

async function verifyManifestSignature(
  manifest: RuleManifest,
  publicKey: Uint8Array,
  cryptography: RuleCatalogCryptography,
): Promise<void> {
  let signature: Uint8Array;
  try {
    signature = decodeBase64Url(manifest.signing.signature);
  } catch {
    throw new RuleCatalogVerificationError(
      "INVALID_SIGNATURE",
      "The rule catalog signature encoding is invalid.",
    );
  }
  if (signature.byteLength !== 64) {
    throw new RuleCatalogVerificationError(
      "INVALID_SIGNATURE",
      "The rule catalog signature has an invalid length.",
    );
  }

  try {
    const verified = await cryptography.verifyEd25519(
      signature,
      canonicalManifestPayload(manifest),
      publicKey,
    );
    if (!verified) {
      throw new RuleCatalogVerificationError(
        "INVALID_SIGNATURE",
        "The rule catalog signature is not valid for the trusted key.",
      );
    }
  } catch (error) {
    if (error instanceof RuleCatalogVerificationError) throw error;
    throw new RuleCatalogVerificationError(
      "INVALID_SIGNATURE",
      "The rule catalog signature could not be verified.",
    );
  }
}

function packageIdentity(value: unknown): string | null {
  if (value === null || typeof value !== "object") return null;
  const packageId = Reflect.get(value, "packageId");
  const versionId = Reflect.get(value, "versionId");
  return typeof packageId === "string" && typeof versionId === "string"
    ? `${packageId}\u0000${versionId}`
    : null;
}

function manifestPackageIdentity(descriptor: RuleManifest["packages"][number]): string {
  return `${descriptor.packageId}\u0000${descriptor.versionId}`;
}

function verifiedArtifacts(artifacts: UntrustedRuleCatalogArtifacts): VerifiedRuleCatalogArtifacts {
  const result = {
    manifestJson: artifacts.manifestJson,
    packageJson: Object.freeze([...artifacts.packageJson]),
  } as VerifiedRuleCatalogArtifacts;
  Object.defineProperty(result, verifiedRuleCatalogArtifacts, { value: true });
  return Object.freeze(result);
}

export function isVerifiedRuleCatalogArtifacts(
  value: unknown,
): value is VerifiedRuleCatalogArtifacts {
  return (
    value !== null &&
    typeof value === "object" &&
    Reflect.get(value, verifiedRuleCatalogArtifacts) === true
  );
}

export async function verifyRuleCatalogArtifacts(
  artifacts: UntrustedRuleCatalogArtifacts,
  policy: RuleCatalogVerificationPolicy,
  cryptography: RuleCatalogCryptography,
): Promise<VerifiedRuleCatalogArtifacts> {
  artifactBytes(artifacts.manifestJson, "The rule catalog manifest");
  const manifestValue = parseArtifact(artifacts.manifestJson, "The rule catalog manifest");
  const manifestValidation = validateManifest(manifestValue);
  if (!manifestValidation.ok) {
    throw new RuleCatalogVerificationError(
      "INVALID_MANIFEST",
      "The rule catalog manifest does not satisfy the catalog contract.",
      manifestValidation.issues,
    );
  }
  const manifest = manifestValidation.value;
  if (manifest.channel !== policy.expectedChannel) {
    throw new RuleCatalogVerificationError(
      "CHANNEL_MISMATCH",
      "The rule catalog belongs to a different release channel.",
    );
  }

  const configuredKey = policy.trustedPublicKeys.get(manifest.signing.keyId);
  if (configuredKey === undefined) {
    throw new RuleCatalogVerificationError(
      "UNTRUSTED_KEY",
      "The rule catalog signing key is not trusted by this app version.",
    );
  }
  const publicKey = new Uint8Array(configuredKey);
  if (publicKey.byteLength !== 32) {
    throw new RuleCatalogVerificationError(
      "INVALID_TRUSTED_KEY",
      "The configured rule catalog public key has an invalid length.",
    );
  }
  await verifyManifestSignature(manifest, publicKey, cryptography);

  if (
    manifest.packages.some(
      (descriptor) => !policy.supportedEngineContractVersions.has(descriptor.engineContractVersion),
    )
  ) {
    throw new RuleCatalogVerificationError(
      "UNSUPPORTED_ENGINE_CONTRACT",
      "The rule catalog requires an unsupported engine contract version.",
    );
  }
  if (artifacts.packageJson.length !== manifest.packages.length) {
    throw new RuleCatalogVerificationError(
      "PACKAGE_COUNT_MISMATCH",
      "The downloaded package set does not match the signed manifest.",
    );
  }

  const descriptors = new Map(
    manifest.packages.map((descriptor) => [manifestPackageIdentity(descriptor), descriptor]),
  );
  const packageValues: unknown[] = [];
  const seenPackages = new Set<string>();
  for (const [index, rawPackage] of artifacts.packageJson.entries()) {
    const bytes = artifactBytes(rawPackage, `Rule catalog package ${index}`);
    const packageValue = parseArtifact(rawPackage, `Rule catalog package ${index}`);
    packageValues.push(packageValue);
    const identity = packageIdentity(packageValue);
    const descriptor = identity === null ? undefined : descriptors.get(identity);
    if (identity === null || descriptor === undefined || seenPackages.has(identity)) {
      throw new RuleCatalogVerificationError(
        "INVALID_CATALOG",
        "The downloaded packages do not match the signed manifest identities.",
      );
    }
    seenPackages.add(identity);
    if (bytes.byteLength !== descriptor.sizeBytes) {
      throw new RuleCatalogVerificationError(
        "PACKAGE_SIZE_MISMATCH",
        `Rule package ${descriptor.packageId}:${descriptor.versionId} has an unexpected size.`,
      );
    }
    let sha256: string;
    try {
      sha256 = bytesToHex(await cryptography.sha256(bytes));
    } catch (error) {
      if (error instanceof RuleCatalogVerificationError) throw error;
      throw new RuleCatalogVerificationError(
        "CRYPTO_UNAVAILABLE",
        "The platform cryptography provider could not hash a rule package.",
      );
    }
    if (sha256 !== descriptor.sha256) {
      throw new RuleCatalogVerificationError(
        "PACKAGE_HASH_MISMATCH",
        `Rule package ${descriptor.packageId}:${descriptor.versionId} failed its SHA-256 check.`,
      );
    }
  }

  const catalogValidation = validateRuleCatalog(manifest, packageValues);
  if (!catalogValidation.ok) {
    throw new RuleCatalogVerificationError(
      "INVALID_CATALOG",
      "The verified artifacts do not satisfy the rule catalog contract.",
      catalogValidation.issues,
    );
  }
  return verifiedArtifacts(artifacts);
}
