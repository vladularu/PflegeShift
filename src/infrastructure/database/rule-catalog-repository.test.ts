import Database from "better-sqlite3";
import type { SQLiteDatabase } from "expo-sqlite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import holidayPackageFixture from "../../../rules/examples/holiday-package.valid.json";
import legalPackageFixture from "../../../rules/examples/legal-package.valid.json";
import manifestFixture from "../../../rules/examples/manifest.valid.json";
import tariffPackageFixture from "../../../rules/examples/tariff-package.valid.json";
import { migrateDatabase } from "@/infrastructure/database/migrations";
import {
  activateRuleCatalog,
  loadActiveRuleCatalog,
  RuleCatalogStorageError,
  type RuleCatalogArtifacts,
} from "@/infrastructure/database/rule-catalog-repository";

class TestDatabase {
  readonly database = new Database(":memory:");

  async execAsync(source: string): Promise<void> {
    this.database.exec(source);
  }

  async runAsync(source: string, ...params: unknown[]) {
    const result = this.database.prepare(source).run(...params);
    return {
      changes: result.changes,
      lastInsertRowId: Number(result.lastInsertRowid),
    };
  }

  async getFirstAsync<T>(source: string, ...params: unknown[]): Promise<T | null> {
    return (this.database.prepare(source).get(...params) as T | undefined) ?? null;
  }

  async getAllAsync<T>(source: string, ...params: unknown[]): Promise<T[]> {
    return this.database.prepare(source).all(...params) as T[];
  }
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

function catalogArtifacts(generation: number): RuleCatalogArtifacts {
  const manifest = clone(manifestFixture);
  manifest.generation = generation;
  manifest.publishedAt = `2026-04-${String(19 + generation).padStart(2, "0")}T12:00:00Z`;

  return {
    manifestJson: JSON.stringify(manifest),
    packageJson: [
      JSON.stringify(tariffPackageFixture),
      JSON.stringify(legalPackageFixture),
      JSON.stringify(holidayPackageFixture),
    ],
  };
}

async function expectStorageError(
  operation: Promise<unknown>,
  code: RuleCatalogStorageError["code"],
): Promise<RuleCatalogStorageError> {
  try {
    await operation;
  } catch (error) {
    expect(error).toBeInstanceOf(RuleCatalogStorageError);
    const storageError = error as RuleCatalogStorageError;
    expect(storageError.code).toBe(code);
    return storageError;
  }
  throw new Error(`Expected RuleCatalogStorageError ${code}.`);
}

describe("rule catalog repository", () => {
  let adapter: TestDatabase;
  let db: SQLiteDatabase;

  beforeEach(async () => {
    adapter = new TestDatabase();
    db = adapter as unknown as SQLiteDatabase;
    await migrateDatabase(db);
  });

  afterEach(() => adapter.database.close());

  it("returns no active catalog before the first activation", async () => {
    await expect(loadActiveRuleCatalog(db)).resolves.toBeNull();
  });

  it("stores and activates a complete published catalog atomically", async () => {
    const artifacts = catalogArtifacts(1);

    await expect(
      activateRuleCatalog(db, artifacts, new Date("2026-08-28T08:00:00.000Z")),
    ).resolves.toEqual({
      status: "ACTIVATED",
      generation: 1,
      previousGeneration: null,
    });

    const loaded = await loadActiveRuleCatalog(db);
    expect(loaded).toMatchObject({
      activeGeneration: 1,
      generation: 1,
      recoveredFromGeneration: null,
      catalog: { manifest: { generation: 1 } },
    });
    expect(loaded?.catalog.packages).toHaveLength(3);
    expect(
      adapter.database.prepare("SELECT COUNT(*) count FROM rule_catalog_packages").get(),
    ).toEqual({ count: 3 });
  });

  it("treats a byte-identical retry of the active generation as idempotent", async () => {
    const artifacts = catalogArtifacts(1);
    await activateRuleCatalog(db, artifacts, new Date("2026-08-28T08:00:00.000Z"));

    await expect(
      activateRuleCatalog(db, artifacts, new Date("2026-08-28T09:00:00.000Z")),
    ).resolves.toEqual({ status: "ALREADY_ACTIVE", generation: 1 });
    expect(
      adapter.database.prepare("SELECT COUNT(*) count FROM rule_catalog_generations").get(),
    ).toEqual({ count: 1 });
  });

  it("serializes concurrent activations on the already-keyed connection", async () => {
    const [first, second] = await Promise.all([
      activateRuleCatalog(db, catalogArtifacts(1), new Date("2026-08-28T08:00:00.000Z")),
      activateRuleCatalog(db, catalogArtifacts(2), new Date("2026-08-28T09:00:00.000Z")),
    ]);

    expect(first).toEqual({
      status: "ACTIVATED",
      generation: 1,
      previousGeneration: null,
    });
    expect(second).toEqual({
      status: "ACTIVATED",
      generation: 2,
      previousGeneration: 1,
    });
    expect((await loadActiveRuleCatalog(db))?.generation).toBe(2);
  });

  it("releases the activation queue after a failed transaction", async () => {
    adapter.database.exec(`
      CREATE TRIGGER reject_generation_one_package
      BEFORE INSERT ON rule_catalog_packages
      WHEN NEW.generation = 1
      BEGIN SELECT RAISE(ABORT, 'simulated first activation failure'); END;
    `);

    const [failed, succeeding] = await Promise.allSettled([
      activateRuleCatalog(db, catalogArtifacts(1)),
      activateRuleCatalog(db, catalogArtifacts(2)),
    ]);

    expect(failed).toMatchObject({
      status: "rejected",
      reason: { message: "simulated first activation failure" },
    });
    expect(succeeding).toEqual({
      status: "fulfilled",
      value: { status: "ACTIVATED", generation: 2, previousGeneration: null },
    });
    expect((await loadActiveRuleCatalog(db))?.generation).toBe(2);
  });

  it("rejects malformed, unpublished, and incompatible artifacts", async () => {
    await expectStorageError(
      activateRuleCatalog(db, { manifestJson: "{", packageJson: [] }),
      "INVALID_ARTIFACT_JSON",
    );

    const validArtifacts = catalogArtifacts(1);
    const unpublishedPackage = clone(tariffPackageFixture) as unknown as Record<string, unknown>;
    unpublishedPackage.status = "DRAFT";
    unpublishedPackage.review = {
      status: "DRAFT",
      reviewedBy: null,
      reviewedAt: null,
      gitCommit: null,
    };
    const unpublished: RuleCatalogArtifacts = {
      ...validArtifacts,
      packageJson: validArtifacts.packageJson.map((json, index) =>
        index === 0 ? JSON.stringify(unpublishedPackage) : json,
      ),
    };
    await expectStorageError(activateRuleCatalog(db, unpublished), "INVALID_CATALOG");

    const compatibleArtifacts = catalogArtifacts(1);
    const incompatiblePackage = clone(tariffPackageFixture) as unknown as {
      engineContractVersion: number;
    };
    incompatiblePackage.engineContractVersion = 2;
    const incompatible: RuleCatalogArtifacts = {
      ...compatibleArtifacts,
      packageJson: compatibleArtifacts.packageJson.map((json, index) =>
        index === 0 ? JSON.stringify(incompatiblePackage) : json,
      ),
    };
    await expectStorageError(activateRuleCatalog(db, incompatible), "INVALID_CATALOG");

    expect(
      adapter.database.prepare("SELECT COUNT(*) count FROM rule_catalog_generations").get(),
    ).toEqual({ count: 0 });
  });

  it("rejects rollback generations and conflicting reuse of a generation", async () => {
    await activateRuleCatalog(db, catalogArtifacts(1));
    await activateRuleCatalog(db, catalogArtifacts(2));

    await expectStorageError(activateRuleCatalog(db, catalogArtifacts(1)), "GENERATION_ROLLBACK");

    const conflict = catalogArtifacts(2);
    const conflictingManifest = JSON.parse(conflict.manifestJson) as typeof manifestFixture;
    conflictingManifest.publishedAt = "2026-04-30T12:00:00Z";
    await expectStorageError(
      activateRuleCatalog(db, {
        ...conflict,
        manifestJson: JSON.stringify(conflictingManifest),
      }),
      "GENERATION_CONFLICT",
    );

    expect((await loadActiveRuleCatalog(db))?.generation).toBe(2);
  });

  it("enforces immutable catalog history and a monotonic active pointer in SQLite", async () => {
    await activateRuleCatalog(db, catalogArtifacts(1));
    await activateRuleCatalog(db, catalogArtifacts(2));

    expect(() =>
      adapter.database
        .prepare("UPDATE rule_catalog_generations SET manifest_json='{}' WHERE generation=1")
        .run(),
    ).toThrow("rule catalog generations are immutable");
    expect(() =>
      adapter.database.prepare("DELETE FROM rule_catalog_packages WHERE generation=1").run(),
    ).toThrow("rule catalog packages are immutable");
    expect(() =>
      adapter.database
        .prepare("UPDATE rule_catalog_state SET active_generation=1 WHERE id='active'")
        .run(),
    ).toThrow("active rule catalog generation must increase");
  });

  it("keeps the previous active catalog when a later activation fails", async () => {
    await activateRuleCatalog(db, catalogArtifacts(1));
    adapter.database.exec(`
      CREATE TRIGGER reject_generation_two_package
      BEFORE INSERT ON rule_catalog_packages
      WHEN NEW.generation = 2
      BEGIN SELECT RAISE(ABORT, 'simulated package write failure'); END;
    `);

    await expect(activateRuleCatalog(db, catalogArtifacts(2))).rejects.toThrow(
      "simulated package write failure",
    );

    expect((await loadActiveRuleCatalog(db))?.generation).toBe(1);
    expect(
      adapter.database
        .prepare("SELECT COUNT(*) count FROM rule_catalog_generations WHERE generation=2")
        .get(),
    ).toEqual({ count: 0 });
    expect(
      adapter.database
        .prepare("SELECT COUNT(*) count FROM rule_catalog_packages WHERE generation=2")
        .get(),
    ).toEqual({ count: 0 });
  });

  it("falls back to the previous valid activation when active storage is corrupt", async () => {
    await activateRuleCatalog(db, catalogArtifacts(1));
    await activateRuleCatalog(db, catalogArtifacts(2));
    adapter.database.exec(`
      DROP TRIGGER prevent_rule_catalog_package_update;
      DROP TRIGGER prevent_rule_catalog_generation_update;
    `);
    adapter.database
      .prepare(
        "UPDATE rule_catalog_packages SET payload_json='{}' WHERE generation=2 AND kind='LEGAL'",
      )
      .run();

    const recovered = await loadActiveRuleCatalog(db);
    expect(recovered).toMatchObject({
      activeGeneration: 2,
      generation: 1,
      recoveredFromGeneration: 2,
    });

    adapter.database
      .prepare("UPDATE rule_catalog_generations SET manifest_json='{}' WHERE generation=1")
      .run();
    await expectStorageError(loadActiveRuleCatalog(db), "CORRUPT_CATALOG_STORAGE");
  });
});
