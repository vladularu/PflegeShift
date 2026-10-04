import type { SQLiteDatabase } from "expo-sqlite";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createPflegeShiftPorts } from "@/composition/create-pflegeshift-ports";
import type { CalendarEntry } from "@/domain/types";
import { tariffAnnualFixture } from "@/engine/tariff-annual-test-fixtures";
import { tvlFact } from "@/engine/tvl-shift-work-test-fixtures";

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
const remunerationMocks = vi.hoisted(() => ({
  saveCaritasMonthFacts: vi.fn(),
  saveTvlShiftWork: vi.fn(),
  saveTariffAnnualClaim: vi.fn(),
  revokeTariffAnnualClaim: vi.fn(),
  saveActualOwnAnnualPayment: vi.fn(),
  revokeActualOwnAnnualPayment: vi.fn(),
  loadRemunerationSnapshot: vi.fn(),
  saveDatedRemunerationProfile: vi.fn(),
  saveMonthlyAllowanceDecisions: vi.fn(),
  saveOvertimeAllocation: vi.fn(),
  savePaidAbsence: vi.fn(),
}));
vi.mock("@/infrastructure/database/remuneration-profile-repository", () => remunerationMocks);
vi.mock("@/infrastructure/database/remuneration-snapshot-repository", () => remunerationMocks);
vi.mock("@/infrastructure/database/allowance-decision-repository", () => remunerationMocks);
vi.mock("@/infrastructure/database/overtime-allocation-repository", () => remunerationMocks);
vi.mock("@/infrastructure/database/paid-absence-repository", () => remunerationMocks);
vi.mock("@/infrastructure/database/annual-payment-repository", () => remunerationMocks);
vi.mock("@/infrastructure/database/tariff-annual-claim-repository", () => remunerationMocks);
vi.mock("@/infrastructure/database/tvl-shift-work-repository", () => remunerationMocks);
vi.mock("@/infrastructure/database/caritas-month-facts-repository", () => remunerationMocks);
const diagnosticsMocks = vi.hoisted(() => ({ record: vi.fn() }));
const trainingMocks = vi.hoisted(() => ({
  loadTrainingSnapshot: vi.fn(),
  saveTrainingProfile: vi.fn(),
  saveShiftTraining: vi.fn(),
}));
vi.mock("@/infrastructure/database/training-repository", () => trainingMocks);
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
  it("binds TV-L confirmations to the shared database without changing services or notifications", async () => {
    const ports = createPflegeShiftPorts(database);
    const saved = tvlFact(false);
    const input = {
      shiftId: saved.shiftId,
      expectedShiftRevision: saved.shiftRevision,
      expectedShiftUpdatedAt: saved.shiftUpdatedAt,
      profileEffectiveFrom: saved.profileEffectiveFrom,
      expectedProfileRevision: saved.profileRevision,
      timeZone: saved.timeZone,
      shiftWork: false,
      expectedRevision: 0,
    };
    remunerationMocks.saveTvlShiftWork.mockResolvedValue(saved);
    await expect(ports.remuneration.saveTvlShiftWork(input)).resolves.toBe(saved);
    expect(remunerationMocks.saveTvlShiftWork).toHaveBeenCalledWith(database, input);
    expect(repositoryMocks.saveShift).not.toHaveBeenCalled();
    expect(notificationMocks.syncEntry).not.toHaveBeenCalled();
  });
  it("binds tariff claim changes to the same keyed database without calendar or notification writes", async () => {
    const ports = createPflegeShiftPorts(database);
    const input = { claim: tariffAnnualFixture().claim, actualPayment: null, expected: null };
    const saved = { ...input, revoked: false, revision: 1, updatedAt: "2026-11-01T00:00:00Z" };
    remunerationMocks.saveTariffAnnualClaim.mockResolvedValue(saved);
    await expect(ports.remuneration.saveTariffAnnualClaim(input)).resolves.toBe(saved);
    expect(remunerationMocks.saveTariffAnnualClaim).toHaveBeenCalledWith(database, input);
    await ports.remuneration.revokeTariffAnnualClaim(saved);
    expect(remunerationMocks.revokeTariffAnnualClaim).toHaveBeenCalledWith(database, saved);
    expect(repositoryMocks.saveProfile).not.toHaveBeenCalled();
    expect(repositoryMocks.saveShift).not.toHaveBeenCalled();
    expect(notificationMocks.syncEntry).not.toHaveBeenCalled();
  });
  it("binds actual annual payment confirmation and revocation to the keyed database", async () => {
    const ports = createPflegeShiftPorts(database);
    const input = {
      expected: null,
      payment: {
        paymentId: "annual",
        entitlementYear: 2026,
        payoutMonth: "2026-11",
        title: "Sonderzahlung",
        grossCents: 12345,
      },
    };
    const saved = {
      payment: { ...input.payment, version: 1 as const, revision: 1 },
      revoked: false,
      updatedAt: "2026-11-01T00:00:00Z",
    };
    remunerationMocks.saveActualOwnAnnualPayment.mockResolvedValue(saved);
    await expect(ports.remuneration.saveActualAnnualPayment(input)).resolves.toBe(saved);
    expect(remunerationMocks.saveActualOwnAnnualPayment).toHaveBeenCalledWith(database, input);
    await ports.remuneration.revokeActualAnnualPayment(saved);
    expect(remunerationMocks.revokeActualOwnAnnualPayment).toHaveBeenCalledWith(database, saved);
  });
  it("binds training and actual pause operations to the same keyed database", async () => {
    const ports = createPflegeShiftPorts(database);
    const profileInput = {
      data: {
        version: 1,
        effectiveFrom: "2026-09-01",
        birthDate: null,
        status: "unknown",
        fullTimeCompulsorySchooling: null,
        training: null,
      },
      expectedRevision: 0,
    } as const;
    const shiftInput = {
      shiftId: "shift-1",
      expectedShiftRevision: 1,
      expectedShiftDate: "2026-09-01",
      expectedShiftUpdatedAt: "2026-09-01T00:00:00Z",
      timeZone: "Europe/Berlin",
      expectedRevision: 0,
      data: { version: 1, pauses: null, school: null },
    } as const;
    await ports.training.loadSnapshot();
    await ports.training.saveProfile(profileInput);
    await ports.training.saveShift(shiftInput);
    expect(trainingMocks.loadTrainingSnapshot).toHaveBeenCalledWith(database);
    expect(trainingMocks.saveTrainingProfile).toHaveBeenCalledWith(database, profileInput);
    expect(trainingMocks.saveShiftTraining).toHaveBeenCalledWith(database, shiftInput);
  });
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("binds repository operations and optional calendar bounds to the active database", async () => {
    repositoryMocks.loadProfile.mockResolvedValue(null);
    repositoryMocks.listCalendarEntries.mockResolvedValue([]);
    const ports = createPflegeShiftPorts(database);
    const absenceInput = {
      shiftId: "absence-1",
      expectedShiftRevision: 1,
      expectedShiftDate: "2026-09-01",
      expectedShiftUpdatedAt: "2026-09-01T00:00:00Z",
      timeZone: "Europe/Berlin",
      expectedRevision: 0,
      paidMinutes: 462,
    };
    await ports.remuneration.savePaidAbsence(absenceInput);
    expect(remunerationMocks.savePaidAbsence).toHaveBeenCalledWith(database, absenceInput);

    await ports.repository.loadProfile();
    await ports.repository.listCalendarEntries("2026-08-01", "2026-09-30");

    expect(repositoryMocks.loadProfile).toHaveBeenCalledWith(database);
    expect(repositoryMocks.listCalendarEntries).toHaveBeenCalledWith(
      database,
      "2026-08-01",
      "2026-09-30",
    );
  });

  it("binds history reads and dated writes to the same database without changing input or revision", async () => {
    const ports = createPflegeShiftPorts(database);
    const input = {
      effectiveFrom: "2026-10-01",
      expectedRevision: 2,
      data: {
        version: 1,
        weeklyMinutes: 1155,
        selection: { kind: "own-monthly", monthlyGrossCents: 230000 },
      },
    } as const;
    await ports.remuneration.loadSnapshot();
    await ports.remuneration.saveProfile(input);
    expect(remunerationMocks.loadRemunerationSnapshot).toHaveBeenCalledWith(database);
    expect(remunerationMocks.saveDatedRemunerationProfile).toHaveBeenCalledWith(database, input);
    expect(repositoryMocks.saveProfile).not.toHaveBeenCalled();
    const allowanceInput = { month: "2026-09", expectedRevision: 2, decisions: [] } as const;
    await ports.remuneration.saveAllowanceDecisions(allowanceInput);
    expect(remunerationMocks.saveMonthlyAllowanceDecisions).toHaveBeenCalledWith(
      database,
      allowanceInput,
    );
    const overtimeInput = {
      shiftId: "shift-1",
      expectedShiftRevision: 4,
      expectedRevision: 2,
      timeZone: "Europe/Berlin",
      allocations: null,
    } as const;
    const saved = { ...overtimeInput, revision: 3 };
    remunerationMocks.saveOvertimeAllocation.mockResolvedValue(saved);
    await expect(ports.remuneration.saveOvertimeAllocation(overtimeInput)).resolves.toBe(saved);
    expect(remunerationMocks.saveOvertimeAllocation).toHaveBeenCalledWith(database, overtimeInput);
    expect(repositoryMocks.saveShift).not.toHaveBeenCalled();
    expect(notificationMocks.syncEntry).not.toHaveBeenCalled();
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
