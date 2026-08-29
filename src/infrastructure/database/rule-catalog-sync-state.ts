import type { SQLiteDatabase } from "expo-sqlite";

import { withImmediateTransaction } from "@/infrastructure/database/transaction";

const PREVIEW_STATE_KEY = "rule_catalog_sync_preview";
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

async function writeState(db: SQLiteDatabase, value: string, updatedAt: Date): Promise<void> {
  await db.runAsync(
    `INSERT INTO app_preferences(key,value,updated_at) VALUES(?,?,?)
     ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at`,
    PREVIEW_STATE_KEY,
    value,
    updatedAt.toISOString(),
  );
}

export async function claimPreviewRuleCatalogCheck(
  db: SQLiteDatabase,
  now: Date,
  failureRetryMilliseconds: number,
): Promise<boolean> {
  if (!Number.isSafeInteger(failureRetryMilliseconds) || failureRetryMilliseconds <= 0) {
    throw new Error("The rule catalog failure retry interval must be positive.");
  }
  let claimed = false;
  await withImmediateTransaction(db, async (transaction) => {
    const row = await transaction.getFirstAsync<PreferenceRow>(
      "SELECT value FROM app_preferences WHERE key=?",
      PREVIEW_STATE_KEY,
    );
    const state = parseState(row?.value);
    const nextCheck = state === null ? null : Date.parse(state.nextCheckAt);
    const implausiblyFuture =
      nextCheck !== null && nextCheck > now.getTime() + MAXIMUM_REASONABLE_SCHEDULE_DELAY_MS;
    if (nextCheck !== null && nextCheck > now.getTime() && !implausiblyFuture) return;

    const retryAt = new Date(now.getTime() + failureRetryMilliseconds);
    await writeState(transaction, stateJson(retryAt, state?.lastSuccessfulGeneration ?? null), now);
    claimed = true;
  });
  return claimed;
}

export async function completePreviewRuleCatalogCheck(
  db: SQLiteDatabase,
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
  await withImmediateTransaction(db, (transaction) =>
    writeState(
      transaction,
      stateJson(new Date(now.getTime() + checkIntervalMilliseconds), generation),
      now,
    ),
  );
}
