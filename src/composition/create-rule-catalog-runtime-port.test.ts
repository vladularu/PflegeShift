import type { SQLiteDatabase } from "expo-sqlite";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createRuleCatalogRuntimePort } from "@/composition/create-rule-catalog-runtime-port";

const catalogMocks = vi.hoisted(() => ({ loadActiveRuleCatalog: vi.fn() }));
const diagnosticsMocks = vi.hoisted(() => ({ recordDiagnostic: vi.fn() }));

vi.mock("@/infrastructure/database/rule-catalog-repository", () => catalogMocks);
vi.mock("@/infrastructure/diagnostics", () => diagnosticsMocks);

describe("createRuleCatalogRuntimePort", () => {
  beforeEach(() => vi.clearAllMocks());

  it("binds compatible catalog loading and scoped diagnostics to the active database", async () => {
    const database = {} as SQLiteDatabase;
    catalogMocks.loadActiveRuleCatalog.mockResolvedValue(null);
    const port = createRuleCatalogRuntimePort(database);
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
});
