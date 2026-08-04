import { describe, expect, it, vi } from "vitest";

import {
  createDatabaseKey,
  readDatabaseKey,
  sqlCipherKeyLiteral,
  sqliteStringLiteral,
} from "@/infrastructure/database/database-key";

describe("database key management", () => {
  it("accepts an existing 256-bit hexadecimal key", async () => {
    const key = "ab".repeat(32);
    const store = { get: vi.fn().mockResolvedValue(key), set: vi.fn() };

    await expect(readDatabaseKey(store)).resolves.toBe(key);
    expect(store.set).not.toHaveBeenCalled();
  });

  it("rejects malformed stored keys instead of silently rotating them", async () => {
    const store = { get: vi.fn().mockResolvedValue("not-a-database-key"), set: vi.fn() };

    await expect(readDatabaseKey(store)).rejects.toThrow("ungültig");
    expect(store.set).not.toHaveBeenCalled();
  });

  it("generates and persists exactly 32 random bytes", async () => {
    const randomBytes = Uint8Array.from({ length: 32 }, (_, index) => index);
    const store = { get: vi.fn(), set: vi.fn().mockResolvedValue(undefined) };

    const key = await createDatabaseKey(store, async (length) => {
      expect(length).toBe(32);
      return randomBytes;
    });

    expect(key).toBe("000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f");
    expect(store.set).toHaveBeenCalledWith(key);
  });

  it("formats only validated values for SQLCipher statements", () => {
    const key = "01".repeat(32);

    expect(sqlCipherKeyLiteral(key)).toBe(`"x'${key}'"`);
    expect(() => sqlCipherKeyLiteral("bad'key")).toThrow("ungültig");
    expect(sqliteStringLiteral("file'name.db")).toBe("'file''name.db'");
  });
});
