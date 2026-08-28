import { createHash } from "node:crypto";

import * as ed25519 from "@noble/ed25519";
import canonicalize from "canonicalize";
import { describe, expect, it, vi } from "vitest";

import holidayPackageFixture from "../../rules/examples/holiday-package.valid.json";
import legalPackageFixture from "../../rules/examples/legal-package.valid.json";
import manifestFixture from "../../rules/examples/manifest.valid.json";
import tariffPackageFixture from "../../rules/examples/tariff-package.valid.json";
import { verifyRuleCatalogArtifactsOnDevice as verifyRuleCatalogArtifacts } from "@/infrastructure/rule-catalog-cryptography";
import type { RuleManifest, RulePackage } from "@/rules/contracts.generated";
import {
  isVerifiedRuleCatalogArtifacts,
  RuleCatalogVerificationError,
  type RuleCatalogVerificationPolicy,
  type UntrustedRuleCatalogArtifacts,
} from "@/rules/rule-catalog-verification";

vi.mock("expo-crypto", async () => {
  const { createHash: createNodeHash } = await import("node:crypto");
  return {
    CryptoDigestAlgorithm: {
      SHA256: "SHA-256",
      SHA512: "SHA-512",
    },
    digest: async (algorithm: string, data: ArrayBuffer | Uint8Array) => {
      const name = algorithm.toLowerCase().replace("-", "");
      const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
      return Uint8Array.from(createNodeHash(name).update(bytes).digest()).buffer;
    },
  };
});

const encoder = new TextEncoder();
const secretKey = Uint8Array.from([
  0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26,
  27, 28, 29, 30, 31,
]);

ed25519.hashes.sha512 = (message) => Uint8Array.from(createHash("sha512").update(message).digest());

const publicKey = ed25519.getPublicKey(secretKey);

function clone<T>(value: T): T {
  return structuredClone(value);
}

function sha256Hex(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function unsignedManifest(manifest: RuleManifest): unknown {
  const { signature: _signature, ...signing } = manifest.signing;
  return { ...manifest, signing };
}

function signManifest(manifest: RuleManifest): void {
  const canonical = canonicalize(unsignedManifest(manifest));
  if (canonical === undefined) throw new Error("Test manifest could not be canonicalized.");
  manifest.signing.signature = Buffer.from(
    ed25519.sign(encoder.encode(canonical), secretKey),
  ).toString("base64url");
}

function packageIdentity(value: Pick<RulePackage, "packageId" | "versionId">): string {
  return `${value.packageId}\u0000${value.versionId}`;
}

function buildArtifacts(generation = 1): {
  artifacts: UntrustedRuleCatalogArtifacts;
  manifest: RuleManifest;
  policy: RuleCatalogVerificationPolicy;
} {
  const packages = [
    clone(tariffPackageFixture),
    clone(legalPackageFixture),
    clone(holidayPackageFixture),
  ] as RulePackage[];
  const packageJson = packages.map((rulePackage) => JSON.stringify(rulePackage));
  const rawByIdentity = new Map(
    packages.map((rulePackage, index) => [packageIdentity(rulePackage), packageJson[index]]),
  );
  const manifest = clone(manifestFixture) as RuleManifest;
  manifest.generation = generation;
  manifest.publishedAt = `2026-08-${String(20 + generation).padStart(2, "0")}T12:00:00Z`;
  manifest.signing.keyId = "test-key-2026";
  manifest.packages = manifest.packages.map((descriptor) => {
    const raw = rawByIdentity.get(packageIdentity(descriptor));
    if (raw === undefined) throw new Error("Missing package test fixture.");
    return {
      ...descriptor,
      sha256: sha256Hex(raw),
      sizeBytes: encoder.encode(raw).byteLength,
    };
  }) as RuleManifest["packages"];
  signManifest(manifest);

  return {
    artifacts: {
      manifestJson: JSON.stringify(manifest, null, 2),
      packageJson: [...packageJson].reverse(),
    },
    manifest,
    policy: {
      expectedChannel: "PREVIEW",
      supportedEngineContractVersions: new Set([1]),
      trustedPublicKeys: new Map([["test-key-2026", publicKey]]),
    },
  };
}

async function expectVerificationError(
  operation: Promise<unknown>,
  code: RuleCatalogVerificationError["code"],
): Promise<RuleCatalogVerificationError> {
  try {
    await operation;
  } catch (error) {
    expect(error).toBeInstanceOf(RuleCatalogVerificationError);
    const verificationError = error as RuleCatalogVerificationError;
    expect(verificationError.code).toBe(code);
    return verificationError;
  }
  throw new Error(`Expected RuleCatalogVerificationError ${code}.`);
}

function tamperWithoutChangingLength(raw: string): string {
  const marker = '"label":"';
  const index = raw.indexOf(marker) + marker.length;
  if (index < marker.length) throw new Error("Fixture has no label.");
  const replacement = raw[index] === "X" ? "Y" : "X";
  return `${raw.slice(0, index)}${replacement}${raw.slice(index + 1)}`;
}

describe("rule catalog verification", () => {
  it("verifies a signed catalog independently of JSON formatting and package order", async () => {
    const { artifacts, policy } = buildArtifacts();

    const verified = await verifyRuleCatalogArtifacts(artifacts, policy);

    expect(isVerifiedRuleCatalogArtifacts(verified)).toBe(true);
    expect(verified.manifestJson).toBe(artifacts.manifestJson);
    expect(verified.packageJson).toEqual(artifacts.packageJson);
    expect(Object.isFrozen(verified)).toBe(true);
    expect(Object.isFrozen(verified.packageJson)).toBe(true);
  });

  it("rejects a manifest changed after signing", async () => {
    const { artifacts, manifest, policy } = buildArtifacts();
    manifest.publishedAt = "2026-08-28T12:00:01Z";

    await expectVerificationError(
      verifyRuleCatalogArtifacts({ ...artifacts, manifestJson: JSON.stringify(manifest) }, policy),
      "INVALID_SIGNATURE",
    );
  });

  it("rejects package bytes changed after publication even when their size is unchanged", async () => {
    const { artifacts, policy } = buildArtifacts();
    const packageJson = [...artifacts.packageJson];
    packageJson[0] = tamperWithoutChangingLength(packageJson[0]);

    await expectVerificationError(
      verifyRuleCatalogArtifacts({ ...artifacts, packageJson }, policy),
      "PACKAGE_HASH_MISMATCH",
    );
  });

  it("rejects a signed descriptor with an incorrect package size", async () => {
    const { artifacts, manifest, policy } = buildArtifacts();
    manifest.packages[0].sizeBytes += 1;
    signManifest(manifest);

    await expectVerificationError(
      verifyRuleCatalogArtifacts({ ...artifacts, manifestJson: JSON.stringify(manifest) }, policy),
      "PACKAGE_SIZE_MISMATCH",
    );
  });

  it("rejects integrity-valid packages that violate the semantic catalog contract", async () => {
    const { artifacts, manifest, policy } = buildArtifacts();
    const packageJson = [...artifacts.packageJson];
    const unpublished = JSON.parse(packageJson[0]) as RulePackage;
    unpublished.status = "DRAFT";
    unpublished.review = {
      status: "DRAFT",
      reviewedBy: null,
      reviewedAt: null,
      gitCommit: null,
    };
    packageJson[0] = JSON.stringify(unpublished);
    const descriptor = manifest.packages.find(
      (candidate) => packageIdentity(candidate) === packageIdentity(unpublished),
    );
    if (descriptor === undefined) throw new Error("Missing package descriptor test fixture.");
    descriptor.sha256 = sha256Hex(packageJson[0]);
    descriptor.sizeBytes = encoder.encode(packageJson[0]).byteLength;
    signManifest(manifest);

    await expectVerificationError(
      verifyRuleCatalogArtifacts({ manifestJson: JSON.stringify(manifest), packageJson }, policy),
      "INVALID_CATALOG",
    );
  });

  it("rejects untrusted keys, wrong channels, and unsupported engine contracts", async () => {
    const { artifacts, policy } = buildArtifacts();

    await expectVerificationError(
      verifyRuleCatalogArtifacts(artifacts, {
        ...policy,
        trustedPublicKeys: new Map(),
      }),
      "UNTRUSTED_KEY",
    );
    await expectVerificationError(
      verifyRuleCatalogArtifacts(artifacts, {
        ...policy,
        trustedPublicKeys: new Map([["test-key-2026", new Uint8Array(32)]]),
      }),
      "INVALID_SIGNATURE",
    );
    await expectVerificationError(
      verifyRuleCatalogArtifacts(artifacts, { ...policy, expectedChannel: "PRODUCTION" }),
      "CHANNEL_MISMATCH",
    );
    await expectVerificationError(
      verifyRuleCatalogArtifacts(artifacts, {
        ...policy,
        supportedEngineContractVersions: new Set(),
      }),
      "UNSUPPORTED_ENGINE_CONTRACT",
    );
  });

  it("rejects malformed JSON and incomplete package sets before activation", async () => {
    const { artifacts, policy } = buildArtifacts();

    await expectVerificationError(
      verifyRuleCatalogArtifacts({ manifestJson: "{", packageJson: [] }, policy),
      "INVALID_ARTIFACT_JSON",
    );
    await expectVerificationError(
      verifyRuleCatalogArtifacts(
        { ...artifacts, packageJson: artifacts.packageJson.slice(1) },
        policy,
      ),
      "PACKAGE_COUNT_MISMATCH",
    );
  });

  it("bounds raw artifacts and rejects malformed trusted key material", async () => {
    const { artifacts, policy } = buildArtifacts();

    await expectVerificationError(
      verifyRuleCatalogArtifacts(
        { ...artifacts, manifestJson: artifacts.manifestJson.padEnd(524_289, " ") },
        policy,
      ),
      "ARTIFACT_TOO_LARGE",
    );
    await expectVerificationError(
      verifyRuleCatalogArtifacts(artifacts, {
        ...policy,
        trustedPublicKeys: new Map([["test-key-2026", new Uint8Array(31)]]),
      }),
      "INVALID_TRUSTED_KEY",
    );
  });

  it("does not treat structurally identical caller-created objects as verified", () => {
    const { artifacts } = buildArtifacts();

    expect(isVerifiedRuleCatalogArtifacts(artifacts)).toBe(false);
  });
});
