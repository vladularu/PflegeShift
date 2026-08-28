import { describe, expect, it, vi } from "vitest";

import holidayPackageFixture from "../../rules/examples/holiday-package.valid.json";
import legalPackageFixture from "../../rules/examples/legal-package.valid.json";
import manifestFixture from "../../rules/examples/manifest.valid.json";
import tariffPackageFixture from "../../rules/examples/tariff-package.valid.json";
import {
  loadRuleCatalogRuntime,
  storedRuleCatalogRuntime,
  type StoredRuleCatalogSnapshot,
} from "@/application/rule-catalog-runtime";
import { bundledRuleResolver, requireResolvedPackage } from "@/rules/rule-resolver";
import { validateRuleCatalog } from "@/rules/validation";

function storedCatalog(generation = 1, activeGeneration = generation): StoredRuleCatalogSnapshot {
  const validation = validateRuleCatalog(manifestFixture, [
    tariffPackageFixture,
    legalPackageFixture,
    holidayPackageFixture,
  ]);
  if (!validation.ok) throw new Error("Expected the catalog fixture to be valid.");
  return {
    activeGeneration,
    generation,
    recoveredFromGeneration: activeGeneration === generation ? null : activeGeneration,
    catalog: validation.value,
  };
}

describe("rule catalog runtime", () => {
  it("uses the immutable legacy resolver when no catalog has been activated", async () => {
    const loadStoredCatalog = vi.fn().mockResolvedValue(null);

    const result = await loadRuleCatalogRuntime(loadStoredCatalog);

    expect(loadStoredCatalog).toHaveBeenCalledOnce();
    expect(result.loadError).toBeNull();
    expect(result.runtime.resolver).toBe(bundledRuleResolver);
    expect(result.runtime.diagnosis).toEqual({
      source: "LEGACY_EMBEDDED",
      activeGeneration: null,
      selectedGeneration: null,
      keyId: null,
      fallbackReason: "NO_STORED_CATALOG",
    });
  });

  it("creates one resolver snapshot from the selected stored generation", async () => {
    const stored = storedCatalog();
    const result = await loadRuleCatalogRuntime(async () => stored);

    expect(result.runtime.resolver).not.toBe(bundledRuleResolver);
    expect(result.runtime.diagnosis).toEqual({
      source: "STORED",
      activeGeneration: 1,
      selectedGeneration: 1,
      keyId: "preview-2026",
      fallbackReason: null,
    });
    expect(
      requireResolvedPackage(result.runtime.resolver.resolveTariff("2026-05-01")),
    ).toMatchObject({ packageId: "tvoed-vka-bt-k", versionId: "2026-05" });
  });

  it("reports the selected last-known-good generation without mixing snapshots", () => {
    const runtime = storedRuleCatalogRuntime(storedCatalog(1, 2));

    expect(runtime.diagnosis).toMatchObject({
      activeGeneration: 2,
      selectedGeneration: 1,
      fallbackReason: "ACTIVE_GENERATION_INVALID",
    });
    expect(Object.isFrozen(runtime)).toBe(true);
    expect(Object.isFrozen(runtime.diagnosis)).toBe(true);
  });

  it("falls back to legacy and retains the failed active generation in diagnostics", async () => {
    const error = Object.assign(new Error("catalog unavailable"), { activeGeneration: 7 });
    const result = await loadRuleCatalogRuntime(async () => {
      throw error;
    });

    expect(result.loadError).toBe(error);
    expect(result.runtime.resolver).toBe(bundledRuleResolver);
    expect(result.runtime.diagnosis).toEqual({
      source: "LEGACY_EMBEDDED",
      activeGeneration: 7,
      selectedGeneration: null,
      keyId: null,
      fallbackReason: "NO_VALID_STORED_CATALOG",
    });
  });

  it("retains the observed generation when snapshot construction itself fails closed", async () => {
    const stored = storedCatalog(1, 9);
    const incompatible = {
      ...stored,
      catalog: {
        ...stored.catalog,
        manifest: {
          ...stored.catalog.manifest,
          tracks: stored.catalog.manifest.tracks.filter((track) => track.kind !== "LEGAL"),
        },
      },
    } as StoredRuleCatalogSnapshot;

    const result = await loadRuleCatalogRuntime(async () => incompatible);

    expect(result.loadError).toBeInstanceOf(Error);
    expect(result.runtime.diagnosis).toMatchObject({
      source: "LEGACY_EMBEDDED",
      activeGeneration: 9,
      fallbackReason: "NO_VALID_STORED_CATALOG",
    });
  });
});
