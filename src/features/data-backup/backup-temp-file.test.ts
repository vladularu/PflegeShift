import { describe, expect, it, vi } from "vitest";

import {
  assertBackupTempUri,
  BackupTempCleanupError,
  withBackupTempFile,
} from "./backup-temp-file";

const cacheUri = "file:///app/Library/Caches/";
const uri = `${cacheUri}DocumentPicker/1234-abcd.json`;

describe("backup temporary file lifecycle", () => {
  it.each(["shared", "dismissed"])(
    "waits for the share result %s before deleting",
    async (result) => {
      let finish!: (value: string) => void;
      const remove = vi.fn();
      const pending = withBackupTempFile({
        cacheUri,
        uri,
        kind: "import",
        remove,
        run: () =>
          new Promise<string>((resolve) => {
            finish = resolve;
          }),
      });
      expect(remove).not.toHaveBeenCalled();
      finish(result);
      await expect(pending).resolves.toBe(result);
      expect(remove).toHaveBeenCalledTimes(1);
    },
  );

  it("keeps parsed data usable after removing its source copy", async () => {
    let text = '{"profile":1}';
    const value = await withBackupTempFile({
      cacheUri,
      uri,
      kind: "import",
      run: async () => JSON.parse(text),
      remove: () => {
        text = "";
      },
    });
    expect(text).toBe("");
    expect(value).toEqual({ profile: 1 });
  });

  it.each(["read", "validation", "write", "share"])(
    "cleans up after a %s failure without hiding it",
    async (stage) => {
      const error = new Error(stage);
      const remove = vi.fn();
      await expect(
        withBackupTempFile({
          cacheUri,
          uri,
          kind: "import",
          remove,
          run: async () => {
            throw error;
          },
        }),
      ).rejects.toBe(error);
      expect(remove).toHaveBeenCalledTimes(1);
    },
  );

  it.each([true, false])(
    "reports cleanup failure separately (operation failed: %s)",
    async (failed) => {
      const error = new Error("operation");
      const cleanup = new Error("cleanup");
      try {
        await withBackupTempFile({
          cacheUri,
          uri,
          kind: "import",
          run: async () => {
            if (failed) throw error;
            return "shared";
          },
          remove: () => {
            throw cleanup;
          },
        });
        expect.fail("Expected cleanup error");
      } catch (caught) {
        expect(caught).toBeInstanceOf(BackupTempCleanupError);
        expect((caught as BackupTempCleanupError).operationFailed).toBe(failed);
        if (failed)
          expect(((caught as Error).cause as AggregateError).errors).toEqual([error, cleanup]);
        else expect((caught as Error).cause).toBe(cleanup);
      }
    },
  );

  it("accepts only the current export and picker paths", () => {
    expect(() =>
      assertBackupTempUri(
        cacheUri,
        `${cacheUri}LUNA-Shift-Backup-2026-09-05T20-00-00-12345678-1234-1234-1234-123456789abc.json`,
        "export",
      ),
    ).not.toThrow();
    expect(() => assertBackupTempUri(cacheUri.slice(0, -1), uri, "import")).not.toThrow();
  });

  it.each([
    "file:///app/Documents/saved.json",
    "file:///app/Library/Caches-other/DocumentPicker/a.json",
    `${cacheUri}DocumentPicker/../saved.json`,
    `${cacheUri}DocumentPicker/%2e%2e%2fsaved.json`,
    `${cacheUri}DocumentPicker/a.json?other`,
    `${cacheUri}DocumentPicker/a.json#fragment`,
    `${cacheUri}DocumentPicker/a/b.json`,
    `${cacheUri}DocumentPicker/`,
    cacheUri,
    `${cacheUri}database.sqlite`,
    "content://provider/a.json",
    `${cacheUri}DocumentPicker/a%2fb.json`,
  ])("never reads or deletes an unsafe target: %s", async (target) => {
    const run = vi.fn();
    const remove = vi.fn();
    await expect(
      withBackupTempFile({ cacheUri, uri: target, kind: "import", run, remove }),
    ).rejects.toThrow();
    expect(run).not.toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();
  });
});
