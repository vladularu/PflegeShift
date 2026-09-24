import Database from "better-sqlite3";
import type { SQLiteDatabase } from "expo-sqlite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { migrateDatabase } from "@/infrastructure/database/migrations";
import {
  claimRuleCatalogCheck,
  completeRuleCatalogCheck,
  ruleCatalogSyncStateKey,
} from "@/infrastructure/database/rule-catalog-sync-state";

class TestDatabase {
  readonly database = new Database(":memory:");

  async execAsync(source: string): Promise<void> {
    this.database.exec(source);
  }

  async runAsync(source: string, ...params: unknown[]) {
    const result = this.database.prepare(source).run(...params);
    return { changes: result.changes, lastInsertRowId: Number(result.lastInsertRowid) };
  }

  async getFirstAsync<T>(source: string, ...params: unknown[]): Promise<T | null> {
    return (this.database.prepare(source).get(...params) as T | undefined) ?? null;
  }

  async getAllAsync<T>(source: string, ...params: unknown[]): Promise<T[]> {
    return this.database.prepare(source).all(...params) as T[];
  }
}

describe("rule catalog sync state", () => {
  const preview = "PREVIEW" as const;
  const hour = 60 * 60 * 1_000;
  const day = 24 * hour;
  let adapter: TestDatabase;
  let db: SQLiteDatabase;

  beforeEach(async () => {
    adapter = new TestDatabase();
    db = adapter as unknown as SQLiteDatabase;
    await migrateDatabase(db);
  });

  afterEach(() => adapter.database.close());

  it("claims one check atomically and applies a bounded failure retry", async () => {
    const now = new Date("2026-08-29T10:00:00.000Z");
    const claims = await Promise.all([
      claimRuleCatalogCheck(db, preview, now, hour),
      claimRuleCatalogCheck(db, preview, now, hour),
    ]);

    expect(claims.sort()).toEqual([false, true]);
    await expect(
      claimRuleCatalogCheck(db, preview, new Date(now.getTime() + hour - 1), hour),
    ).resolves.toBe(false);
    await expect(
      claimRuleCatalogCheck(db, preview, new Date(now.getTime() + hour), hour),
    ).resolves.toBe(true);
  });

  it("uses the longer success interval after a trusted generation check", async () => {
    const now = new Date("2026-08-29T10:00:00.000Z");
    await claimRuleCatalogCheck(db, preview, now, hour);
    await completeRuleCatalogCheck(db, preview, 1, now, day);

    await expect(
      claimRuleCatalogCheck(db, preview, new Date(now.getTime() + day - 1), hour),
    ).resolves.toBe(false);
    await expect(
      claimRuleCatalogCheck(db, preview, new Date(now.getTime() + day), hour),
    ).resolves.toBe(true);
  });

  it("allows one explicit channel check to replace a future success schedule", async () => {
    const now = new Date("2026-08-29T10:00:00.000Z");
    await claimRuleCatalogCheck(db, preview, now, hour);
    await completeRuleCatalogCheck(db, preview, 1, now, day);

    const forcedAt = new Date(now.getTime() + hour);
    await expect(claimRuleCatalogCheck(db, preview, forcedAt, hour, true)).resolves.toBe(true);
    await expect(claimRuleCatalogCheck(db, preview, forcedAt, hour)).resolves.toBe(false);
  });

  it("bypasses an old generation schedule once, then respects failure retry and normal checks", async () => {
    const now = new Date("2026-08-29T10:00:00.000Z");
    await claimRuleCatalogCheck(db, preview, now, hour);
    await completeRuleCatalogCheck(db, preview, 4, now, day);

    const upgradeAt = new Date(now.getTime() + 10 * 60_000);
    await expect(claimRuleCatalogCheck(db, preview, upgradeAt, hour, false, 5)).resolves.toBe(true);
    await expect(
      claimRuleCatalogCheck(db, preview, new Date(upgradeAt.getTime() + hour - 1), hour, false, 5),
    ).resolves.toBe(false);
    await expect(
      claimRuleCatalogCheck(db, preview, new Date(upgradeAt.getTime() + hour), hour, false, 5),
    ).resolves.toBe(true);

    const checkedAt = new Date(upgradeAt.getTime() + hour);
    await completeRuleCatalogCheck(db, preview, 4, checkedAt, day);
    const beforeNextCheck = new Date(checkedAt.getTime() + 10 * 60_000);
    await expect(claimRuleCatalogCheck(db, preview, beforeNextCheck, hour, false, 5)).resolves.toBe(
      false,
    );
    await expect(claimRuleCatalogCheck(db, preview, beforeNextCheck, hour, false, 6)).resolves.toBe(
      true,
    );
  });

  it("isolates Preview and Production scheduling metadata", async () => {
    const now = new Date("2026-08-29T10:00:00.000Z");
    await claimRuleCatalogCheck(db, "PREVIEW", now, hour);
    await completeRuleCatalogCheck(db, "PREVIEW", 4, now, day);

    await expect(claimRuleCatalogCheck(db, "PREVIEW", now, hour)).resolves.toBe(false);
    await expect(claimRuleCatalogCheck(db, "PRODUCTION", now, hour)).resolves.toBe(true);
    expect(ruleCatalogSyncStateKey("PREVIEW")).toBe("rule_catalog_sync_preview");
    expect(ruleCatalogSyncStateKey("PRODUCTION")).toBe("rule_catalog_sync_production");
  });

  it("fails open for corrupt or implausibly future local scheduling metadata", async () => {
    await db.runAsync(
      "INSERT INTO app_preferences(key,value,updated_at) VALUES(?,?,?)",
      ruleCatalogSyncStateKey(preview),
      "not-json",
      "2026-08-29T10:00:00.000Z",
    );
    const now = new Date("2026-08-29T10:00:00.000Z");
    await expect(claimRuleCatalogCheck(db, preview, now, hour)).resolves.toBe(true);

    await db.runAsync(
      "UPDATE app_preferences SET value=? WHERE key='rule_catalog_sync_preview'",
      JSON.stringify({
        nextCheckAt: "2036-08-29T10:00:00.000Z",
        lastSuccessfulGeneration: 1,
      }),
    );
    await expect(claimRuleCatalogCheck(db, preview, now, hour)).resolves.toBe(true);
  });

  it("rejects an invalid successful generation", async () => {
    await expect(completeRuleCatalogCheck(db, preview, 0, new Date(), day)).rejects.toThrow(
      "positive generation",
    );
  });
});
