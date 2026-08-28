import { createHash } from "node:crypto";

import * as ed25519 from "@noble/ed25519";
import canonicalize from "canonicalize";
import { describe, expect, it } from "vitest";

import holidayPackageFixture from "../../rules/examples/holiday-package.valid.json";
import legalPackageFixture from "../../rules/examples/legal-package.valid.json";
import tariffPackageFixture from "../../rules/examples/tariff-package.valid.json";
import type { RuleCatalogPublicationRequest, RulePackage } from "./contracts.generated";
import {
  createRuleCatalogPublication,
  RuleCatalogPublicationError,
  type RuleCatalogPublicationSource,
} from "./rule-catalog-publication";
import {
  canonicalizeRuleJson,
  isVerifiedRuleCatalogArtifacts,
  verifyRuleCatalogArtifacts,
  type RuleCatalogCryptography,
} from "./rule-catalog-verification";

const signingKey = Uint8Array.from([
  0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26,
  27, 28, 29, 30, 31,
]);

ed25519.hashes.sha512 = (message) => Uint8Array.from(createHash("sha512").update(message).digest());
const publicKey = ed25519.getPublicKey(signingKey);
const testSigner = {
  sha256: async (bytes: Uint8Array) => Uint8Array.from(createHash("sha256").update(bytes).digest()),
  signEd25519: async (message: Uint8Array) => ed25519.sign(message, signingKey),
};
const testCryptography: RuleCatalogCryptography = {
  sha256: testSigner.sha256,
  verifyEd25519: async (signature, message, candidatePublicKey) =>
    ed25519.verify(signature, message, candidatePublicKey, { zip215: false }),
};

function clone<T>(value: T): T {
  return structuredClone(value);
}

function reviewedSource(fixture: unknown): RuleCatalogPublicationSource {
  const reviewedPackage = clone(fixture) as RulePackage;
  reviewedPackage.status = "REVIEWED";
  reviewedPackage.review.status = "REVIEWED";
  const reviewedCommit = reviewedPackage.review.gitCommit;
  if (reviewedCommit === null) throw new Error("The fixture must contain review evidence.");

  const commitPackage = clone(reviewedPackage);
  commitPackage.status = "DRAFT";
  commitPackage.review = {
    status: "DRAFT",
    reviewedBy: null,
    reviewedAt: null,
    gitCommit: null,
  };
  return {
    sourcePath: `rules/packages/reviewed/${reviewedPackage.packageId}/${reviewedPackage.versionId}.json`,
    sourceJson: JSON.stringify(reviewedPackage, null, 2),
    reviewedCommit,
    reviewedCommitJson: JSON.stringify(commitPackage),
  };
}

function sources(): RuleCatalogPublicationSource[] {
  return [
    reviewedSource(tariffPackageFixture),
    reviewedSource(legalPackageFixture),
    reviewedSource(holidayPackageFixture),
  ];
}

function request(
  packageSources: readonly RuleCatalogPublicationSource[],
  overrides: Partial<RuleCatalogPublicationRequest> = {},
): RuleCatalogPublicationRequest {
  return {
    schemaVersion: 1,
    generation: 1,
    channel: "PREVIEW",
    publishedAt: "2026-08-28T12:00:00Z",
    rollbackOfGeneration: null,
    packageSources: packageSources.map((source) => source.sourcePath) as [string, ...string[]],
    signing: {
      algorithm: "ED25519",
      canonicalization: "RFC8785",
      keyId: "preview-test-2026",
    },
    ...overrides,
  };
}

async function expectPublicationError(
  operation: Promise<unknown>,
  code: RuleCatalogPublicationError["code"],
): Promise<RuleCatalogPublicationError> {
  try {
    await operation;
  } catch (error) {
    expect(error).toBeInstanceOf(RuleCatalogPublicationError);
    const publicationError = error as RuleCatalogPublicationError;
    expect(publicationError.code).toBe(code);
    return publicationError;
  }
  throw new Error(`Expected RuleCatalogPublicationError ${code}.`);
}

describe("rule catalog publication", () => {
  it("matches the independent RFC 8785 implementation for nested JSON values", () => {
    const value = {
      z: [3, null, { "€": "currency", a: -0 }],
      number: 1e30,
      text: "Pflege 🩺",
      a: true,
    };

    expect(canonicalizeRuleJson(value)).toBe(canonicalize(value));
    expect(() => canonicalizeRuleJson("\ud800")).toThrow();
    expect(() => canonicalizeRuleJson(Number.POSITIVE_INFINITY)).toThrow();
  });

  it("produces deterministic signed artifacts accepted by the on-device verifier", async () => {
    const packageSources = sources();
    const publicationRequest = request(packageSources);

    const publication = await createRuleCatalogPublication({
      request: publicationRequest,
      sources: [...packageSources].reverse(),
      signer: testSigner,
    });
    const repeated = await createRuleCatalogPublication({
      request: publicationRequest,
      sources: packageSources,
      signer: testSigner,
    });

    expect(publication.manifestJson).toBe(repeated.manifestJson);
    expect(publication.packageJson).toEqual(repeated.packageJson);
    expect(publication.manifest.packages.map((descriptor) => descriptor.path)).toEqual([
      "packages/tvoed-vka-bt-k/2026-05.json",
      "packages/de-arbzg-care/2026-01.json",
      "packages/de-holidays/2026.json",
    ]);
    expect(publication.artifacts.map((artifact) => artifact.role)).toEqual([
      "PACKAGE",
      "PACKAGE",
      "PACKAGE",
      "VERSIONED_MANIFEST",
      "CURRENT_MANIFEST",
    ]);
    expect(publication.artifacts.at(-1)?.relativePath).toBe("current.json");
    expect(
      publication.packageJson.every((json) => {
        const value = JSON.parse(json) as RulePackage;
        return value.status === "PUBLISHED" && value.review.status === "PUBLISHED";
      }),
    ).toBe(true);

    const verified = await verifyRuleCatalogArtifacts(
      { manifestJson: publication.manifestJson, packageJson: publication.packageJson },
      {
        expectedChannel: "PREVIEW",
        supportedEngineContractVersions: new Set([1]),
        trustedPublicKeys: new Map([["preview-test-2026", publicKey]]),
      },
      testCryptography,
    );
    expect(isVerifiedRuleCatalogArtifacts(verified)).toBe(true);
  });

  it("binds published rule content to the recorded review commit", async () => {
    const packageSources = sources();
    const changed = JSON.parse(packageSources[0].sourceJson) as RulePackage;
    changed.label = "Changed after review";
    packageSources[0] = { ...packageSources[0], sourceJson: JSON.stringify(changed) };

    await expectPublicationError(
      createRuleCatalogPublication({
        request: request(packageSources),
        sources: packageSources,
        signer: testSigner,
      }),
      "REVIEWED_CONTENT_MISMATCH",
    );
  });

  it("rejects unpublished sources and incorrect identity paths", async () => {
    const unpublishedSources = sources();
    const unpublished = JSON.parse(unpublishedSources[0].sourceJson) as RulePackage;
    unpublished.status = "DRAFT";
    unpublished.review = {
      status: "DRAFT",
      reviewedBy: null,
      reviewedAt: null,
      gitCommit: null,
    };
    unpublishedSources[0] = { ...unpublishedSources[0], sourceJson: JSON.stringify(unpublished) };
    await expectPublicationError(
      createRuleCatalogPublication({
        request: request(unpublishedSources),
        sources: unpublishedSources,
        signer: testSigner,
      }),
      "UNREVIEWED_PACKAGE",
    );

    const misplacedSources = sources();
    misplacedSources[0] = {
      ...misplacedSources[0],
      sourcePath: "rules/packages/reviewed/wrong/2026-05.json",
    };
    await expectPublicationError(
      createRuleCatalogPublication({
        request: request(misplacedSources),
        sources: misplacedSources,
        signer: testSigner,
      }),
      "SOURCE_PATH_MISMATCH",
    );
  });

  it("requires a complete engine-v1 catalog", async () => {
    const packageSources = sources().filter((source) => !source.sourcePath.includes("holidays"));

    await expectPublicationError(
      createRuleCatalogPublication({
        request: request(packageSources),
        sources: packageSources,
        signer: testSigner,
      }),
      "RUNTIME_INCOMPATIBLE",
    );
  });

  it("enforces consecutive generations, publication time, and idempotent retries", async () => {
    const packageSources = sources();
    const first = await createRuleCatalogPublication({
      request: request(packageSources),
      sources: packageSources,
      signer: testSigner,
    });
    const retry = await createRuleCatalogPublication({
      request: request(packageSources),
      sources: packageSources,
      signer: testSigner,
      verifiedPreviousManifest: first.manifest,
    });
    expect(retry.idempotentRetry).toBe(true);

    await expectPublicationError(
      createRuleCatalogPublication({
        request: request(packageSources, { publishedAt: "2026-08-28T12:00:01Z" }),
        sources: packageSources,
        signer: testSigner,
        verifiedPreviousManifest: first.manifest,
      }),
      "GENERATION_CONFLICT",
    );
    await expectPublicationError(
      createRuleCatalogPublication({
        request: request(packageSources, {
          generation: 2,
          publishedAt: first.manifest.publishedAt,
        }),
        sources: packageSources,
        signer: testSigner,
        verifiedPreviousManifest: first.manifest,
      }),
      "PUBLICATION_TIME_CONFLICT",
    );
    await expectPublicationError(
      createRuleCatalogPublication({
        request: request(packageSources, {
          generation: 3,
          publishedAt: "2026-08-28T13:00:00Z",
        }),
        sources: packageSources,
        signer: testSigner,
        verifiedPreviousManifest: first.manifest,
      }),
      "GENERATION_CONFLICT",
    );
    await expectPublicationError(
      createRuleCatalogPublication({
        request: request(packageSources, { generation: 2 }),
        sources: packageSources,
        signer: testSigner,
      }),
      "MISSING_PREVIOUS_MANIFEST",
    );
  });

  it("rejects publication requests that escape the reviewed package namespace", async () => {
    const packageSources = sources();
    const invalidRequest = request(packageSources);
    invalidRequest.packageSources[0] = "rules/examples/tariff-package.valid.json";

    await expectPublicationError(
      createRuleCatalogPublication({
        request: invalidRequest,
        sources: packageSources,
        signer: testSigner,
      }),
      "INVALID_REQUEST",
    );

    const wrongChannelKey = request(packageSources);
    wrongChannelKey.signing.keyId = "production-test-2026";
    await expectPublicationError(
      createRuleCatalogPublication({
        request: wrongChannelKey,
        sources: packageSources,
        signer: testSigner,
      }),
      "INVALID_REQUEST",
    );
  });

  it("publishes a rollback only when it exactly reproduces the verified target", async () => {
    const packageSources = sources();
    const first = await createRuleCatalogPublication({
      request: request(packageSources),
      sources: packageSources,
      signer: testSigner,
    });
    const second = await createRuleCatalogPublication({
      request: request(packageSources, {
        generation: 2,
        publishedAt: "2026-08-28T13:00:00Z",
      }),
      sources: packageSources,
      signer: testSigner,
      verifiedPreviousManifest: first.manifest,
    });
    const rollbackRequest = request(packageSources, {
      generation: 3,
      publishedAt: "2026-08-28T14:00:00Z",
      rollbackOfGeneration: 1,
    });
    const rollback = await createRuleCatalogPublication({
      request: rollbackRequest,
      sources: packageSources,
      signer: testSigner,
      verifiedPreviousManifest: second.manifest,
      verifiedRollbackManifest: first.manifest,
    });
    expect(rollback.manifest.rollbackOfGeneration).toBe(1);

    await expectPublicationError(
      createRuleCatalogPublication({
        request: rollbackRequest,
        sources: packageSources,
        signer: testSigner,
        verifiedPreviousManifest: second.manifest,
        verifiedRollbackManifest: second.manifest,
      }),
      "ROLLBACK_TARGET_MISMATCH",
    );
  });

  it("fails closed when the signer returns an invalid Ed25519 signature", async () => {
    const packageSources = sources();
    await expectPublicationError(
      createRuleCatalogPublication({
        request: request(packageSources),
        sources: packageSources,
        signer: { ...testSigner, signEd25519: async () => new Uint8Array(63) },
      }),
      "INVALID_SIGNATURE_LENGTH",
    );
  });
});
