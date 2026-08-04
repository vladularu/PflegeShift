import { describe, expect, it, vi } from "vitest";

import {
  applyAndVerifySqlCipher,
  assertCipherIntegrity,
} from "@/infrastructure/database/sqlcipher";

describe("SQLCipher initialization", () => {
  it("sets the key before touching database pages", async () => {
    const calls: string[] = [];
    const database = {
      execAsync: vi.fn(async (sql: string) => {
        calls.push(sql);
      }),
      getFirstAsync: vi.fn(async (sql: string) => {
        calls.push(sql);
        if (sql.includes("cipher_version")) return { cipher_version: "4.7.0" };
        return { count: 1 };
      }),
      getAllAsync: vi.fn(),
    };

    await applyAndVerifySqlCipher(database, "01".repeat(32));

    expect(calls[0]).toContain("PRAGMA key");
    expect(calls[1]).toContain("cipher_version");
    expect(calls[2]).toContain("sqlite_master");
  });

  it("fails closed when the binary has no SQLCipher support", async () => {
    const database = {
      execAsync: vi.fn().mockResolvedValue(undefined),
      getFirstAsync: vi.fn().mockResolvedValue(null),
      getAllAsync: vi.fn(),
    };

    await expect(applyAndVerifySqlCipher(database, "01".repeat(32))).rejects.toThrow("SQLCipher");
  });

  it("accepts only an empty cipher integrity result", async () => {
    const database = {
      execAsync: vi.fn(),
      getFirstAsync: vi.fn(),
      getAllAsync: vi.fn().mockResolvedValue([]),
    };

    await expect(assertCipherIntegrity(database)).resolves.toBeUndefined();

    database.getAllAsync.mockResolvedValue([{ error: "page 2" }]);
    await expect(assertCipherIntegrity(database)).rejects.toThrow("Integritätsprüfung");
  });
});
