import type { SQLiteDatabase } from "expo-sqlite";

import { withImmediateTransaction } from "@/infrastructure/database/transaction";
import type { RuleManifest } from "@/rules/contracts.generated";

const MAXIMUM_REASONABLE_SCHEDULE_DELAY_MS = 7 * 24 * 60 * 60 * 1_000;

interface SyncStateValue {
  readonly nextCheckAt: string;
  readonly lastSuccessfulGeneration: number | null;
}

interface PreferenceRow {
  readonly value: string;
}

function parseState(value: string | undefined): SyncStateValue | null {
  if (value === undefined) return null;
  try {
    const parsed = JSON.parse(value) as unknown;
    if (parsed === null || typeof parsed !== "object") return null;
    const nextCheckAt = Reflect.get(parsed, "nextCheckAt");
    const lastSuccessfulGeneration = Reflect.get(parsed, "lastSuccessfulGeneration");
    if (
      typeof nextCheckAt !== "string" ||
      !Number.isFinite(Date.parse(nextCheckAt)) ||
      !(
        lastSuccessfulGeneration === null ||
        (Number.isSafeInteger(lastSuccessfulGeneration) && Number(lastSuccessfulGeneration) > 0)
      )
    ) {
      return null;
    }
    return {
      nextCheckAt,
      lastSuccessfulGeneration:
        lastSuccessfulGeneration === null ? null : Number(lastSuccessfulGeneration),
    };
  } catch {
    return null;
  }
}

function stateJson(nextCheckAt: Date, generation: number | null): string {
  return JSON.stringify({
    nextCheckAt: nextCheckAt.toISOString(),
    lastSuccessfulGeneration: generation,
  });
}

export function ruleCatalogSyncStateKey(channel: RuleManifest["channel"]): string {
  return `rule_catalog_sync_${channel.toLowerCase()}`;
}

async function writeState(
  db: SQLiteDatabase,
  stateKey: string,
  value: string,
  updatedAt: Date,
): Promise<void> {
  await db.runAsync(
    `INSERT INTO app_preferences(key,value,updated_at) VALUES(?,?,?)
     ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at`,
    stateKey,
    value,
    updatedAt.toISOString(),
  );
}

export async function claimRuleCatalogCheck(
  db: SQLiteDatabase,
  channel: RuleManifest["channel"],
  now: Date,
  failureRetryMilliseconds: number,
  force = false,
  requiredGeneration: number | null = null,
): Promise<boolean> {
  if (!Number.isSafeInteger(failureRetryMilliseconds) || failureRetryMilliseconds <= 0) {
    throw new Error("The rule catalog failure retry interval must be positive.");
  }
  if (
    requiredGeneration !== null &&
    (!Number.isSafeInteger(requiredGeneration) || requiredGeneration <= 0)
  ) {
    throw new Error("The required rule catalog generation must be positive.");
  }
  const stateKey = ruleCatalogSyncStateKey(channel);
  const upgradeKey =
    requiredGeneration === null
      ? null
      : stateKey + "_generation_" + requiredGeneration + "_claimed";
  let claimed = false;
  await withImmediateTransaction(db, async (transaction) => {
    const row = await transaction.getFirstAsync<PreferenceRow>(
      "SELECT value FROM app_preferences WHERE key=?",
      stateKey,
    );
    const state = parseState(row?.value);
    const upgradeClaim =
      upgradeKey === null
        ? null
        : await transaction.getFirstAsync<PreferenceRow>(
            "SELECT value FROM app_preferences WHERE key=?",
            upgradeKey,
          );
    const firstUpgradeClaim = upgradeKey !== null && upgradeClaim === null;
    const nextCheck = state === null ? null : Date.parse(state.nextCheckAt);
    const implausiblyFuture =
      nextCheck !== null && nextCheck > now.getTime() + MAXIMUM_REASONABLE_SCHEDULE_DELAY_MS;
    if (
      !force &&
      !firstUpgradeClaim &&
      nextCheck !== null &&
      nextCheck > now.getTime() &&
      !implausiblyFuture
    ) {
      return;
    }

    const retryAt = new Date(now.getTime() + failureRetryMilliseconds);
    await writeState(
      transaction,
      stateKey,
      stateJson(retryAt, state?.lastSuccessfulGeneration ?? null),
      now,
    );
    if (firstUpgradeClaim) {
      await writeState(transaction, upgradeKey, "1", now);
    }
    claimed = true;
  });
  return claimed;
}

export async function completeRuleCatalogCheck(
  db: SQLiteDatabase,
  channel: RuleManifest["channel"],
  generation: number,
  now: Date,
  checkIntervalMilliseconds: number,
): Promise<void> {
  if (!Number.isSafeInteger(generation) || generation <= 0) {
    throw new Error("A successful rule catalog check requires a positive generation.");
  }
  if (!Number.isSafeInteger(checkIntervalMilliseconds) || checkIntervalMilliseconds <= 0) {
    throw new Error("The rule catalog check interval must be positive.");
  }
  const stateKey = ruleCatalogSyncStateKey(channel);
  await withImmediateTransaction(db, (transaction) =>
    writeState(
      transaction,
      stateKey,
      stateJson(new Date(now.getTime() + checkIntervalMilliseconds), generation),
      now,
    ),
  );
}
