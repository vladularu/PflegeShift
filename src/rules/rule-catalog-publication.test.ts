import { annualPaymentCandidate } from "./annual-payment-test-fixtures";
import { selectionCandidate } from "./tariff-selection-test-fixtures";
import { RULE_CATALOG_SUPPORTED_ENGINE_CONTRACT_VERSIONS } from "./rule-catalog-engine-support";
import { resolveTariffSelection } from "./tariff-selection";
import {
  createRuleResolverFromCatalog,
  isRuleCatalogRuntimeCompatible,
  requireResolvedPackage,
} from "./rule-resolver";
import { validateRuleCatalog } from "./validation";
import { createHash } from "node:crypto";

import * as ed25519 from "@noble/ed25519";
import canonicalize from "canonicalize";
import { describe, expect, it } from "vitest";

import holidayPackageFixture from "../../rules/examples/holiday-package.valid.json";
import legalPackageFixture from "../../rules/examples/legal-package.valid.json";
import tariffPackageFixture from "../../rules/examples/tariff-package.valid.json";
import historicalHolidayPackage from "../../rules/packages/reviewed/de-holidays/2026.json";
import futureHolidayPackage from "../../rules/packages/reviewed/de-holidays/2027.json";
import generationTwoRequest from "../../rules/releases/preview-generation-2.json";
import generationThreeRequest from "../../rules/releases/preview-generation-3.json";
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

  it("rejects a normal generation that drops previously published track coverage", async () => {
    const historicalSources = [
      reviewedSource(tariffPackageFixture),
      reviewedSource(legalPackageFixture),
      reviewedSource(historicalHolidayPackage),
    ];
    const first = await createRuleCatalogPublication({
      request: request(historicalSources),
      sources: historicalSources,
      signer: testSigner,
    });
    const futureOnlySources = [
      reviewedSource(tariffPackageFixture),
      reviewedSource(legalPackageFixture),
      reviewedSource(futureHolidayPackage),
    ];

    await expectPublicationError(
      createRuleCatalogPublication({
        request: request(futureOnlySources, {
          generation: 2,
          publishedAt: "2026-08-28T13:00:00Z",
        }),
        sources: futureOnlySources,
        signer: testSigner,
        verifiedPreviousManifest: first.manifest,
      }),
      "TRACK_COVERAGE_REGRESSION",
    );
  });

  it("publishes Generation 3 as a continuous extension of the verified Generation 2", async () => {
    const futureOnlySources = [
      reviewedSource(tariffPackageFixture),
      reviewedSource(legalPackageFixture),
      reviewedSource(futureHolidayPackage),
    ];
    const first = await createRuleCatalogPublication({
      request: request(futureOnlySources),
      sources: futureOnlySources,
      signer: testSigner,
    });
    const second = await createRuleCatalogPublication({
      request: generationTwoRequest,
      sources: futureOnlySources,
      signer: testSigner,
      verifiedPreviousManifest: first.manifest,
    });
    const continuousSources = [
      reviewedSource(tariffPackageFixture),
      reviewedSource(legalPackageFixture),
      reviewedSource(historicalHolidayPackage),
      reviewedSource(futureHolidayPackage),
    ];

    const third = await createRuleCatalogPublication({
      request: generationThreeRequest,
      sources: continuousSources,
      signer: testSigner,
      verifiedPreviousManifest: second.manifest,
    });

    expect(third.manifest.generation).toBe(3);
    expect(third.manifest.tracks).toContainEqual({
      packageId: "de-holidays",
      kind: "HOLIDAY",
      coverageFrom: "2026-01-01",
      coverageTo: null,
      coverage: "COMPLETE",
    });
    expect(
      third.manifest.packages
        .filter((descriptor) => descriptor.packageId === "de-holidays")
        .map((descriptor) => descriptor.versionId),
    ).toEqual(["2026", "2027"]);
  });

  it("allows an explicit verified rollback to restore narrower historical coverage", async () => {
    const historicalSources = [
      reviewedSource(tariffPackageFixture),
      reviewedSource(legalPackageFixture),
      reviewedSource(historicalHolidayPackage),
    ];
    const first = await createRuleCatalogPublication({
      request: request(historicalSources),
      sources: historicalSources,
      signer: testSigner,
    });
    const continuousSources = [
      reviewedSource(tariffPackageFixture),
      reviewedSource(legalPackageFixture),
      reviewedSource(historicalHolidayPackage),
      reviewedSource(futureHolidayPackage),
    ];
    const second = await createRuleCatalogPublication({
      request: request(continuousSources, {
        generation: 2,
        publishedAt: "2026-08-28T13:00:00Z",
      }),
      sources: continuousSources,
      signer: testSigner,
      verifiedPreviousManifest: first.manifest,
    });

    const rollback = await createRuleCatalogPublication({
      request: request(historicalSources, {
        generation: 3,
        publishedAt: "2026-08-28T14:00:00Z",
        rollbackOfGeneration: 1,
      }),
      sources: historicalSources,
      signer: testSigner,
      verifiedPreviousManifest: second.manifest,
      verifiedRollbackManifest: first.manifest,
    });

    expect(rollback.manifest.rollbackOfGeneration).toBe(1);
    expect(rollback.manifest.tracks).toEqual(first.manifest.tracks);
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

describe("signed catalog v2 selection", () => {
  function multiTariffSources() {
    return [
      ...sources(),
      reviewedSource({
        ...clone(tariffPackageFixture),
        packageId: "other-tariff",
      }),
    ];
  }

  function v2Request(
    packageSources: readonly RuleCatalogPublicationSource[],
    overrides: Partial<RuleCatalogPublicationRequest> = {},
  ) {
    return request(packageSources, {
      schemaVersion: 2,
      legacyTariffPackageId: tariffPackageFixture.packageId,
      ...overrides,
    });
  }

  it("publishes and verifies a deterministic signature binding the legacy selection", async () => {
    const packageSources = multiTariffSources();
    const publicationRequest = v2Request(packageSources);
    const publication = await createRuleCatalogPublication({
      request: publicationRequest,
      sources: packageSources,
      signer: testSigner,
    });
    const repeated = await createRuleCatalogPublication({
      request: publicationRequest,
      sources: [...packageSources].reverse(),
      signer: testSigner,
    });
    expect(publication.manifestJson).toBe(repeated.manifestJson);
    expect(publication.manifest).toMatchObject({
      schemaVersion: 2,
      legacyTariffPackageId: tariffPackageFixture.packageId,
    });
    const policy = {
      expectedChannel: "PREVIEW" as const,
      supportedEngineContractVersions: new Set([1]),
      trustedPublicKeys: new Map([["preview-test-2026", publicKey]]),
    };
    expect(
      isVerifiedRuleCatalogArtifacts(
        await verifyRuleCatalogArtifacts(publication, policy, testCryptography),
      ),
    ).toBe(true);
    const tampered = clone(publication.manifest);
    tampered.legacyTariffPackageId = "other-tariff";
    await expect(
      verifyRuleCatalogArtifacts(
        { manifestJson: JSON.stringify(tampered), packageJson: publication.packageJson },
        policy,
        testCryptography,
      ),
    ).rejects.toMatchObject({ code: "INVALID_SIGNATURE" });
    const idempotent = await createRuleCatalogPublication({
      request: publicationRequest,
      sources: packageSources,
      signer: testSigner,
      verifiedPreviousManifest: publication.manifest,
    });
    expect(idempotent.manifestJson).toBe(publication.manifestJson);
  });

  it("migrates v1 to v2 while preserving the existing profiles tariff", async () => {
    const legacySources = sources();
    const first = await createRuleCatalogPublication({
      request: request(legacySources),
      sources: legacySources,
      signer: testSigner,
    });
    const packageSources = multiTariffSources();
    const next = await createRuleCatalogPublication({
      request: v2Request(packageSources, { generation: 2, publishedAt: "2026-08-28T13:00:00Z" }),
      sources: packageSources,
      signer: testSigner,
      verifiedPreviousManifest: first.manifest,
    });
    expect(next.manifest.schemaVersion).toBe(2);
    expect(next.manifest.legacyTariffPackageId).toBe(tariffPackageFixture.packageId);
    await expectPublicationError(
      createRuleCatalogPublication({
        request: v2Request(packageSources, {
          generation: 3,
          publishedAt: "2026-08-28T14:00:00Z",
          legacyTariffPackageId: "other-tariff",
        }),
        sources: packageSources,
        signer: testSigner,
        verifiedPreviousManifest: next.manifest,
      }),
      "LEGACY_TARIFF_REASSIGNMENT",
    );
  });

  it("binds rollback selection and schema to the exact verified target", async () => {
    const packageSources = multiTariffSources();
    const first = await createRuleCatalogPublication({
      request: v2Request(packageSources),
      sources: packageSources,
      signer: testSigner,
    });
    const second = await createRuleCatalogPublication({
      request: v2Request(packageSources, { generation: 2, publishedAt: "2026-08-28T13:00:00Z" }),
      sources: packageSources,
      signer: testSigner,
      verifiedPreviousManifest: first.manifest,
    });
    const rollbackRequest = v2Request(packageSources, {
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
    expect(rollback.manifest.legacyTariffPackageId).toBe(first.manifest.legacyTariffPackageId);
    await expectPublicationError(
      createRuleCatalogPublication({
        request: { ...rollbackRequest, legacyTariffPackageId: "other-tariff" },
        sources: packageSources,
        signer: testSigner,
        verifiedPreviousManifest: second.manifest,
        verifiedRollbackManifest: first.manifest,
      }),
      "ROLLBACK_TARGET_MISMATCH",
    );

    const legacySources = sources();
    const legacy = await createRuleCatalogPublication({
      request: request(legacySources),
      sources: legacySources,
      signer: testSigner,
    });
    const upgraded = await createRuleCatalogPublication({
      request: v2Request(legacySources, { generation: 2, publishedAt: "2026-08-28T13:00:00Z" }),
      sources: legacySources,
      signer: testSigner,
      verifiedPreviousManifest: legacy.manifest,
    });
    await expectPublicationError(
      createRuleCatalogPublication({
        request: v2Request(legacySources, {
          generation: 3,
          publishedAt: "2026-08-28T14:00:00Z",
          rollbackOfGeneration: 1,
        }),
        sources: legacySources,
        signer: testSigner,
        verifiedPreviousManifest: upgraded.manifest,
        verifiedRollbackManifest: legacy.manifest,
      }),
      "ROLLBACK_TARGET_MISMATCH",
    );
  });
});

describe("original signed catalog acceptance", () => {
  it.each([
    ["synthetic selection", selectionCandidate()],
    ["TVöD-P draft selection", annualPaymentCandidate()],
  ] as const)(
    "publishes %s through the existing immutable signed pipeline",
    async (_label, fixture) => {
      // Test-only review and signing: the real on-disk draft stays unreviewed.
      const candidate = clone(fixture);
      candidate.review = clone(tariffPackageFixture.review) as typeof candidate.review;
      const packageSources = [reviewedSource(candidate), ...sources().slice(1)];
      const publication = await createRuleCatalogPublication({
        request: request(packageSources),
        sources: packageSources,
        signer: testSigner,
      });
      const verified = await verifyRuleCatalogArtifacts(
        { manifestJson: publication.manifestJson, packageJson: publication.packageJson },
        {
          expectedChannel: "PREVIEW",
          supportedEngineContractVersions: new Set(RULE_CATALOG_SUPPORTED_ENGINE_CONTRACT_VERSIONS),
          trustedPublicKeys: new Map([["preview-test-2026", publicKey]]),
          acceptsCatalog: isRuleCatalogRuntimeCompatible,
        },
        testCryptography,
      );
      expect(isVerifiedRuleCatalogArtifacts(verified)).toBe(true);
      const validation = validateRuleCatalog(
        publication.manifest,
        publication.packageJson.map((raw) => JSON.parse(raw)),
      );
      if (!validation.ok) throw new Error(JSON.stringify(validation.issues));
      const rule = requireResolvedPackage(
        createRuleResolverFromCatalog(validation.value).resolveTariff(
          "2026-09-01",
          candidate.packageId,
        ),
      );
      expect(resolveTariffSelection(rule, "BT_K", "OTHER")).toMatchObject({
        engineId: "tvoed-p-v3",
        capabilities: { annualPayment: "SUPPORTED" },
      });
      expect(rule.rules.selection).toEqual(candidate.rules.selection);
      expect(rule.status).toBe("PUBLISHED");
    },
  );

  it("publishes, verifies and resolves schema v2 tariff selection through the same signed contract", async () => {
    const otherTariff = { ...clone(tariffPackageFixture), packageId: "test-other-tariff" };
    const packageSources = [...sources(), reviewedSource(otherTariff)];
    const publicationRequest = request(packageSources, {
      schemaVersion: 2,
      legacyTariffPackageId: tariffPackageFixture.packageId,
    });
    const publication = await createRuleCatalogPublication({
      request: publicationRequest,
      sources: packageSources,
      signer: testSigner,
    });
    const policy = {
      expectedChannel: "PREVIEW" as const,
      supportedEngineContractVersions: new Set([1]),
      trustedPublicKeys: new Map([["preview-test-2026", publicKey]]),
      acceptsCatalog: isRuleCatalogRuntimeCompatible,
    };
    const verified = await verifyRuleCatalogArtifacts(
      { manifestJson: publication.manifestJson, packageJson: publication.packageJson },
      policy,
      testCryptography,
    );
    expect(isVerifiedRuleCatalogArtifacts(verified)).toBe(true);
    const validation = validateRuleCatalog(
      JSON.parse(publication.manifestJson),
      publication.packageJson.map((json) => JSON.parse(json)),
    );
    if (!validation.ok) throw new Error(JSON.stringify(validation.issues));
    const resolver = createRuleResolverFromCatalog(validation.value);
    expect(requireResolvedPackage(resolver.resolveTariff("2026-06-01")).packageId).toBe(
      tariffPackageFixture.packageId,
    );
    expect(
      requireResolvedPackage(resolver.resolveTariff("2026-06-01", otherTariff.packageId)).packageId,
    ).toBe(otherTariff.packageId);
    const tampered = { ...publication.manifest, legacyTariffPackageId: otherTariff.packageId };
    await expect(
      verifyRuleCatalogArtifacts(
        { manifestJson: JSON.stringify(tampered), packageJson: publication.packageJson },
        policy,
        testCryptography,
      ),
    ).rejects.toMatchObject({ code: "INVALID_SIGNATURE" });

    const second = await createRuleCatalogPublication({
      request: { ...publicationRequest, generation: 2, publishedAt: "2026-08-28T13:00:00Z" },
      sources: packageSources,
      signer: testSigner,
      verifiedPreviousManifest: publication.manifest,
    });
    await expectPublicationError(
      createRuleCatalogPublication({
        request: {
          ...publicationRequest,
          generation: 3,
          publishedAt: "2026-08-28T14:00:00Z",
          rollbackOfGeneration: 1,
          legacyTariffPackageId: otherTariff.packageId,
        },
        sources: packageSources,
        signer: testSigner,
        verifiedPreviousManifest: second.manifest,
        verifiedRollbackManifest: publication.manifest,
      }),
      "ROLLBACK_TARGET_MISMATCH",
    );
  });

  it("upgrades a v1 catalog without changing existing profiles and rejects a new legacy mapping", async () => {
    const oldSources = sources();
    const first = await createRuleCatalogPublication({
      request: request(oldSources),
      sources: oldSources,
      signer: testSigner,
    });
    const other = { ...clone(tariffPackageFixture), packageId: "test-other-tariff" };
    const packageSources = [...oldSources, reviewedSource(other)];
    const nextRequest = request(packageSources, {
      schemaVersion: 2,
      generation: 2,
      publishedAt: "2026-08-28T13:00:00Z",
      legacyTariffPackageId: tariffPackageFixture.packageId,
    });
    const next = await createRuleCatalogPublication({
      request: nextRequest,
      sources: packageSources,
      signer: testSigner,
      verifiedPreviousManifest: first.manifest,
    });
    expect(next.manifest.schemaVersion).toBe(2);
    expect(next.manifest.legacyTariffPackageId).toBe(tariffPackageFixture.packageId);
    await expectPublicationError(
      createRuleCatalogPublication({
        request: { ...nextRequest, legacyTariffPackageId: other.packageId },
        sources: packageSources,
        signer: testSigner,
        verifiedPreviousManifest: first.manifest,
      }),
      "LEGACY_TARIFF_REASSIGNMENT",
    );
    await expectPublicationError(
      createRuleCatalogPublication({
        request: request(packageSources),
        sources: packageSources,
        signer: testSigner,
      }),
      "INVALID_CATALOG",
    );
  });
});
