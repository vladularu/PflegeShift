import { act, renderHook } from "@testing-library/react-native";
import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { Platform, Share } from "react-native";

import { BackupTempCleanupError } from "./backup-temp-file";
import { useLocalBackupExport } from "./use-local-backup-export";
import { useLocalBackupRestore } from "./use-local-backup-restore";

const mockCache = "file:///app/Library/Caches/";
const mockFiles = new Map<string, string>();
const mockDeleted: string[] = [];
let mockWriteFails = false;
let mockDeleteFails = false;
const mockPick = jest.fn<() => Promise<unknown>>();
const mockReadCandidate =
  jest.fn<(input: { readText: () => Promise<string> }) => Promise<unknown>>();
jest.mock("expo", () => ({ reloadAppAsync: jest.fn() }));
jest.mock("expo-constants", () => ({ expoConfig: { version: "0.1.0" } }));
jest.mock("expo-crypto", () => ({
  CryptoDigestAlgorithm: { SHA256: "SHA256" },
  digestStringAsync: async () => "hash",
  randomUUID: () => "12345678-1234-1234-1234-123456789abc",
}));
jest.mock("expo-sqlite", () => ({ useSQLiteContext: () => ({}) }));
jest.mock("expo-document-picker", () => ({ getDocumentAsync: () => mockPick() }));
jest.mock("expo-file-system", () => ({
  Paths: { cache: { uri: "file:///app/Library/Caches/" } },
  File: class {
    uri: string;
    constructor(root: string | { uri: string }, name?: string) {
      this.uri = (typeof root === "string" ? root : root.uri) + (name ?? "");
    }
    get exists() {
      return mockFiles.has(this.uri);
    }
    get size() {
      return 10;
    }
    create() {
      if (this.exists) throw new Error("exists");
      mockFiles.set(this.uri, "");
    }
    write(text: string) {
      if (mockWriteFails) throw new Error("write");
      mockFiles.set(this.uri, text);
    }
    async text() {
      return mockFiles.get(this.uri) ?? "";
    }
    delete() {
      if (mockDeleteFails) throw new Error("delete");
      mockDeleted.push(this.uri);
      mockFiles.delete(this.uri);
    }
  },
}));
jest.mock("./local-backup-export", () => ({
  exportLocalBackup: async (input: {
    writeFile: (file: { serialized: string }) => Promise<string>;
    shareFile: (uri: string) => Promise<string>;
  }) => input.shareFile(await input.writeFile({ serialized: "backup" })),
}));
jest.mock("./local-backup-restore-flow", () => ({
  loadLocalBackupRestoreCandidate: (input: { readText: () => Promise<string> }) =>
    mockReadCandidate(input),
  performLocalBackupRestore: jest.fn(),
}));
jest.mock("@/infrastructure/database/local-backup-restore", () => ({
  restoreLocalBackup: jest.fn(),
}));
jest.mock("@/infrastructure/database/local-backup-validation", () => ({
  loadCurrentDatabaseSchemaVersion: async () => 12,
}));
jest.mock("@/infrastructure/database/repository", () => ({
  listCalendarEntries: jest.fn(),
  loadProfile: jest.fn(),
}));
jest.mock("@/infrastructure/notifications/entry-notifications", () => ({
  cancelAllEntryNotifications: jest.fn(),
  syncEntryNotifications: jest.fn(),
}));

describe("backup hooks remove only their temporary file", () => {
  beforeEach(() => {
    Object.defineProperty(Platform, "OS", { value: "ios", configurable: true });
    mockFiles.clear();
    mockDeleted.length = 0;
    mockWriteFails = false;
    mockDeleteFails = false;
    mockPick.mockReset();
    mockReadCandidate.mockReset();
    jest.spyOn(Share, "share").mockResolvedValue({ action: Share.sharedAction });
  });

  it.each([Share.sharedAction, Share.dismissedAction])(
    "keeps the export until iOS finishes: %s",
    async (action) => {
      jest.mocked(Share.share).mockImplementation(async (content) => {
        expect(mockFiles.get(content.url!)).toBe("backup");
        expect(mockDeleted).toEqual([]);
        return { action };
      });
      const { result } = await renderHook(() => useLocalBackupExport());
      await act(async () => {
        await result.current.createAndShare();
      });
      expect(mockFiles.size).toBe(0);
      expect(mockDeleted).toHaveLength(1);
      expect(result.current.busy).toBe(false);
    },
  );

  it("removes partial writes without invoking the share sheet", async () => {
    mockWriteFails = true;
    const { result } = await renderHook(() => useLocalBackupExport());
    await act(async () => {
      await expect(result.current.createAndShare()).rejects.toThrow("write");
    });
    expect(Share.share).not.toHaveBeenCalled();
    expect(mockFiles.size).toBe(0);
    expect(result.current.busy).toBe(false);
  });

  it("reports a failed deletion without claiming the share failed", async () => {
    mockDeleteFails = true;
    const { result } = await renderHook(() => useLocalBackupExport());
    await act(async () => {
      await expect(result.current.createAndShare()).rejects.toMatchObject({
        operationFailed: false,
      });
    });
    expect(mockFiles.size).toBe(1);
    expect(result.current.busy).toBe(false);
  });

  it.each([false, true])(
    "removes the selected cache copy even when validation fails: %s",
    async (fail) => {
      const uri = `${mockCache}DocumentPicker/abcd-1234.json`;
      const original = "file:///app/Documents/saved.json";
      mockFiles.set(uri, "backup");
      mockFiles.set(original, "backup");
      mockPick.mockResolvedValue({
        canceled: false,
        assets: [{ uri, name: "saved.json", size: 10 }],
      });
      mockReadCandidate.mockImplementation(async ({ readText }) => {
        expect(await readText()).toBe("backup");
        if (fail) throw new Error("invalid");
        return { fileName: "saved.json" };
      });
      const { result } = await renderHook(() => useLocalBackupRestore());
      await act(async () => {
        if (fail) await expect(result.current.selectBackup()).rejects.toThrow("invalid");
        else await result.current.selectBackup();
      });
      expect(mockDeleted).toEqual([uri]);
      expect(mockFiles.get(original)).toBe("backup");
      expect(result.current.candidate).toEqual(fail ? null : { fileName: "saved.json" });
      expect(result.current.busy).toBe(false);
    },
  );

  it("does not offer restoration when deleting the picker copy fails", async () => {
    const uri = `${mockCache}DocumentPicker/abcd.json`;
    mockFiles.set(uri, "backup");
    mockDeleteFails = true;
    mockPick.mockResolvedValue({
      canceled: false,
      assets: [{ uri, name: "saved.json", size: 10 }],
    });
    mockReadCandidate.mockResolvedValue({ fileName: "saved.json" });
    const { result } = await renderHook(() => useLocalBackupRestore());
    await act(async () => {
      await expect(result.current.selectBackup()).rejects.toBeInstanceOf(BackupTempCleanupError);
    });
    expect(result.current.candidate).toBeNull();
  });

  it("does not touch files when the picker is canceled", async () => {
    mockPick.mockResolvedValue({ canceled: true });
    const { result } = await renderHook(() => useLocalBackupRestore());
    await act(async () => {
      expect(await result.current.selectBackup()).toBe("canceled");
    });
    expect(mockReadCandidate).not.toHaveBeenCalled();
    expect(mockDeleted).toEqual([]);
  });
});
