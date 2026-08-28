import { createHash } from "node:crypto";

import Database from "better-sqlite3";
import type { SQLiteDatabase } from "expo-sqlite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import holidayPackageFixture from "../../../rules/examples/holiday-package.valid.json";
import legalPackageFixture from "../../../rules/examples/legal-package.valid.json";
import manifestFixture from "../../../rules/examples/manifest.valid.json";
import tariffPackageFixture from "../../../rules/examples/tariff-package.valid.json";
import { migrateDatabase } from "@/infrastructure/database/migrations";
import type { RuleManifest, RulePackage } from "@/rules/contracts.generated";
import {
  verifyRuleCatalogArtifacts,
  type RuleCatalogCryptography,
  type RuleCatalogVerificationPolicy,
  type UntrustedRuleCatalogArtifacts,
  type VerifiedRuleCatalogArtifacts,
} from "@/rules/rule-catalog-verification";
import {
  activateRuleCatalog,
  loadActiveRuleCatalog,
  RuleCatalogStorageError,
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

const encoder = new TextEncoder();
const testCryptography: RuleCatalogCryptography = {
  sha256: async (bytes) => Uint8Array.from(createHash("sha256").update(bytes).digest()),
  verifyEd25519: async () => true,
};
const testPolicy: RuleCatalogVerificationPolicy = {
  expectedChannel: "PREVIEW",
  supportedEngineContractVersions: new Set([1]),
  trustedPublicKeys: new Map([["test-key-2026", new Uint8Array(32)]]),
};

function packageIdentity(value: Pick<RulePackage, "packageId" | "versionId">): string {
  return `${value.packageId}\u0000${value.versionId}`;
}

async function catalogArtifacts(
  generation: number,
  publishedAt = `2026-04-${String(19 + generation).padStart(2, "0")}T12:00:00Z`,
): Promise<VerifiedRuleCatalogArtifacts> {
  const manifest = clone(manifestFixture) as RuleManifest;
  manifest.generation = generation;
  manifest.publishedAt = publishedAt;
  manifest.signing.keyId = "test-key-2026";
  const packages = [
    clone(tariffPackageFixture),
    clone(legalPackageFixture),
    clone(holidayPackageFixture),
  ] as RulePackage[];
  const packageJson = packages.map((rulePackage) => JSON.stringify(rulePackage));
  const rawByIdentity = new Map(
    packages.map((rulePackage, index) => [packageIdentity(rulePackage), packageJson[index]]),
  );
  manifest.packages = manifest.packages.map((descriptor) => {
    const raw = rawByIdentity.get(packageIdentity(descriptor));
    if (raw === undefined) throw new Error("Missing package test fixture.");
    return {
      ...descriptor,
      sha256: createHash("sha256").update(raw, "utf8").digest("hex"),
      sizeBytes: encoder.encode(raw).byteLength,
    };
  }) as RuleManifest["packages"];

  const artifacts: UntrustedRuleCatalogArtifacts = {
    manifestJson: JSON.stringify(manifest),
    packageJson,
  };
  return verifyRuleCatalogArtifacts(artifacts, testPolicy, testCryptography);
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
    const artifacts = await catalogArtifacts(1);

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
    const artifacts = await catalogArtifacts(1);
    await activateRuleCatalog(db, artifacts, new Date("2026-08-28T08:00:00.000Z"));

    await expect(
      activateRuleCatalog(db, artifacts, new Date("2026-08-28T09:00:00.000Z")),
    ).resolves.toEqual({ status: "ALREADY_ACTIVE", generation: 1 });
    expect(
      adapter.database.prepare("SELECT COUNT(*) count FROM rule_catalog_generations").get(),
    ).toEqual({ count: 1 });
  });

  it("serializes concurrent activations on the already-keyed connection", async () => {
    const firstArtifacts = await catalogArtifacts(1);
    const secondArtifacts = await catalogArtifacts(2);
    const [first, second] = await Promise.all([
      activateRuleCatalog(db, firstArtifacts, new Date("2026-08-28T08:00:00.000Z")),
      activateRuleCatalog(db, secondArtifacts, new Date("2026-08-28T09:00:00.000Z")),
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

    const firstArtifacts = await catalogArtifacts(1);
    const secondArtifacts = await catalogArtifacts(2);
    const [failed, succeeding] = await Promise.allSettled([
      activateRuleCatalog(db, firstArtifacts),
      activateRuleCatalog(db, secondArtifacts),
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

  it("rejects artifacts that did not pass the cryptographic verifier", async () => {
    const unverified = {
      manifestJson: "{}",
      packageJson: [],
    } as unknown as VerifiedRuleCatalogArtifacts;
    await expectStorageError(activateRuleCatalog(db, unverified), "UNVERIFIED_ARTIFACTS");
    expect(
      adapter.database.prepare("SELECT COUNT(*) count FROM rule_catalog_generations").get(),
    ).toEqual({ count: 0 });
  });

  it("rejects rollback generations and conflicting reuse of a generation", async () => {
    const firstArtifacts = await catalogArtifacts(1);
    const secondArtifacts = await catalogArtifacts(2);
    await activateRuleCatalog(db, firstArtifacts);
    await activateRuleCatalog(db, secondArtifacts);

    await expectStorageError(activateRuleCatalog(db, firstArtifacts), "GENERATION_ROLLBACK");

    const conflict = await catalogArtifacts(2, "2026-04-30T12:00:00Z");
    await expectStorageError(activateRuleCatalog(db, conflict), "GENERATION_CONFLICT");

    expect((await loadActiveRuleCatalog(db))?.generation).toBe(2);
  });

  it("enforces immutable catalog history and a monotonic active pointer in SQLite", async () => {
    await activateRuleCatalog(db, await catalogArtifacts(1));
    await activateRuleCatalog(db, await catalogArtifacts(2));

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
    await activateRuleCatalog(db, await catalogArtifacts(1));
    adapter.database.exec(`
      CREATE TRIGGER reject_generation_two_package
      BEFORE INSERT ON rule_catalog_packages
      WHEN NEW.generation = 2
      BEGIN SELECT RAISE(ABORT, 'simulated package write failure'); END;
    `);

    await expect(activateRuleCatalog(db, await catalogArtifacts(2))).rejects.toThrow(
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
    await activateRuleCatalog(db, await catalogArtifacts(1));
    await activateRuleCatalog(db, await catalogArtifacts(2));
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

  it("falls back to the previous activation when the active catalog is runtime-incompatible", async () => {
    await activateRuleCatalog(db, await catalogArtifacts(1));
    await activateRuleCatalog(db, await catalogArtifacts(2));

    const recovered = await loadActiveRuleCatalog(
      db,
      (catalog) => catalog.manifest.generation === 1,
    );
    expect(recovered).toMatchObject({
      activeGeneration: 2,
      generation: 1,
      recoveredFromGeneration: 2,
    });

    const error = await expectStorageError(
      loadActiveRuleCatalog(db, () => false),
      "CORRUPT_CATALOG_STORAGE",
    );
    expect(error.activeGeneration).toBe(2);
  });
});
