import type { SQLiteDatabase } from "expo-sqlite";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createRuleCatalogRuntimePort } from "@/composition/create-rule-catalog-runtime-port";
import {
  createRuleCatalogChannelConfig,
  type RuleCatalogChannelConfig,
} from "@/composition/rule-catalog-channel-config";
import { PREVIEW_RULE_CATALOG_TRUST } from "@/composition/rule-catalog-preview-trust";
import { PRODUCTION_RULE_CATALOG_TRUST } from "@/composition/rule-catalog-production-trust";
import { RULE_CATALOG_SUPPORTED_ENGINE_CONTRACT_VERSIONS } from "@/rules/rule-catalog-engine-support";
import type { ValidatedRuleCatalog } from "@/rules/validation";

const catalogMocks = vi.hoisted(() => ({
  loadActiveRuleCatalog: vi.fn(),
  activateRuleCatalog: vi.fn(),
}));
const diagnosticsMocks = vi.hoisted(() => ({ recordDiagnostic: vi.fn() }));
const httpMocks = vi.hoisted(() => ({ createRuleCatalogHttpClient: vi.fn() }));
const cryptoMocks = vi.hoisted(() => ({
  verifyRuleManifestOnDevice: vi.fn(),
  verifyRuleCatalogArtifactsOnDevice: vi.fn(),
}));
const stateMocks = vi.hoisted(() => ({
  claimRuleCatalogCheck: vi.fn(),
  completeRuleCatalogCheck: vi.fn(),
}));
const syncMocks = vi.hoisted(() => ({ synchronizeRuleCatalog: vi.fn() }));

vi.mock("expo-updates", () => ({ channel: null }));
vi.mock("@/infrastructure/database/rule-catalog-repository", () => catalogMocks);
vi.mock("@/infrastructure/diagnostics", () => diagnosticsMocks);
vi.mock("@/infrastructure/rule-catalog-http-client", () => httpMocks);
vi.mock("@/infrastructure/rule-catalog-cryptography", () => cryptoMocks);
vi.mock("@/infrastructure/database/rule-catalog-sync-state", () => stateMocks);
vi.mock("@/application/rule-catalog-sync", () => syncMocks);

function previewConfig(): RuleCatalogChannelConfig {
  return {
    catalogChannel: "PREVIEW",
    verificationPolicy: {
      expectedChannel: "PREVIEW",
      supportedEngineContractVersions: new Set(RULE_CATALOG_SUPPORTED_ENGINE_CONTRACT_VERSIONS),
      trustedPublicKeys: new Map([["preview-2026", new Uint8Array(32)]]),
    },
    remote: {
      baseUrl: "https://example.supabase.co/rules/preview",
      checkIntervalMilliseconds: 86_400_000,
      failureRetryMilliseconds: 3_600_000,
    },
    acceptsStoredCatalog: vi.fn(() => true),
  };
}

function catalog(channel: "PREVIEW" | "PRODUCTION", keyId: string): ValidatedRuleCatalog {
  return {
    manifest: {
      channel,
      signing: { keyId },
      tracks: [
        { kind: "TARIFF", packageId: "tariff" },
        { kind: "LEGAL", packageId: "legal" },
        { kind: "HOLIDAY", packageId: "holiday" },
      ],
    },
  } as unknown as ValidatedRuleCatalog;
}

describe("createRuleCatalogRuntimePort", () => {
  beforeEach(() => vi.clearAllMocks());

  it("loads only stored catalogs accepted by the active channel contract", async () => {
    const database = {} as SQLiteDatabase;
    catalogMocks.loadActiveRuleCatalog.mockResolvedValue(null);
    const config = createRuleCatalogChannelConfig("preview");
    const port = createRuleCatalogRuntimePort(database, { config });
    const error = new Error("catalog unavailable");

    await expect(port.loadStoredCatalog()).resolves.toBeNull();
    port.recordDiagnostic("RULE_CATALOG_LOAD_FAILED", error);

    expect(catalogMocks.loadActiveRuleCatalog).toHaveBeenCalledWith(database, expect.any(Function));
    const acceptsCatalog = catalogMocks.loadActiveRuleCatalog.mock.calls[0][1];
    expect(acceptsCatalog(catalog("PREVIEW", "preview-2026"))).toBe(true);
    expect(acceptsCatalog(catalog("PREVIEW", "preview-unknown"))).toBe(false);
    expect(acceptsCatalog(catalog("PRODUCTION", "preview-2026"))).toBe(false);
    expect(diagnosticsMocks.recordDiagnostic).toHaveBeenCalledWith(
      "rule-catalog",
      "RULE_CATALOG_LOAD_FAILED",
      error,
    );
  });

  it("distributes Production trust while keeping its remote and stored catalog disabled", async () => {
    const config = createRuleCatalogChannelConfig("production");
    const port = createRuleCatalogRuntimePort({} as SQLiteDatabase, { config });

    await expect(port.synchronizeCatalog(null)).resolves.toEqual({ status: "DISABLED" });
    await expect(port.synchronizeCatalog(null, { force: true })).resolves.toEqual({
      status: "DISABLED",
    });
    expect(config.catalogChannel).toBe("PRODUCTION");
    expect(config.verificationPolicy?.expectedChannel).toBe("PRODUCTION");
    expect(config.remote).toBeNull();
    expect(config.acceptsStoredCatalog(catalog("PREVIEW", "preview-2026"))).toBe(false);
    expect(config.acceptsStoredCatalog(catalog("PRODUCTION", "production-2026-r1"))).toBe(false);
    expect(httpMocks.createRuleCatalogHttpClient).not.toHaveBeenCalled();
    expect(stateMocks.claimRuleCatalogCheck).not.toHaveBeenCalled();
    expect(stateMocks.completeRuleCatalogCheck).not.toHaveBeenCalled();
    expect(cryptoMocks.verifyRuleManifestOnDevice).not.toHaveBeenCalled();
    expect(cryptoMocks.verifyRuleCatalogArtifactsOnDevice).not.toHaveBeenCalled();
    expect(catalogMocks.activateRuleCatalog).not.toHaveBeenCalled();
    expect(syncMocks.synchronizeRuleCatalog).not.toHaveBeenCalled();
  });

  it("keeps unknown update channels without trust or network access", async () => {
    for (const config of [
      createRuleCatalogChannelConfig("e2e-test"),
      createRuleCatalogChannelConfig(null),
    ]) {
      const port = createRuleCatalogRuntimePort({} as SQLiteDatabase, { config });

      await expect(port.synchronizeCatalog(null)).resolves.toEqual({ status: "DISABLED" });
      await expect(port.synchronizeCatalog(null, { force: true })).resolves.toEqual({
        status: "DISABLED",
      });
      expect(config.verificationPolicy).toBeNull();
      expect(config.acceptsStoredCatalog(catalog("PREVIEW", "preview-2026"))).toBe(false);
      expect(config.acceptsStoredCatalog(catalog("PRODUCTION", "production-2026-r1"))).toBe(false);
    }
    expect(httpMocks.createRuleCatalogHttpClient).not.toHaveBeenCalled();
    expect(syncMocks.synchronizeRuleCatalog).not.toHaveBeenCalled();
  });

  it("fails closed before constructing an HTTP client when remote trust is missing", async () => {
    const config: RuleCatalogChannelConfig = {
      catalogChannel: "PRODUCTION",
      verificationPolicy: null,
      remote: {
        baseUrl: "https://example.supabase.co/rules/production",
        checkIntervalMilliseconds: 86_400_000,
        failureRetryMilliseconds: 3_600_000,
      },
      acceptsStoredCatalog: () => false,
    };
    const port = createRuleCatalogRuntimePort({} as SQLiteDatabase, { config });

    await expect(port.synchronizeCatalog(null, { force: true })).resolves.toEqual({
      status: "DISABLED",
    });
    expect(httpMocks.createRuleCatalogHttpClient).not.toHaveBeenCalled();
    expect(syncMocks.synchronizeRuleCatalog).not.toHaveBeenCalled();
  });

  it("wires Preview download, trust, channel scheduling, and verified activation", async () => {
    const database = {} as SQLiteDatabase;
    const remote = {
      fetchCurrentManifest: vi.fn(),
      fetchVersionedManifest: vi.fn(),
      fetchPackage: vi.fn(),
    };
    const currentTime = new Date("2026-08-29T10:00:00.000Z");
    const fetchImplementation = vi.fn() as unknown as typeof fetch;
    httpMocks.createRuleCatalogHttpClient.mockReturnValue(remote);
    syncMocks.synchronizeRuleCatalog.mockResolvedValue({
      status: "UP_TO_DATE",
      generation: 1,
    });
    const config = previewConfig();
    const remoteConfig = config.remote!;
    const verificationPolicy = config.verificationPolicy!;
    const port = createRuleCatalogRuntimePort(database, {
      config,
      fetchImplementation,
      now: () => currentTime,
    });

    await expect(port.synchronizeCatalog(1)).resolves.toEqual({
      status: "UP_TO_DATE",
      generation: 1,
    });
    expect(httpMocks.createRuleCatalogHttpClient).toHaveBeenCalledWith({
      baseUrl: remoteConfig.baseUrl,
      fetchImplementation,
    });
    expect(syncMocks.synchronizeRuleCatalog).toHaveBeenCalledWith(
      1,
      expect.objectContaining({ remote }),
    );

    const dependencies = syncMocks.synchronizeRuleCatalog.mock.calls[0][1];
    await dependencies.claimCheck();
    await dependencies.completeCheck(1);
    await dependencies.verifyManifest("manifest");
    await dependencies.verifyArtifacts({ manifestJson: "manifest", packageJson: [] });
    await dependencies.activate({});

    expect(stateMocks.claimRuleCatalogCheck).toHaveBeenCalledWith(
      database,
      "PREVIEW",
      currentTime,
      remoteConfig.failureRetryMilliseconds,
    );
    expect(stateMocks.completeRuleCatalogCheck).toHaveBeenCalledWith(
      database,
      "PREVIEW",
      1,
      currentTime,
      remoteConfig.checkIntervalMilliseconds,
    );
    expect(cryptoMocks.verifyRuleManifestOnDevice).toHaveBeenCalledWith(
      "manifest",
      verificationPolicy,
    );
    expect(cryptoMocks.verifyRuleCatalogArtifactsOnDevice).toHaveBeenCalledWith(
      { manifestJson: "manifest", packageJson: [] },
      verificationPolicy,
    );
    expect(catalogMocks.activateRuleCatalog).toHaveBeenCalledWith(database, {});

    await port.synchronizeCatalog(1, { force: true });
    const forcedDependencies = syncMocks.synchronizeRuleCatalog.mock.calls[1][1];
    await forcedDependencies.claimCheck();
    expect(stateMocks.claimRuleCatalogCheck).toHaveBeenLastCalledWith(
      database,
      "PREVIEW",
      currentTime,
      remoteConfig.failureRetryMilliseconds,
      true,
    );
  });

  it("pins isolated Preview and Production trust while leaving Production networking disabled", () => {
    const preview = createRuleCatalogChannelConfig("preview");
    const production = createRuleCatalogChannelConfig("production");
    const disabled = createRuleCatalogChannelConfig();
    const previewRemote = preview.remote!;
    const previewPolicy = preview.verificationPolicy!;
    const productionPolicy = production.verificationPolicy!;

    expect(Object.isFrozen(PREVIEW_RULE_CATALOG_TRUST)).toBe(true);
    expect(Object.isFrozen(PREVIEW_RULE_CATALOG_TRUST.trustedPublicKeys)).toBe(true);
    expect(Object.isFrozen(PRODUCTION_RULE_CATALOG_TRUST)).toBe(true);
    expect(Object.isFrozen(PRODUCTION_RULE_CATALOG_TRUST.trustedPublicKeys)).toBe(true);
    expect(Object.isFrozen(RULE_CATALOG_SUPPORTED_ENGINE_CONTRACT_VERSIONS)).toBe(true);
    expect(preview.catalogChannel).toBe("PREVIEW");
    expect(previewPolicy.expectedChannel).toBe("PREVIEW");
    expect(production.catalogChannel).toBe("PRODUCTION");
    expect(productionPolicy.expectedChannel).toBe("PRODUCTION");
    expect(production.remote).toBeNull();
    expect(disabled.catalogChannel).toBeNull();
    expect(disabled.verificationPolicy).toBeNull();
    expect(disabled.remote).toBeNull();
    expect(previewRemote.baseUrl).toBe(PREVIEW_RULE_CATALOG_TRUST.baseUrl);
    expect([...previewPolicy.supportedEngineContractVersions]).toEqual([
      ...RULE_CATALOG_SUPPORTED_ENGINE_CONTRACT_VERSIONS,
    ]);
    expect(Array.from(previewPolicy.trustedPublicKeys.get("preview-2026") ?? [])).toEqual([
      23, 51, 245, 81, 88, 150, 83, 204, 65, 85, 65, 47, 145, 96, 44, 208, 182, 0, 112, 233, 156,
      127, 221, 227, 56, 215, 81, 71, 154, 146, 246, 59,
    ]);
    expect(Array.from(previewPolicy.trustedPublicKeys.get("preview-2026-r2") ?? [])).toEqual([
      193, 247, 8, 29, 120, 239, 53, 58, 10, 15, 59, 154, 26, 48, 218, 192, 203, 148, 12, 50, 39,
      145, 254, 254, 42, 217, 3, 200, 244, 244, 240, 17,
    ]);
    expect(Array.from(previewPolicy.trustedPublicKeys.get("preview-2026-r3") ?? [])).toEqual([
      192, 246, 25, 13, 196, 21, 140, 223, 56, 179, 155, 40, 135, 2, 163, 245, 53, 84, 97, 69, 203,
      237, 144, 212, 14, 174, 87, 39, 209, 101, 224, 193,
    ]);
    expect([...previewPolicy.trustedPublicKeys.keys()]).toEqual(
      PREVIEW_RULE_CATALOG_TRUST.trustedPublicKeys.map(({ keyId }) => keyId),
    );
    for (const { keyId, publicKey } of PREVIEW_RULE_CATALOG_TRUST.trustedPublicKeys) {
      expect(Array.from(previewPolicy.trustedPublicKeys.get(keyId) ?? [])).toEqual(publicKey);
      expect(Object.isFrozen(publicKey)).toBe(true);
    }
    expect([...productionPolicy.supportedEngineContractVersions]).toEqual([
      ...RULE_CATALOG_SUPPORTED_ENGINE_CONTRACT_VERSIONS,
    ]);
    expect([...productionPolicy.trustedPublicKeys.keys()]).toEqual(["production-2026-r1"]);
    expect(Array.from(productionPolicy.trustedPublicKeys.get("production-2026-r1") ?? [])).toEqual([
      252, 52, 185, 146, 151, 39, 236, 107, 191, 75, 232, 174, 195, 38, 41, 86, 68, 225, 76, 94,
      115, 255, 228, 149, 243, 240, 38, 110, 80, 136, 225, 161,
    ]);
    expect(
      PREVIEW_RULE_CATALOG_TRUST.trustedPublicKeys.some(({ publicKey }) =>
        publicKey.every(
          (value, index) =>
            value === PRODUCTION_RULE_CATALOG_TRUST.trustedPublicKeys[0]?.publicKey[index],
        ),
      ),
    ).toBe(false);
    expect(Object.keys(PRODUCTION_RULE_CATALOG_TRUST).sort()).toEqual([
      "channel",
      "trustedPublicKeys",
    ]);
  });
});
