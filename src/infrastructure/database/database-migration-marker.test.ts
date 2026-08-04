import { describe, expect, it, vi } from "vitest";

import {
  assertDatabaseMigrationMarker,
  writeDatabaseMigrationMarker,
} from "@/infrastructure/database/database-migration-marker";

describe("database migration marker", () => {
  it("accepts a committed legacy migration marker", async () => {
    const database = {
      getFirstAsync: vi.fn().mockResolvedValue({
        value: JSON.stringify({ source: "legacy", version: 1 }),
      }),
    };

    await expect(assertDatabaseMigrationMarker(database, "legacy")).resolves.toBeUndefined();
  });

  it("rejects a missing, corrupt, or unexpected marker", async () => {
    for (const value of [
      null,
      { value: "not-json" },
      { value: JSON.stringify({ source: "fresh", version: 1 }) },
    ]) {
      const database = { getFirstAsync: vi.fn().mockResolvedValue(value) };
      await expect(assertDatabaseMigrationMarker(database, "legacy")).rejects.toThrow(
        "Migrationsnachweis",
      );
    }
  });

  it("writes the marker only through a parameterized upsert", async () => {
    const database = { runAsync: vi.fn().mockResolvedValue(undefined) };

    await writeDatabaseMigrationMarker(database, "fresh");

    expect(database.runAsync).toHaveBeenCalledOnce();
    const [sql, key, value] = database.runAsync.mock.calls[0];
    expect(sql).toContain("ON CONFLICT(key) DO UPDATE");
    expect(key).toBe("database_encryption_v1");
    expect(JSON.parse(value)).toEqual({ source: "fresh", version: 1 });
  });
});
