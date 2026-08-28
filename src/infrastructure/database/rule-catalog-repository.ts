import type { SQLiteDatabase } from "expo-sqlite";

import type { RulePackage } from "@/rules/contracts.generated";
import {
  validateRuleCatalog,
  type ValidatedRuleCatalog,
  type ValidationIssue,
} from "@/rules/validation";
import {
  isVerifiedRuleCatalogArtifacts,
  type UntrustedRuleCatalogArtifacts,
  type VerifiedRuleCatalogArtifacts,
} from "@/rules/rule-catalog-verification";
import { withImmediateTransaction } from "@/infrastructure/database/transaction";

export type RuleCatalogActivationResult =
  | {
      readonly status: "ACTIVATED";
      readonly generation: number;
      readonly previousGeneration: number | null;
    }
  | {
      readonly status: "ALREADY_ACTIVE";
      readonly generation: number;
    };

export interface LoadedRuleCatalog {
  readonly activeGeneration: number;
  readonly generation: number;
  readonly recoveredFromGeneration: number | null;
  readonly catalog: ValidatedRuleCatalog;
}

export type RuleCatalogStorageErrorCode =
  | "INVALID_ARTIFACT_JSON"
  | "INVALID_CATALOG"
  | "UNVERIFIED_ARTIFACTS"
  | "GENERATION_ROLLBACK"
  | "GENERATION_CONFLICT"
  | "CORRUPT_CATALOG_STORAGE";

export class RuleCatalogStorageError extends Error {
  readonly code: RuleCatalogStorageErrorCode;
  readonly issues: readonly ValidationIssue[];

  constructor(
    code: RuleCatalogStorageErrorCode,
    message: string,
    issues: readonly ValidationIssue[] = [],
  ) {
    super(message);
    this.name = "RuleCatalogStorageError";
    this.code = code;
    this.issues = issues;
  }
}

interface PreparedPackageArtifact {
  readonly packageId: string;
  readonly versionId: string;
  readonly kind: RulePackage["kind"];
  readonly payloadJson: string;
}

interface PreparedCatalogArtifacts {
  readonly manifestJson: string;
  readonly catalog: ValidatedRuleCatalog;
  readonly packages: readonly PreparedPackageArtifact[];
}

interface GenerationRow {
  readonly generation: number;
  readonly manifest_json: string;
}

interface PackageRow {
  readonly package_id: string;
  readonly version_id: string;
  readonly kind: RulePackage["kind"];
  readonly payload_json: string;
}

interface StateRow {
  readonly active_generation: number;
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    for (const nested of Object.values(value)) deepFreeze(nested);
    Object.freeze(value);
  }
  return value;
}

function parseArtifact(json: string, label: string): unknown {
  try {
    return JSON.parse(json) as unknown;
  } catch {
    throw new RuleCatalogStorageError(
      "INVALID_ARTIFACT_JSON",
      `Rule catalog artifact ${label} is not valid JSON.`,
    );
  }
}

function prepareCatalogArtifacts(
  artifacts: UntrustedRuleCatalogArtifacts,
): PreparedCatalogArtifacts {
  const manifestValue = parseArtifact(artifacts.manifestJson, "manifest");
  const packageValues = artifacts.packageJson.map((json, index) =>
    parseArtifact(json, `package ${index}`),
  );
  const validation = validateRuleCatalog(manifestValue, packageValues);
  if (!validation.ok) {
    throw new RuleCatalogStorageError(
      "INVALID_CATALOG",
      "Rule catalog artifacts do not satisfy the catalog contract.",
      validation.issues,
    );
  }

  const catalog = deepFreeze(validation.value);
  return {
    manifestJson: artifacts.manifestJson,
    catalog,
    packages: catalog.packages.map((rulePackage, index) => ({
      packageId: rulePackage.packageId,
      versionId: rulePackage.versionId,
      kind: rulePackage.kind,
      payloadJson: artifacts.packageJson[index],
    })),
  };
}

function packageIdentity(value: {
  readonly packageId: string;
  readonly versionId: string;
}): string {
  return `${value.packageId}\u0000${value.versionId}`;
}

async function storedArtifactsMatch(
  db: SQLiteDatabase,
  generation: number,
  prepared: PreparedCatalogArtifacts,
): Promise<boolean> {
  const storedGeneration = await db.getFirstAsync<GenerationRow>(
    "SELECT generation,manifest_json FROM rule_catalog_generations WHERE generation=?",
    generation,
  );
  if (storedGeneration?.manifest_json !== prepared.manifestJson) return false;

  const storedPackages = await db.getAllAsync<PackageRow>(
    `SELECT package_id,version_id,kind,payload_json
       FROM rule_catalog_packages
      WHERE generation=?`,
    generation,
  );
  if (storedPackages.length !== prepared.packages.length) return false;

  const storedByIdentity = new Map(
    storedPackages.map((row) => [
      packageIdentity({ packageId: row.package_id, versionId: row.version_id }),
      row,
    ]),
  );
  return prepared.packages.every((rulePackage) => {
    const stored = storedByIdentity.get(packageIdentity(rulePackage));
    return stored?.kind === rulePackage.kind && stored.payload_json === rulePackage.payloadJson;
  });
}

async function loadGeneration(
  db: SQLiteDatabase,
  generationRow: GenerationRow,
): Promise<ValidatedRuleCatalog | null> {
  const storedPackages = await db.getAllAsync<PackageRow>(
    `SELECT package_id,version_id,kind,payload_json
       FROM rule_catalog_packages
      WHERE generation=?
      ORDER BY package_id,version_id`,
    generationRow.generation,
  );

  try {
    const prepared = prepareCatalogArtifacts({
      manifestJson: generationRow.manifest_json,
      packageJson: storedPackages.map((row) => row.payload_json),
    });
    if (prepared.catalog.manifest.generation !== generationRow.generation) return null;
    if (
      prepared.packages.some((rulePackage, index) => {
        const stored = storedPackages[index];
        return (
          stored === undefined ||
          stored.package_id !== rulePackage.packageId ||
          stored.version_id !== rulePackage.versionId ||
          stored.kind !== rulePackage.kind
        );
      })
    ) {
      return null;
    }
    return prepared.catalog;
  } catch (error) {
    if (error instanceof RuleCatalogStorageError) return null;
    throw error;
  }
}

export async function activateRuleCatalog(
  db: SQLiteDatabase,
  artifacts: VerifiedRuleCatalogArtifacts,
  activatedAt: Date = new Date(),
): Promise<RuleCatalogActivationResult> {
  if (!isVerifiedRuleCatalogArtifacts(artifacts)) {
    throw new RuleCatalogStorageError(
      "UNVERIFIED_ARTIFACTS",
      "Rule catalog artifacts must pass cryptographic verification before activation.",
    );
  }
  const prepared = prepareCatalogArtifacts(artifacts);
  const generation = prepared.catalog.manifest.generation;
  const timestamp = activatedAt.toISOString();
  let activationResult: RuleCatalogActivationResult | null = null;

  await withImmediateTransaction(db, async (transaction) => {
    const state = await transaction.getFirstAsync<StateRow>(
      "SELECT active_generation FROM rule_catalog_state WHERE id='active'",
    );
    const activeGeneration = state?.active_generation ?? null;
    if (activeGeneration !== null && generation < activeGeneration) {
      throw new RuleCatalogStorageError(
        "GENERATION_ROLLBACK",
        `Rule catalog generation ${generation} is older than active generation ${activeGeneration}.`,
      );
    }

    const existing = await transaction.getFirstAsync<{ generation: number }>(
      "SELECT generation FROM rule_catalog_generations WHERE generation=?",
      generation,
    );
    if (existing !== null) {
      if (!(await storedArtifactsMatch(transaction, generation, prepared))) {
        throw new RuleCatalogStorageError(
          "GENERATION_CONFLICT",
          `Rule catalog generation ${generation} already exists with different artifacts.`,
        );
      }
      if (activeGeneration === generation) {
        activationResult = { status: "ALREADY_ACTIVE", generation };
        return;
      }
      throw new RuleCatalogStorageError(
        "CORRUPT_CATALOG_STORAGE",
        `Stored rule catalog generation ${generation} is not the active generation.`,
      );
    }

    if (activeGeneration === generation) {
      throw new RuleCatalogStorageError(
        "CORRUPT_CATALOG_STORAGE",
        `Active rule catalog generation ${generation} has no stored artifacts.`,
      );
    }

    await transaction.runAsync(
      `INSERT INTO rule_catalog_generations(generation,manifest_json,activated_at)
       VALUES(?,?,?)`,
      generation,
      prepared.manifestJson,
      timestamp,
    );
    for (const rulePackage of prepared.packages) {
      await transaction.runAsync(
        `INSERT INTO rule_catalog_packages(
           generation,package_id,version_id,kind,payload_json
         ) VALUES(?,?,?,?,?)`,
        generation,
        rulePackage.packageId,
        rulePackage.versionId,
        rulePackage.kind,
        rulePackage.payloadJson,
      );
    }
    await transaction.runAsync(
      `INSERT INTO rule_catalog_state(id,active_generation,updated_at)
       VALUES('active',?,?)
       ON CONFLICT(id) DO UPDATE SET
         active_generation=excluded.active_generation,
         updated_at=excluded.updated_at`,
      generation,
      timestamp,
    );
    activationResult = {
      status: "ACTIVATED",
      generation,
      previousGeneration: activeGeneration,
    };
  });

  if (activationResult === null) {
    throw new RuleCatalogStorageError(
      "CORRUPT_CATALOG_STORAGE",
      "Rule catalog activation completed without a result.",
    );
  }
  return activationResult;
}

export async function loadActiveRuleCatalog(db: SQLiteDatabase): Promise<LoadedRuleCatalog | null> {
  const state = await db.getFirstAsync<StateRow>(
    "SELECT active_generation FROM rule_catalog_state WHERE id='active'",
  );
  if (state === null) return null;

  const generations = await db.getAllAsync<GenerationRow>(
    `SELECT generation,manifest_json
       FROM rule_catalog_generations
      WHERE generation <= ?
      ORDER BY generation DESC`,
    state.active_generation,
  );
  for (const generationRow of generations) {
    const catalog = await loadGeneration(db, generationRow);
    if (catalog !== null) {
      return {
        activeGeneration: state.active_generation,
        generation: generationRow.generation,
        recoveredFromGeneration:
          generationRow.generation === state.active_generation ? null : state.active_generation,
        catalog,
      };
    }
  }

  throw new RuleCatalogStorageError(
    "CORRUPT_CATALOG_STORAGE",
    `No valid stored catalog is available for active generation ${state.active_generation}.`,
  );
}
