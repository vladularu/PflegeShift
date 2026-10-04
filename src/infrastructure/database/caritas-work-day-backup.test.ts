import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { saveShift } from "./calendar-entry-repository";
import { listCaritasWorkDays, saveCaritasWorkDay } from "./caritas-work-day-repository";
import { loadLocalBackupSnapshot } from "./local-backup";
import { restoreLocalBackup } from "./local-backup-restore";
import {
  exportTvlBackup,
  resignTvlBackup,
  setupTvlShiftWork,
  validateTvlBackup,
  type TvlShiftWorkFixture,
} from "./tvl-shift-work-test-fixtures";

describe("Caritas work-day confirmation backup v10", () => {
  let f: TvlShiftWorkFixture;
  beforeEach(async () => {
    f = await setupTvlShiftWork();
  });
  afterEach(() => f.adapter.database.close());
  const input = (fixture: TvlShiftWorkFixture) => ({
    shiftId: fixture.shift.id,
    date: fixture.shift.date,
    expectedShiftRevision: fixture.shift.revision,
    expectedShiftUpdatedAt: fixture.shift.updatedAt,
    timeZone: "Europe/Berlin",
    holidayTimeOff: false as boolean | null,
    shiftWork: true as boolean | null,
    expectedRevision: 0,
  });

  it("round-trips confirmed false and stale shift history without changing other data", async () => {
    const saved = await saveCaritasWorkDay(f.db, { ...input(f), shiftWork: false });
    await saveShift(f.db, { ...f.shift, expectedRevision: f.shift.revision, endTime: "20:00" });
    const before = await loadLocalBackupSnapshot(f.db);
    const exported = await exportTvlBackup(f);
    expect(exported.document).toMatchObject({ version: 19, databaseSchemaVersion: 31 });
    expect(exported.document.data.caritasWorkDays).toHaveLength(1);
    await f.db.runAsync("DELETE FROM caritas_work_days");
    await restoreLocalBackup(f.db, await validateTvlBackup(exported.serialized));
    expect(await listCaritasWorkDays(f.db)).toEqual([saved]);
    expect(await loadLocalBackupSnapshot(f.db)).toEqual(before);
  });

  it("restores v9 without inventing or retaining Caritas decisions", async () => {
    await saveCaritasWorkDay(f.db, input(f));
    const exported = await exportTvlBackup(f);
    const legacy = await resignTvlBackup(exported.serialized, (root) => {
      root.version = 9;
      root.databaseSchemaVersion = 22;
      delete root.data.caritasWorkDays;
      delete root.data.caritasMonthFacts;
      delete root.data.caritasOvertime;
      delete root.data.tvoedAnnexAMonthConfirmations;
      delete root.data.tvoedSueMonthConfirmations;
      delete root.data.tvoedSueAllowanceConfirmations;
    });
    const checked = await validateTvlBackup(legacy);
    expect(checked.document.data.caritasWorkDays).toBeUndefined();
    await restoreLocalBackup(f.db, checked);
    expect(await listCaritasWorkDays(f.db)).toEqual([]);
  });

  it.each(["duplicate", "future", "key", "value", "missing", "schema"])(
    "rejects %s in a re-signed backup without touching local data",
    async (mutation) => {
      await saveCaritasWorkDay(f.db, input(f));
      const exported = await exportTvlBackup(f);
      const before = await loadLocalBackupSnapshot(f.db);
      const changed = await resignTvlBackup(exported.serialized, (root) => {
        const rows = root.data.caritasWorkDays as Record<string, unknown>[];
        const row = rows[0];
        const data = JSON.parse(row.confirmation_json as string);
        if (mutation === "duplicate") rows.push({ ...row });
        if (mutation === "future") data.shiftRevision = 999;
        if (mutation === "key") row.date = "2026-09-20";
        if (mutation === "value") data.holidayTimeOff = "yes";
        if (mutation === "missing") delete root.data.caritasWorkDays;
        if (mutation === "schema") root.databaseSchemaVersion = 22;
        row.confirmation_json = JSON.stringify(data);
      });
      await expect(validateTvlBackup(changed)).rejects.toThrow();
      expect(await loadLocalBackupSnapshot(f.db)).toEqual(before);
    },
  );

  it("rolls an import failure back atomically", async () => {
    await saveCaritasWorkDay(f.db, input(f));
    const checked = await validateTvlBackup((await exportTvlBackup(f)).serialized);
    await saveCaritasWorkDay(f.db, { ...input(f), expectedRevision: 1, shiftWork: false });
    const before = await loadLocalBackupSnapshot(f.db);
    f.adapter.fail = "INSERT INTO caritas_work_days";
    await expect(restoreLocalBackup(f.db, checked)).rejects.toThrow("injected");
    expect(await loadLocalBackupSnapshot(f.db)).toEqual(before);
    expect(f.adapter.database.inTransaction).toBe(false);
  });
});
