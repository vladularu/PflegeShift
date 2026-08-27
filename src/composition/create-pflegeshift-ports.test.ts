import type { SQLiteDatabase } from "expo-sqlite";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createPflegeShiftPorts } from "@/composition/create-pflegeshift-ports";
import type { CalendarEntry } from "@/domain/types";

const repositoryMocks = vi.hoisted(() => ({
  deleteCalendarEntry: vi.fn(),
  deleteTemplate: vi.fn(),
  listCalendarEntries: vi.fn(),
  listMonthlyTariffDecisions: vi.fn(),
  listTemplates: vi.fn(),
  loadProfile: vi.fn(),
  loadTvoedWorkPatternSettings: vi.fn(),
  restoreCalendarEntry: vi.fn(),
  restoreTemplate: vi.fn(),
  saveAppointment: vi.fn(),
  saveMonthlyTariffDecision: vi.fn(),
  saveProfile: vi.fn(),
  saveShift: vi.fn(),
  saveTemplate: vi.fn(),
  saveTvoedWorkPatternSettings: vi.fn(),
  swapTemplateSortOrder: vi.fn(),
}));
const notificationMocks = vi.hoisted(() => ({
  cancelEntry: vi.fn(),
  syncEntry: vi.fn(),
}));
const diagnosticsMocks = vi.hoisted(() => ({ record: vi.fn() }));
const devToolsMocks = vi.hoisted(() => ({
  listBackupMonths: vi.fn(),
  shouldLoadState: vi.fn(),
}));

vi.mock("@/infrastructure/database/repository", () => repositoryMocks);
vi.mock("@/infrastructure/database/test-backup-status-repository", () => ({
  listTestBackupMonths: devToolsMocks.listBackupMonths,
}));
vi.mock("@/infrastructure/dev-tools-policy", () => ({
  DEV_TOOLS_AVAILABLE: true,
  shouldLoadDevToolState: devToolsMocks.shouldLoadState,
}));
vi.mock("@/infrastructure/diagnostics", () => ({
  recordDiagnostic: diagnosticsMocks.record,
}));
vi.mock("@/infrastructure/notifications/entry-notifications", () => ({
  cancelEntryNotifications: notificationMocks.cancelEntry,
  syncEntryNotifications: notificationMocks.syncEntry,
}));

const database = {} as SQLiteDatabase;
const entry = { id: "entry-1", kind: "APPOINTMENT" } as CalendarEntry;

describe("createPflegeShiftPorts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("binds repository operations and optional calendar bounds to the active database", async () => {
    repositoryMocks.loadProfile.mockResolvedValue(null);
    repositoryMocks.listCalendarEntries.mockResolvedValue([]);
    const ports = createPflegeShiftPorts(database);

    await ports.repository.loadProfile();
    await ports.repository.listCalendarEntries("2026-08-01", "2026-09-30");

    expect(repositoryMocks.loadProfile).toHaveBeenCalledWith(database);
    expect(repositoryMocks.listCalendarEntries).toHaveBeenCalledWith(
      database,
      "2026-08-01",
      "2026-09-30",
    );
  });

  it("binds notifications and diagnostics without leaking the database into application calls", async () => {
    notificationMocks.syncEntry.mockResolvedValue(undefined);
    notificationMocks.cancelEntry.mockResolvedValue(undefined);
    const ports = createPflegeShiftPorts(database);
    const error = new Error("offline");

    await ports.notifications.syncEntry(entry, "Europe/Berlin");
    await ports.notifications.cancelEntry(entry);
    ports.diagnostics.record("notifications", "ENTRY_NOTIFICATION_SYNC_FAILED", error);

    expect(notificationMocks.syncEntry).toHaveBeenCalledWith(database, entry, "Europe/Berlin");
    expect(notificationMocks.cancelEntry).toHaveBeenCalledWith(database, entry);
    expect(diagnosticsMocks.record).toHaveBeenCalledWith(
      "notifications",
      "ENTRY_NOTIFICATION_SYNC_FAILED",
      error,
    );
  });

  it("keeps the build policy and backup lookup inside the composition boundary", async () => {
    devToolsMocks.shouldLoadState.mockReturnValue(true);
    devToolsMocks.listBackupMonths.mockResolvedValue(["2026-08"]);
    const ports = createPflegeShiftPorts(database);

    expect(ports.devTools.shouldLoadState(true, 2)).toBe(true);
    await expect(ports.devTools.listBackupMonths()).resolves.toEqual(["2026-08"]);

    expect(devToolsMocks.shouldLoadState).toHaveBeenCalledWith(true, true, 2);
    expect(devToolsMocks.listBackupMonths).toHaveBeenCalledWith(database);
  });
});
