import Database from "better-sqlite3";
import type { SQLiteDatabase } from "expo-sqlite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { migrateDatabase } from "@/infrastructure/database/migrations";
import {
  claimPreviewRuleCatalogCheck,
  completePreviewRuleCatalogCheck,
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
      claimPreviewRuleCatalogCheck(db, now, hour),
      claimPreviewRuleCatalogCheck(db, now, hour),
    ]);

    expect(claims.sort()).toEqual([false, true]);
    await expect(
      claimPreviewRuleCatalogCheck(db, new Date(now.getTime() + hour - 1), hour),
    ).resolves.toBe(false);
    await expect(
      claimPreviewRuleCatalogCheck(db, new Date(now.getTime() + hour), hour),
    ).resolves.toBe(true);
  });

  it("uses the longer success interval after a trusted generation check", async () => {
    const now = new Date("2026-08-29T10:00:00.000Z");
    await claimPreviewRuleCatalogCheck(db, now, hour);
    await completePreviewRuleCatalogCheck(db, 1, now, day);

    await expect(
      claimPreviewRuleCatalogCheck(db, new Date(now.getTime() + day - 1), hour),
    ).resolves.toBe(false);
    await expect(
      claimPreviewRuleCatalogCheck(db, new Date(now.getTime() + day), hour),
    ).resolves.toBe(true);
  });

  it("fails open for corrupt or implausibly future local scheduling metadata", async () => {
    await db.runAsync(
      "INSERT INTO app_preferences(key,value,updated_at) VALUES(?,?,?)",
      "rule_catalog_sync_preview",
      "not-json",
      "2026-08-29T10:00:00.000Z",
    );
    const now = new Date("2026-08-29T10:00:00.000Z");
    await expect(claimPreviewRuleCatalogCheck(db, now, hour)).resolves.toBe(true);

    await db.runAsync(
      "UPDATE app_preferences SET value=? WHERE key='rule_catalog_sync_preview'",
      JSON.stringify({
        nextCheckAt: "2036-08-29T10:00:00.000Z",
        lastSuccessfulGeneration: 1,
      }),
    );
    await expect(claimPreviewRuleCatalogCheck(db, now, hour)).resolves.toBe(true);
  });

  it("rejects an invalid successful generation", async () => {
    await expect(completePreviewRuleCatalogCheck(db, 0, new Date(), day)).rejects.toThrow(
      "positive generation",
    );
  });
});
