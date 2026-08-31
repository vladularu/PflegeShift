import type { SQLiteDatabase } from "expo-sqlite";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createRuleCatalogRuntimePort } from "@/composition/create-rule-catalog-runtime-port";
import {
  createPreviewRuleCatalogConfig,
  type PreviewRuleCatalogConfig,
} from "@/composition/rule-catalog-preview-config";

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
  claimPreviewRuleCatalogCheck: vi.fn(),
  completePreviewRuleCatalogCheck: vi.fn(),
}));
const syncMocks = vi.hoisted(() => ({ synchronizePreviewRuleCatalog: vi.fn() }));

vi.mock("expo-updates", () => ({ channel: null }));
vi.mock("@/infrastructure/database/rule-catalog-repository", () => catalogMocks);
vi.mock("@/infrastructure/diagnostics", () => diagnosticsMocks);
vi.mock("@/infrastructure/rule-catalog-http-client", () => httpMocks);
vi.mock("@/infrastructure/rule-catalog-cryptography", () => cryptoMocks);
vi.mock("@/infrastructure/database/rule-catalog-sync-state", () => stateMocks);
vi.mock("@/application/rule-catalog-sync", () => syncMocks);

function config(enabled: boolean): PreviewRuleCatalogConfig {
  return {
    enabled,
    baseUrl: "https://example.supabase.co/rules/preview",
    verificationPolicy: {
      expectedChannel: "PREVIEW",
      supportedEngineContractVersions: new Set([1, 2, 3, 4, 5, 6, 7]),
      trustedPublicKeys: new Map([["preview-2026", new Uint8Array(32)]]),
    },
    checkIntervalMilliseconds: 86_400_000,
    failureRetryMilliseconds: 3_600_000,
  };
}

describe("createRuleCatalogRuntimePort", () => {
  beforeEach(() => vi.clearAllMocks());

  it("binds compatible catalog loading and scoped diagnostics to the active database", async () => {
    const database = {} as SQLiteDatabase;
    catalogMocks.loadActiveRuleCatalog.mockResolvedValue(null);
    const port = createRuleCatalogRuntimePort(database, { config: config(false) });
    const error = new Error("catalog unavailable");

    await expect(port.loadStoredCatalog()).resolves.toBeNull();
    port.recordDiagnostic("RULE_CATALOG_LOAD_FAILED", error);

    expect(catalogMocks.loadActiveRuleCatalog).toHaveBeenCalledWith(database, expect.any(Function));
    expect(diagnosticsMocks.recordDiagnostic).toHaveBeenCalledWith(
      "rule-catalog",
      "RULE_CATALOG_LOAD_FAILED",
      error,
    );
  });

  it("keeps network synchronization explicitly disabled outside the internal build", async () => {
    const port = createRuleCatalogRuntimePort({} as SQLiteDatabase, { config: config(false) });

    await expect(port.synchronizeCatalog(null)).resolves.toEqual({ status: "DISABLED" });
    await expect(port.synchronizeCatalog(null, { force: true })).resolves.toEqual({
      status: "DISABLED",
    });
    expect(httpMocks.createRuleCatalogHttpClient).not.toHaveBeenCalled();
    expect(syncMocks.synchronizePreviewRuleCatalog).not.toHaveBeenCalled();
  });

  it("wires preview download, trust, scheduling, and verified activation", async () => {
    const database = {} as SQLiteDatabase;
    const remote = {
      fetchCurrentManifest: vi.fn(),
      fetchVersionedManifest: vi.fn(),
      fetchPackage: vi.fn(),
    };
    const currentTime = new Date("2026-08-29T10:00:00.000Z");
    const fetchImplementation = vi.fn() as unknown as typeof fetch;
    httpMocks.createRuleCatalogHttpClient.mockReturnValue(remote);
    syncMocks.synchronizePreviewRuleCatalog.mockResolvedValue({
      status: "UP_TO_DATE",
      generation: 1,
    });
    const previewConfig = config(true);
    const port = createRuleCatalogRuntimePort(database, {
      config: previewConfig,
      fetchImplementation,
      now: () => currentTime,
    });

    await expect(port.synchronizeCatalog(1)).resolves.toEqual({
      status: "UP_TO_DATE",
      generation: 1,
    });
    expect(httpMocks.createRuleCatalogHttpClient).toHaveBeenCalledWith({
      baseUrl: previewConfig.baseUrl,
      fetchImplementation,
    });
    expect(syncMocks.synchronizePreviewRuleCatalog).toHaveBeenCalledWith(
      1,
      expect.objectContaining({ remote }),
    );

    const dependencies = syncMocks.synchronizePreviewRuleCatalog.mock.calls[0][1];
    await dependencies.claimCheck();
    await dependencies.completeCheck(1);
    await dependencies.verifyManifest("manifest");
    await dependencies.verifyArtifacts({ manifestJson: "manifest", packageJson: [] });
    await dependencies.activate({});

    expect(stateMocks.claimPreviewRuleCatalogCheck).toHaveBeenCalledWith(
      database,
      currentTime,
      previewConfig.failureRetryMilliseconds,
    );
    expect(stateMocks.completePreviewRuleCatalogCheck).toHaveBeenCalledWith(
      database,
      1,
      currentTime,
      previewConfig.checkIntervalMilliseconds,
    );
    expect(cryptoMocks.verifyRuleManifestOnDevice).toHaveBeenCalledWith(
      "manifest",
      previewConfig.verificationPolicy,
    );
    expect(cryptoMocks.verifyRuleCatalogArtifactsOnDevice).toHaveBeenCalledWith(
      { manifestJson: "manifest", packageJson: [] },
      previewConfig.verificationPolicy,
    );
    expect(catalogMocks.activateRuleCatalog).toHaveBeenCalledWith(database, {});

    await port.synchronizeCatalog(1, { force: true });
    const forcedDependencies = syncMocks.synchronizePreviewRuleCatalog.mock.calls[1][1];
    await forcedDependencies.claimCheck();
    expect(stateMocks.claimPreviewRuleCatalogCheck).toHaveBeenLastCalledWith(
      database,
      currentTime,
      previewConfig.failureRetryMilliseconds,
      true,
    );
  });

  it("pins the public Generation-1 key and contracts only in PREVIEW configuration", () => {
    const preview = createPreviewRuleCatalogConfig("preview");
    const production = createPreviewRuleCatalogConfig("production");

    expect(preview.enabled).toBe(true);
    expect(production.enabled).toBe(false);
    expect(createPreviewRuleCatalogConfig().enabled).toBe(false);
    expect(preview.baseUrl).toBe(
      "https://okcxmmekwyuuiqthmydo.supabase.co/storage/v1/object/public/rule-catalog/preview",
    );
    expect([...preview.verificationPolicy.supportedEngineContractVersions]).toEqual([
      1, 2, 3, 4, 5, 6, 7,
    ]);
    expect(
      Array.from(preview.verificationPolicy.trustedPublicKeys.get("preview-2026") ?? []),
    ).toEqual([
      23, 51, 245, 81, 88, 150, 83, 204, 65, 85, 65, 47, 145, 96, 44, 208, 182, 0, 112, 233, 156,
      127, 221, 227, 56, 215, 81, 71, 154, 146, 246, 59,
    ]);
    expect(
      Array.from(preview.verificationPolicy.trustedPublicKeys.get("preview-2026-r2") ?? []),
    ).toEqual([
      193, 247, 8, 29, 120, 239, 53, 58, 10, 15, 59, 154, 26, 48, 218, 192, 203, 148, 12, 50, 39,
      145, 254, 254, 42, 217, 3, 200, 244, 244, 240, 17,
    ]);
    expect([...preview.verificationPolicy.trustedPublicKeys.keys()]).toEqual([
      "preview-2026",
      "preview-2026-r2",
    ]);
  });
});
