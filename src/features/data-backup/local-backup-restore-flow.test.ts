import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  loadLocalBackupRestoreCandidate,
  performLocalBackupRestore,
  type LocalBackupRestoreCandidate,
} from "@/features/data-backup/local-backup-restore-flow";
import {
  LocalBackupReloadRequiredError,
  LocalBackupRestoreRecoveryError,
  LocalBackupSelectionError,
} from "@/features/data-backup/local-backup-restore-errors";
import type {
  LocalBackupPreview,
  ValidatedLocalBackup,
} from "@/infrastructure/database/local-backup-validation";
import { MAX_LOCAL_BACKUP_CHARACTERS } from "@/infrastructure/database/local-backup-validation";

const validationMocks = vi.hoisted(() => ({
  validate: vi.fn(),
}));

vi.mock("@/infrastructure/database/local-backup-validation", async (importOriginal) => ({
  ...(await importOriginal()),
  validateLocalBackup: validationMocks.validate,
}));

const preview: LocalBackupPreview = {
  createdAt: "2026-09-02T12:00:00.000Z",
  appVersion: "0.1.0",
  databaseSchemaVersion: 12,
  profileIncluded: true,
  templateCount: 7,
  shiftCount: 3,
  appointmentCount: 2,
  monthlyTariffDecisionCount: 1,
  preferenceCount: 4,
  deletedRecordCount: 1,
  firstEntryDate: "2026-09-01",
  lastEntryDate: "2026-10-01",
};
const backup = { preview } as unknown as ValidatedLocalBackup;
const candidate: LocalBackupRestoreCandidate = {
  fileName: "LUNA-Shift-Backup.json",
  backup,
  preview,
};

describe("local backup restore flow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    validationMocks.validate.mockResolvedValue(backup);
  });

  it("validates file metadata before reading personal data", async () => {
    const readText = vi.fn<() => Promise<string>>().mockResolvedValue("{}");

    await expect(
      loadLocalBackupRestoreCandidate({
        selection: { name: "backup.txt", size: 2, mimeType: "text/plain" },
        maxDatabaseSchemaVersion: 12,
        readText,
        sha256: vi.fn(),
      }),
    ).rejects.toBeInstanceOf(LocalBackupSelectionError);
    await expect(
      loadLocalBackupRestoreCandidate({
        selection: {
          name: "backup.json",
          size: MAX_LOCAL_BACKUP_CHARACTERS + 1,
          mimeType: "application/json",
        },
        maxDatabaseSchemaVersion: 12,
        readText,
        sha256: vi.fn(),
      }),
    ).rejects.toThrow("leer oder zu groß");

    expect(readText).not.toHaveBeenCalled();
    expect(validationMocks.validate).not.toHaveBeenCalled();
  });

  it("returns only a strictly validated preview candidate", async () => {
    const sha256 = vi.fn<(value: string) => Promise<string>>();
    const result = await loadLocalBackupRestoreCandidate({
      selection: { name: "LUNA-Shift-Backup.json", size: 2, mimeType: "application/json" },
      maxDatabaseSchemaVersion: 12,
      readText: () => Promise.resolve("{}"),
      sha256,
    });

    expect(validationMocks.validate).toHaveBeenCalledWith("{}", {
      maxDatabaseSchemaVersion: 12,
      sha256,
    });
    expect(result).toEqual(candidate);
  });

  it("cancels current reminders before restoring and then reloads", async () => {
    const order: string[] = [];
    const recover = vi.fn<() => Promise<void>>();
    await performLocalBackupRestore({
      candidate,
      cancelCurrentNotifications: async () => {
        order.push("cancel");
      },
      restore: async (selected) => {
        expect(selected).toBe(backup);
        order.push("restore");
      },
      recoverCurrentNotifications: recover,
      reloadApp: async () => {
        order.push("reload");
      },
    });

    expect(order).toEqual(["cancel", "restore", "reload"]);
    expect(recover).not.toHaveBeenCalled();
  });

  it("recovers previous reminders when the transactional restore fails", async () => {
    const original = new Error("restore failed");
    const recover = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
    const reload = vi.fn<() => Promise<void>>();

    await expect(
      performLocalBackupRestore({
        candidate,
        cancelCurrentNotifications: () => Promise.resolve(),
        restore: () => Promise.reject(original),
        recoverCurrentNotifications: recover,
        reloadApp: reload,
      }),
    ).rejects.toBe(original);

    expect(recover).toHaveBeenCalledTimes(1);
    expect(reload).not.toHaveBeenCalled();
  });

  it("requires a restart if reminder recovery or the final reload fails", async () => {
    await expect(
      performLocalBackupRestore({
        candidate,
        cancelCurrentNotifications: () => Promise.reject(new Error("cancel failed")),
        restore: vi.fn(),
        recoverCurrentNotifications: () => Promise.reject(new Error("recovery failed")),
        reloadApp: vi.fn(),
      }),
    ).rejects.toBeInstanceOf(LocalBackupRestoreRecoveryError);

    const recover = vi.fn<() => Promise<void>>();
    await expect(
      performLocalBackupRestore({
        candidate,
        cancelCurrentNotifications: () => Promise.resolve(),
        restore: () => Promise.resolve(),
        recoverCurrentNotifications: recover,
        reloadApp: () => Promise.reject(new Error("reload failed")),
      }),
    ).rejects.toBeInstanceOf(LocalBackupReloadRequiredError);
    expect(recover).not.toHaveBeenCalled();
  });
});
