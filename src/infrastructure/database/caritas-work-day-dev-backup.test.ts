import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { work } from "@/engine/remuneration-test-fixtures";
import { listCaritasWorkDays, saveCaritasWorkDay } from "./caritas-work-day-repository";
import { DEV_BACKUP_VERSION, parseDevBackupPayload } from "./dev-backup-payload";
import { generateTestRun, restoreTestBackup, setDeveloperMode } from "./dev-tools-repository";
import { setupTvlShiftWork, type TvlShiftWorkFixture } from "./tvl-shift-work-test-fixtures";

describe("Caritas confirmations in the test laboratory", () => {
  let f: TvlShiftWorkFixture;
  beforeEach(async () => {
    f = await setupTvlShiftWork();
    await setDeveloperMode(f.db, true);
  });
  afterEach(() => f.adapter.database.close());
  const generate = () =>
    generateTestRun(f.db, { startMonth: "2026-09", range: 1, scenario: "NORMAL_ROTATION" }, work);
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
  const storedPayload = async () => {
    const row = await f.db.getFirstAsync<{ payload: string }>(
      "SELECT payload FROM dev_test_backups WHERE month='2026-09'",
    );
    return row!.payload;
  };

  it.each([true, false, null])(
    "restores an original %s after repeated generation",
    async (shiftWork) => {
      const original = await saveCaritasWorkDay(f.db, { ...input(f), shiftWork });
      await generate();
      const payload = parseDevBackupPayload(await storedPayload(), "2026-09");
      expect(payload.version).toBe(DEV_BACKUP_VERSION);
      expect(payload.remuneration.caritasWorkDays).toHaveLength(1);
      expect(await listCaritasWorkDays(f.db)).toEqual([]);
      await generate();
      await restoreTestBackup(f.db, ["2026-09"]);
      expect(await listCaritasWorkDays(f.db)).toEqual([original]);
    },
  );

  it("accepts v7 without inventing a decision and rejects an extra v7 field", async () => {
    await generate();
    const payload = JSON.parse(await storedPayload());
    payload.version = 7;
    delete payload.remuneration.caritasWorkDays;
    delete payload.remuneration.caritasMonthFacts;
    delete payload.remuneration.caritasOvertime;
    delete payload.remuneration.tvoedAnnexAMonthConfirmations;
    delete payload.remuneration.tvoedSueMonthConfirmations;
    delete payload.remuneration.tvoedSueAllowanceConfirmations;
    delete payload.remuneration.tvoedAnnexAPremiumFacts;
    delete payload.remuneration.drkEmployeeMonthConfirmations;
    delete payload.remuneration.drkTrainingMonthConfirmations;
    expect(
      parseDevBackupPayload(JSON.stringify(payload), "2026-09").remuneration.caritasWorkDays,
    ).toEqual([]);
    payload.remuneration.caritasWorkDays = [];
    expect(() => parseDevBackupPayload(JSON.stringify(payload), "2026-09")).toThrow();
  });

  it.each(["orphan", "future", "duplicate", "key", "invalid"])(
    "rejects a %s decision before replacing the test month",
    async (mutation) => {
      await saveCaritasWorkDay(f.db, input(f));
      await generate();
      const payload = JSON.parse(await storedPayload());
      const rows = payload.remuneration.caritasWorkDays;
      const row = rows[0];
      const parsed = JSON.parse(row.confirmation_json);
      if (mutation === "orphan") {
        row.shift_id = "missing";
        parsed.shiftId = "missing";
      }
      if (mutation === "future") parsed.shiftRevision = 999;
      if (mutation === "duplicate") rows.push({ ...row });
      if (mutation === "key") row.date = "2026-09-20";
      if (mutation === "invalid") parsed.shiftWork = "yes";
      row.confirmation_json = JSON.stringify(parsed);
      await f.db.runAsync(
        "UPDATE dev_test_backups SET payload=? WHERE month='2026-09'",
        JSON.stringify(payload),
      );
      const before = f.adapter.database.prepare("SELECT * FROM shift_entries ORDER BY id").all();
      await expect(restoreTestBackup(f.db, ["2026-09"])).rejects.toThrow();
      expect(f.adapter.database.prepare("SELECT * FROM shift_entries ORDER BY id").all()).toEqual(
        before,
      );
      expect(await listCaritasWorkDays(f.db)).toEqual([]);
    },
  );

  it("rolls a failed restoration back without consuming the original", async () => {
    const original = await saveCaritasWorkDay(f.db, input(f));
    await generate();
    f.adapter.fail = "INSERT INTO caritas_work_days";
    await expect(restoreTestBackup(f.db, ["2026-09"])).rejects.toThrow("injected");
    expect(await listCaritasWorkDays(f.db)).toEqual([]);
    expect(
      await f.db.getFirstAsync("SELECT month FROM dev_test_backups WHERE month='2026-09'"),
    ).not.toBeNull();
    f.adapter.fail = null;
    await restoreTestBackup(f.db, ["2026-09"]);
    expect(await listCaritasWorkDays(f.db)).toEqual([original]);
  });
});
