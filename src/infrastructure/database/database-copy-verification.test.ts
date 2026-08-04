import { describe, expect, it, vi } from "vitest";

import {
  assertAttachedDatabaseCopy,
  checkpointWal,
} from "@/infrastructure/database/database-copy-verification";

describe("database copy verification", () => {
  it("compares complete schema definitions and every application table in both directions", async () => {
    const schema = [
      {
        name: "entries",
        sql: "CREATE TABLE entries(id TEXT PRIMARY KEY, note TEXT)",
        tbl_name: "entries",
        type: "table",
      },
      {
        name: "entries_note",
        sql: "CREATE INDEX entries_note ON entries(note)",
        tbl_name: "entries",
        type: "index",
      },
      {
        name: "entries_view",
        sql: "CREATE VIEW entries_view AS SELECT * FROM entries",
        tbl_name: "entries_view",
        type: "view",
      },
    ];
    const database = {
      getAllAsync: vi.fn().mockResolvedValueOnce(schema).mockResolvedValueOnce(schema),
      getFirstAsync: vi
        .fn()
        .mockResolvedValueOnce({ count: 2 })
        .mockResolvedValueOnce({ count: 2 })
        .mockResolvedValueOnce({ has_difference: 0 })
        .mockResolvedValueOnce({ has_difference: 0 }),
    };

    await expect(assertAttachedDatabaseCopy(database)).resolves.toBeUndefined();

    const statements = database.getFirstAsync.mock.calls.map(([sql]) => sql);
    expect(statements).toHaveLength(4);
    expect(statements[2]).toContain('main."entries"');
    expect(statements[2]).toContain('encrypted."entries"');
    expect(statements[3]).toContain('encrypted."entries"');
    expect(statements[3]).toContain('main."entries"');
  });

  it("rejects a copy when a row differs despite identical row counts", async () => {
    const schema = [
      {
        name: "entries",
        sql: "CREATE TABLE entries(id TEXT PRIMARY KEY, note TEXT)",
        tbl_name: "entries",
        type: "table",
      },
    ];
    const database = {
      getAllAsync: vi.fn().mockResolvedValueOnce(schema).mockResolvedValueOnce(schema),
      getFirstAsync: vi
        .fn()
        .mockResolvedValueOnce({ count: 1 })
        .mockResolvedValueOnce({ count: 1 })
        .mockResolvedValueOnce({ has_difference: 1 }),
    };

    await expect(assertAttachedDatabaseCopy(database)).rejects.toThrow("Datenkopie");
  });

  it("rejects a busy WAL checkpoint", async () => {
    const database = {
      getFirstAsync: vi.fn().mockResolvedValue({ busy: 1, checkpointed: 0, log: 4 }),
    };

    await expect(checkpointWal(database)).rejects.toThrow("WAL");
  });

  it("accepts the SQLite non-WAL sentinel when no writer is busy", async () => {
    const database = {
      getFirstAsync: vi.fn().mockResolvedValue({ busy: 0, checkpointed: -1, log: -1 }),
    };

    await expect(checkpointWal(database)).resolves.toBeUndefined();
  });
});
