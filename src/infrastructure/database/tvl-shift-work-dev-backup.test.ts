import { beforeEach, afterEach, describe, it, expect } from "vitest";
import { saveTvlShiftWork, listTvlShiftWork } from "./tvl-shift-work-repository";
import { generateTestRun, restoreTestBackup, setDeveloperMode } from "./dev-tools-repository";
import { parseDevBackupPayload } from "./dev-backup-payload";
import { setupTvlShiftWork, type TvlShiftWorkFixture } from "./tvl-shift-work-test-fixtures";
import { work } from "@/engine/remuneration-test-fixtures";

describe("TV-L confirmation test-lab preservation", () => {
  let f: TvlShiftWorkFixture;
  beforeEach(async () => {
    f = await setupTvlShiftWork();
    await setDeveloperMode(f.db, true);
  });
  afterEach(() => f.adapter.database.close());
  const generate = () =>
    generateTestRun(f.db, { startMonth: "2026-09", range: 1, scenario: "NORMAL_ROTATION" }, work);
  it.each([true, false, null])(
    "preserves %s through regeneration and original restore",
    async (shiftWork) => {
      const original = await saveTvlShiftWork(f.db, { ...f.input, shiftWork });
      await generate();
      const stored = await f.db.getFirstAsync<{ payload: string }>(
        "SELECT payload FROM dev_test_backups WHERE month='2026-09'",
      );
      const parsed = parseDevBackupPayload(stored!.payload, "2026-09");
      expect(parsed.version).toBe(16);
      expect(parsed.remuneration.tvlShiftWork).toHaveLength(1);
      expect(await listTvlShiftWork(f.db)).toEqual([]);
      await generate();
      await restoreTestBackup(f.db, ["2026-09"]);
      expect(await listTvlShiftWork(f.db)).toEqual([original]);
    },
  );
  it("reads pre-confirmation v6 snapshots with an empty confirmation list", async () => {
    await generate();
    const row = await f.db.getFirstAsync<{ payload: string }>(
      "SELECT payload FROM dev_test_backups WHERE month='2026-09'",
    );
    const payload = JSON.parse(row!.payload);
    payload.version = 6;
    delete payload.remuneration.tvlShiftWork;
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
      parseDevBackupPayload(JSON.stringify(payload), "2026-09").remuneration.tvlShiftWork,
    ).toEqual([]);
    payload.remuneration.tvlShiftWork = [];
    expect(() => parseDevBackupPayload(JSON.stringify(payload), "2026-09")).toThrow();
  });
  it("rolls back a failed original restore without consuming the saved original", async () => {
    const original = await saveTvlShiftWork(f.db, f.input);
    await generate();
    f.adapter.fail = "INSERT INTO tvl_shift_work";
    await expect(restoreTestBackup(f.db, ["2026-09"])).rejects.toThrow("injected");
    expect(await listTvlShiftWork(f.db)).toEqual([]);
    expect(
      await f.db.getFirstAsync("SELECT month FROM dev_test_backups WHERE month='2026-09'"),
    ).not.toBeNull();
    f.adapter.fail = null;
    await restoreTestBackup(f.db, ["2026-09"]);
    expect(await listTvlShiftWork(f.db)).toEqual([original]);
  });
  it("rejects future profile references in the original snapshot and rolls back the month", async () => {
    await saveTvlShiftWork(f.db, f.input);
    await generate();
    const row = await f.db.getFirstAsync<{ payload: string }>(
      "SELECT payload FROM dev_test_backups WHERE month='2026-09'",
    );
    const payload = JSON.parse(row!.payload);
    const confirmation = payload.remuneration.tvlShiftWork[0];
    const parsed = JSON.parse(confirmation.confirmation_json);
    parsed.profileRevision = 999;
    confirmation.confirmation_json = JSON.stringify(parsed);
    await f.db.runAsync(
      "UPDATE dev_test_backups SET payload=? WHERE month='2026-09'",
      JSON.stringify(payload),
    );
    const before = f.adapter.database.prepare("SELECT * FROM shift_entries ORDER BY id").all();
    await expect(restoreTestBackup(f.db, ["2026-09"])).rejects.toThrow("Profilreferenz");
    expect(f.adapter.database.prepare("SELECT * FROM shift_entries ORDER BY id").all()).toEqual(
      before,
    );
    expect(await listTvlShiftWork(f.db)).toEqual([]);
    expect(
      await f.db.getFirstAsync("SELECT month FROM dev_test_backups WHERE month='2026-09'"),
    ).not.toBeNull();
  });
});
