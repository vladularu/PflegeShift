import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { SaveCaritasOvertimeInput } from "@/domain/saved-caritas-overtime";
import { work } from "@/engine/remuneration-test-fixtures";
import { saveShift } from "./calendar-entry-repository";
import { listCaritasOvertime, saveCaritasOvertime } from "./caritas-overtime-repository";
import { parseDevBackupPayload } from "./dev-backup-payload";
import { generateTestRun, restoreTestBackup, setDeveloperMode } from "./dev-tools-repository";
import { saveOvertimeAllocation } from "./overtime-allocation-repository";
import { saveDatedRemunerationProfile } from "./remuneration-profile-repository";
import { setupTvlShiftWork, type TvlShiftWorkFixture } from "./tvl-shift-work-test-fixtures";

describe("Caritas overtime confirmation in test-laboratory backup v10", () => {
  let f: TvlShiftWorkFixture;
  let input: SaveCaritasOvertimeInput;
  const generate = () =>
    generateTestRun(f.db, { startMonth: "2026-09", range: 1, scenario: "NORMAL_ROTATION" }, work);
  const stored = async () => {
    const row = await f.db.getFirstAsync<{ payload: string }>(
      "SELECT payload FROM dev_test_backups WHERE month='2026-09'",
    );
    return row!.payload;
  };

  beforeEach(async () => {
    f = await setupTvlShiftWork();
    await setDeveloperMode(f.db, true);
    const profile = await saveDatedRemunerationProfile(f.db, {
      effectiveFrom: "2026-09-01",
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
      throw new Error("Das Testprofil benötigt ein Gültigkeitsdatum.");
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

  it("keeps the original confirmation through repeated generation and restore", async () => {
    const saved = await saveCaritasOvertime(f.db, input);
    await generate();
    const payload = parseDevBackupPayload(await stored(), "2026-09");
    expect(payload.version).toBe(16);
    expect(payload.remuneration.caritasOvertime).toHaveLength(1);
    expect(await listCaritasOvertime(f.db)).toEqual([]);
    await generate();
    await restoreTestBackup(f.db, ["2026-09"]);
    expect(await listCaritasOvertime(f.db)).toEqual([saved]);
  });

  it("accepts a v9 payload without inventing a confirmation", async () => {
    await saveCaritasOvertime(f.db, input);
    await generate();
    const payload = JSON.parse(await stored());
    payload.version = 9;
    delete payload.remuneration.caritasOvertime;
    delete payload.remuneration.tvoedAnnexAMonthConfirmations;
    delete payload.remuneration.tvoedSueMonthConfirmations;
    delete payload.remuneration.tvoedSueAllowanceConfirmations;
    delete payload.remuneration.tvoedAnnexAPremiumFacts;
    delete payload.remuneration.drkEmployeeMonthConfirmations;
    delete payload.remuneration.drkTrainingMonthConfirmations;
    expect(
      parseDevBackupPayload(JSON.stringify(payload), "2026-09").remuneration.caritasOvertime,
    ).toEqual([]);
    payload.remuneration.caritasOvertime = [];
    expect(() => parseDevBackupPayload(JSON.stringify(payload), "2026-09")).toThrow();
  });

  it.each(["missing", "duplicate", "orphan", "future", "invalid", "key"])(
    "rejects %s before replacing any test-month data",
    async (mutation) => {
      await saveCaritasOvertime(f.db, input);
      await generate();
      const payload = JSON.parse(await stored());
      const rows = payload.remuneration.caritasOvertime;
      const row = rows[0];
      const value = JSON.parse(row.confirmation_json);
      if (mutation === "missing") delete payload.remuneration.caritasOvertime;
      if (mutation === "duplicate") rows.push({ ...row });
      if (mutation === "orphan") value.profileEffectiveFrom = "2025-01-01";
      if (mutation === "future") value.allocationRevision = 999;
      if (mutation === "invalid") value.workSettlement = "UNKNOWN";
      if (mutation === "key") row.shift_id = "other";
      row.confirmation_json = JSON.stringify(value);
      await f.db.runAsync(
        "UPDATE dev_test_backups SET payload=? WHERE month='2026-09'",
        JSON.stringify(payload),
      );
      const before = f.adapter.database.prepare("SELECT * FROM shift_entries ORDER BY id").all();
      await expect(restoreTestBackup(f.db, ["2026-09"])).rejects.toThrow();
      expect(f.adapter.database.prepare("SELECT * FROM shift_entries ORDER BY id").all()).toEqual(
        before,
      );
    },
  );

  it("rolls back a failed restore and keeps the original backup", async () => {
    const saved = await saveCaritasOvertime(f.db, input);
    await generate();
    f.adapter.fail = "INSERT INTO caritas_overtime";
    await expect(restoreTestBackup(f.db, ["2026-09"])).rejects.toThrow("injected");
    expect(await stored()).toBeTruthy();
    f.adapter.fail = null;
    await restoreTestBackup(f.db, ["2026-09"]);
    expect(await listCaritasOvertime(f.db)).toEqual([saved]);
  });
});
