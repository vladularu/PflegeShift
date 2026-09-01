import { describe, expect, it, vi } from "vitest";

import {
  RuleCatalogSyncError,
  synchronizeRuleCatalog,
  type RuleCatalogSyncDependencies,
} from "@/application/rule-catalog-sync";
import type { RuleManifest } from "@/rules/contracts.generated";
import type { VerifiedRuleCatalogArtifacts } from "@/rules/rule-catalog-verification";

const manifest = {
  generation: 2,
  packages: [
    { path: "packages/tariff/2.json" },
    { path: "packages/legal/2.json" },
    { path: "packages/holidays/2.json" },
  ],
} as unknown as RuleManifest;
const verified = {
  manifestJson: "manifest",
  packageJson: [],
} as unknown as VerifiedRuleCatalogArtifacts;

function dependencies(overrides: Partial<RuleCatalogSyncDependencies> = {}) {
  const value: RuleCatalogSyncDependencies = {
    remote: {
      fetchCurrentManifest: vi.fn().mockResolvedValue("manifest"),
      fetchVersionedManifest: vi.fn().mockResolvedValue("manifest"),
      fetchPackage: vi.fn(async (path: string) => `contents:${path}`),
    },
    claimCheck: vi.fn().mockResolvedValue(true),
    completeCheck: vi.fn().mockResolvedValue(undefined),
    verifyManifest: vi.fn().mockResolvedValue(manifest),
    verifyArtifacts: vi.fn().mockResolvedValue(verified),
    activate: vi.fn().mockResolvedValue({
      status: "ACTIVATED",
      generation: 2,
      previousGeneration: 1,
    }),
    ...overrides,
  };
  return value;
}

describe("rule catalog synchronization", () => {
  it("downloads signed package paths in manifest order, verifies, and activates atomically", async () => {
    const ports = dependencies();

    await expect(synchronizeRuleCatalog(1, ports)).resolves.toEqual({
      status: "ACTIVATED",
      generation: 2,
      previousGeneration: 1,
    });

    expect(ports.remote.fetchPackage).toHaveBeenCalledTimes(3);
    expect(ports.remote.fetchPackage).toHaveBeenNthCalledWith(1, "packages/tariff/2.json");
    expect(ports.remote.fetchPackage).toHaveBeenNthCalledWith(2, "packages/legal/2.json");
    expect(ports.remote.fetchPackage).toHaveBeenNthCalledWith(3, "packages/holidays/2.json");
    expect(ports.verifyArtifacts).toHaveBeenCalledWith({
      manifestJson: "manifest",
      packageJson: [
        "contents:packages/tariff/2.json",
        "contents:packages/legal/2.json",
        "contents:packages/holidays/2.json",
      ],
    });
    expect(ports.activate).toHaveBeenCalledWith(verified);
    expect(ports.completeCheck).toHaveBeenCalledWith(2);
  });

  it("does no network work while the persistent check gate is closed", async () => {
    const ports = dependencies({ claimCheck: vi.fn().mockResolvedValue(false) });

    await expect(synchronizeRuleCatalog(null, ports)).resolves.toEqual({
      status: "THROTTLED",
    });
    expect(ports.remote.fetchCurrentManifest).not.toHaveBeenCalled();
  });

  it("verifies current against its immutable manifest and skips packages when up to date", async () => {
    const ports = dependencies();

    await expect(synchronizeRuleCatalog(2, ports)).resolves.toEqual({
      status: "UP_TO_DATE",
      generation: 2,
    });
    expect(ports.remote.fetchVersionedManifest).toHaveBeenCalledWith(2);
    expect(ports.remote.fetchPackage).not.toHaveBeenCalled();
    expect(ports.verifyArtifacts).not.toHaveBeenCalled();
    expect(ports.activate).not.toHaveBeenCalled();
    expect(ports.completeCheck).toHaveBeenCalledWith(2);
  });

  it("rejects a mismatching immutable manifest before package download", async () => {
    const ports = dependencies({
      remote: {
        fetchCurrentManifest: vi.fn().mockResolvedValue("manifest"),
        fetchVersionedManifest: vi.fn().mockResolvedValue("different"),
        fetchPackage: vi.fn(),
      },
    });

    await expect(synchronizeRuleCatalog(null, ports)).rejects.toMatchObject({
      name: "RuleCatalogSyncError",
      code: "VERSIONED_MANIFEST_MISMATCH",
    });
    expect(ports.remote.fetchPackage).not.toHaveBeenCalled();
    expect(ports.activate).not.toHaveBeenCalled();
  });

  it("rejects remote rollback before package download", async () => {
    const ports = dependencies();

    await expect(synchronizeRuleCatalog(3, ports)).rejects.toBeInstanceOf(RuleCatalogSyncError);
    await expect(synchronizeRuleCatalog(3, dependencies())).rejects.toMatchObject({
      code: "REMOTE_GENERATION_ROLLBACK",
    });
    expect(ports.remote.fetchPackage).not.toHaveBeenCalled();
    expect(ports.activate).not.toHaveBeenCalled();
  });

  it("never activates when artifact verification fails", async () => {
    const verificationError = new Error("invalid signature");
    const ports = dependencies({
      verifyArtifacts: vi.fn().mockRejectedValue(verificationError),
    });

    await expect(synchronizeRuleCatalog(null, ports)).rejects.toBe(verificationError);
    expect(ports.activate).not.toHaveBeenCalled();
    expect(ports.completeCheck).not.toHaveBeenCalled();
  });
});
