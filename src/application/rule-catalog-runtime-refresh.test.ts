import { describe, expect, it, vi } from "vitest";

import holidayPackageFixture from "../../rules/examples/holiday-package.valid.json";
import legalPackageFixture from "../../rules/examples/legal-package.valid.json";
import manifestFixture from "../../rules/examples/manifest.valid.json";
import tariffPackageFixture from "../../rules/examples/tariff-package.valid.json";
import {
  legacyRuleCatalogRuntime,
  storedRuleCatalogRuntime,
  type StoredRuleCatalogSnapshot,
} from "@/application/rule-catalog-runtime";
import {
  reconcileRuleCatalogRuntimeAfterSync,
  RuleCatalogRuntimeRefreshError,
} from "@/application/rule-catalog-runtime-refresh";
import { validateRuleCatalog } from "@/rules/validation";

function storedCatalog(
  generation: number,
  activeGeneration = generation,
): StoredRuleCatalogSnapshot {
  const validation = validateRuleCatalog({ ...manifestFixture, generation }, [
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

describe("rule catalog runtime refresh", () => {
  it("does not reload for disabled, throttled, or already selected synchronization results", async () => {
    const current = storedRuleCatalogRuntime(storedCatalog(1));
    const loadStoredCatalog = vi.fn();

    await expect(
      reconcileRuleCatalogRuntimeAfterSync(current, { status: "DISABLED" }, loadStoredCatalog),
    ).resolves.toEqual({ status: "UNCHANGED", runtime: current, refreshError: null });
    await expect(
      reconcileRuleCatalogRuntimeAfterSync(current, { status: "THROTTLED" }, loadStoredCatalog),
    ).resolves.toEqual({ status: "UNCHANGED", runtime: current, refreshError: null });
    await expect(
      reconcileRuleCatalogRuntimeAfterSync(
        current,
        { status: "UP_TO_DATE", generation: 1 },
        loadStoredCatalog,
      ),
    ).resolves.toEqual({ status: "UNCHANGED", runtime: current, refreshError: null });

    expect(loadStoredCatalog).not.toHaveBeenCalled();
  });

  it("atomically replaces the legacy runtime after a newly activated generation is loaded", async () => {
    const current = legacyRuleCatalogRuntime("NO_STORED_CATALOG");
    const next = storedCatalog(2);

    const result = await reconcileRuleCatalogRuntimeAfterSync(
      current,
      { status: "ACTIVATED", generation: 2, previousGeneration: null },
      async () => next,
    );

    expect(result.status).toBe("REPLACED");
    expect(result.refreshError).toBeNull();
    expect(result.runtime).not.toBe(current);
    expect(result.runtime.resolver).not.toBe(current.resolver);
    expect(result.runtime.diagnosis).toMatchObject({
      source: "STORED",
      activeGeneration: 2,
      selectedGeneration: 2,
      fallbackReason: null,
    });
  });

  it("repairs a stale last-known-good runtime when the active remote generation is up to date", async () => {
    const current = storedRuleCatalogRuntime(storedCatalog(1, 2));

    const result = await reconcileRuleCatalogRuntimeAfterSync(
      current,
      { status: "UP_TO_DATE", generation: 2 },
      async () => storedCatalog(2),
    );

    expect(result.status).toBe("REPLACED");
    expect(result.runtime.diagnosis).toMatchObject({
      activeGeneration: 2,
      selectedGeneration: 2,
      fallbackReason: null,
    });
  });

  it("keeps the mounted runtime when the post-activation catalog load fails", async () => {
    const current = legacyRuleCatalogRuntime("NO_STORED_CATALOG");
    const loadError = Object.assign(new Error("catalog unavailable"), { activeGeneration: 2 });

    const result = await reconcileRuleCatalogRuntimeAfterSync(
      current,
      { status: "ACTIVATED", generation: 2, previousGeneration: null },
      async () => {
        throw loadError;
      },
    );

    expect(result).toEqual({ status: "FAILED", runtime: current, refreshError: loadError });
  });

  it("rejects a recovered older generation instead of publishing a mixed runtime", async () => {
    const current = legacyRuleCatalogRuntime("NO_STORED_CATALOG");

    const result = await reconcileRuleCatalogRuntimeAfterSync(
      current,
      { status: "ALREADY_ACTIVE", generation: 2 },
      async () => storedCatalog(1, 2),
    );

    expect(result.status).toBe("FAILED");
    expect(result.runtime).toBe(current);
    expect(result.refreshError).toBeInstanceOf(RuleCatalogRuntimeRefreshError);
    expect(result.refreshError).toMatchObject({
      code: "SYNCHRONIZED_GENERATION_NOT_SELECTED",
      expectedGeneration: 2,
    });
  });
});
