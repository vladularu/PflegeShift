import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { SaveCaritasOvertimeInput } from "@/domain/saved-caritas-overtime";
import { saveShift } from "./calendar-entry-repository";
import { listCaritasOvertime, saveCaritasOvertime } from "./caritas-overtime-repository";
import { loadLocalBackupSnapshot } from "./local-backup";
import { restoreLocalBackup } from "./local-backup-restore";
import { saveOvertimeAllocation } from "./overtime-allocation-repository";
import { saveDatedRemunerationProfile } from "./remuneration-profile-repository";
import {
  exportTvlBackup,
  resignTvlBackup,
  setupTvlShiftWork,
  validateTvlBackup,
  type TvlShiftWorkFixture,
} from "./tvl-shift-work-test-fixtures";

describe("Caritas overtime confirmation in local backup v13", () => {
  let f: TvlShiftWorkFixture;
  let input: SaveCaritasOvertimeInput;

  beforeEach(async () => {
    f = await setupTvlShiftWork();
    if (f.profile.effectiveFrom === null)
      throw new Error("Das Testprofil benötigt ein Gültigkeitsdatum.");
    const profile = await saveDatedRemunerationProfile(f.db, {
      effectiveFrom: f.profile.effectiveFrom,
      expectedRevision: f.profile.revision,
      data: {
        version: 1,
        weeklyMinutes: 2340,
        selection: {
          kind: "tariff",
          packageId: "avr-caritas-p-mitte",
          variant: "ANLAGE_31",
          region: "MITTE",
          group: "p7",
          level: "5",
          fullTimeWeeklyMinutes: 2340,
        },
      },
    });
    if (profile.effectiveFrom === null)
      throw new Error("Das Caritas-Testprofil benötigt ein Gültigkeitsdatum.");
    const shift = await saveShift(f.db, {
      ...f.shift,
      expectedRevision: f.shift.revision,
      overtimeMinutes: 60,
      tariffOvertimeConfirmed: true,
    });
    if (shift.updatedAt === null)
      throw new Error("Der Testdienst benötigt einen Änderungszeitpunkt.");
    const allocation = await saveOvertimeAllocation(f.db, {
      shiftId: shift.id,
      expectedShiftRevision: shift.revision,
      timeZone: "Europe/Berlin",
      allocations: [{ date: shift.date, minutes: 60 }],
      expectedRevision: 0,
    });
    input = {
      shiftId: shift.id,
      expectedShiftRevision: shift.revision,
      expectedShiftUpdatedAt: shift.updatedAt,
      timeZone: "Europe/Berlin",
      expectedAllocationRevision: allocation.revision,
      profileEffectiveFrom: profile.effectiveFrom,
      expectedProfileRevision: profile.revision,
      ruleVersionId: "2026-02-01-draft1",
      classificationCase: "SHIFT_PLAN",
      employerOrderConfirmed: true,
      applicableRuleConfirmed: true,
      workSettlement: "CASH",
      premiumSettlement: "TIME",
      workPayoutMonth: "2026-10",
      premiumPayoutMonth: null,
      expectedRevision: 0,
    };
  });
  afterEach(() => f.adapter.database.close());

  it("round-trips the exact confirmation and all other user data", async () => {
    const saved = await saveCaritasOvertime(f.db, input);
    const before = await loadLocalBackupSnapshot(f.db);
    const exported = await exportTvlBackup(f);
    expect(exported.document).toMatchObject({ version: 19, databaseSchemaVersion: 31 });
    expect(exported.document.data.caritasOvertime).toHaveLength(1);
    await f.db.runAsync("DELETE FROM caritas_overtime");
    await restoreLocalBackup(f.db, await validateTvlBackup(exported.serialized));
    expect(await listCaritasOvertime(f.db)).toEqual([saved]);
    expect(await loadLocalBackupSnapshot(f.db)).toEqual(before);
  });

  it("restores v12 without inventing or retaining an overtime confirmation", async () => {
    await saveCaritasOvertime(f.db, input);
    const exported = await exportTvlBackup(f);
    const legacy = await resignTvlBackup(exported.serialized, (root) => {
      root.version = 12;
      root.databaseSchemaVersion = 24;
      delete root.data.caritasOvertime;
      delete root.data.tvoedAnnexAMonthConfirmations;
      delete root.data.tvoedSueMonthConfirmations;
      delete root.data.tvoedSueAllowanceConfirmations;
    });
    const checked = await validateTvlBackup(legacy);
    expect(checked.document.data.caritasOvertime).toBeUndefined();
    await restoreLocalBackup(f.db, checked);
    expect(await listCaritasOvertime(f.db)).toEqual([]);
  });

  it.each(["missing", "duplicate", "orphan", "key", "invalid", "future", "schema"])(
    "rejects %s even when the backup checksum is valid",
    async (mutation) => {
      await saveCaritasOvertime(f.db, input);
      const exported = await exportTvlBackup(f);
      const before = await loadLocalBackupSnapshot(f.db);
      const changed = await resignTvlBackup(exported.serialized, (root) => {
        const rows = root.data.caritasOvertime as Record<string, unknown>[];
        const row = rows[0];
        const value = JSON.parse(row.confirmation_json as string) as Record<string, unknown>;
        if (mutation === "missing") delete root.data.caritasOvertime;
        if (mutation === "duplicate") rows.push({ ...row });
        if (mutation === "orphan") value.profileEffectiveFrom = "2025-01-01";
        if (mutation === "key") row.shift_id = "other";
        if (mutation === "invalid") value.workSettlement = "UNKNOWN";
        if (mutation === "future") value.allocationRevision = 999;
        if (mutation === "schema") root.databaseSchemaVersion = 24;
        row.confirmation_json = JSON.stringify(value);
      });
      await expect(validateTvlBackup(changed)).rejects.toThrow();
      expect(await loadLocalBackupSnapshot(f.db)).toEqual(before);
    },
  );

  it("rolls a failed replacement back including the original confirmation", async () => {
    await saveCaritasOvertime(f.db, input);
    const checked = await validateTvlBackup((await exportTvlBackup(f)).serialized);
    await saveCaritasOvertime(f.db, {
      ...input,
      expectedRevision: 1,
      workSettlement: "TIME",
      workPayoutMonth: null,
    });
    const before = await loadLocalBackupSnapshot(f.db);
    f.adapter.fail = "INSERT INTO caritas_overtime";
    await expect(restoreLocalBackup(f.db, checked)).rejects.toThrow("injected");
    expect(await loadLocalBackupSnapshot(f.db)).toEqual(before);
    expect(f.adapter.database.inTransaction).toBe(false);
  });
});
