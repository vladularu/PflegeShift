import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { work } from "@/engine/remuneration-test-fixtures";
import { parseDevBackupPayload } from "./dev-backup-payload";
import { generateTestRun, restoreTestBackup, setDeveloperMode } from "./dev-tools-repository";
import { saveDatedRemunerationProfile } from "./remuneration-profile-repository";
import {
  listDrkEmployeeMonthConfirmations,
  saveDrkEmployeeMonthConfirmation,
} from "./drk-employee-month-confirmation-repository";
import { setupTvlShiftWork, type TvlShiftWorkFixture } from "./tvl-shift-work-test-fixtures";

describe("DRK employee confirmations in test laboratory backup v16", () => {
  let f: TvlShiftWorkFixture;
  let profileRevision: number;
  beforeEach(async () => {
    f = await setupTvlShiftWork();
    await setDeveloperMode(f.db, true);
    const profile = await saveDatedRemunerationProfile(f.db, {
      effectiveFrom: "2026-10-01",
      expectedRevision: 0,
      data: {
        version: 1,
        weeklyMinutes: 1200,
        selection: {
          kind: "tariff",
          packageId: "drk-rtv-p",
          variant: "ANLAGE_A2",
          region: "BTG",
          group: "P6",
          level: "1",
          fullTimeWeeklyMinutes: 2340,
        },
      },
    });
    profileRevision = profile.revision;
  });
  afterEach(() => f.adapter.database.close());
  const answer = () => ({
    month: "2026-10",
    profileEffectiveFrom: "2026-10-01",
    expectedProfileRevision: profileRevision,
    ruleVersionId: "2026-10-01-draft1",
    drkApplicabilityConfirmed: true as boolean | null,
    annexAssignmentConfirmed: true as boolean | null,
    payGroupAndStepConfirmed: true as boolean | null,
    weeklyTimeBasisConfirmed: null as boolean | null,
    fullMonthBaseEntitlementConfirmed: true as boolean | null,
    expectedRevision: 0,
  });
  const generate = () =>
    generateTestRun(f.db, { startMonth: "2026-10", range: 1, scenario: "NORMAL_ROTATION" }, work);
  const stored = async () => {
    const row = await f.db.getFirstAsync<{ payload: string }>(
      "SELECT payload FROM dev_test_backups WHERE month='2026-10'",
    );
    return row!.payload;
  };

  it("restores the exact original after repeated test generation", async () => {
    const original = await saveDrkEmployeeMonthConfirmation(f.db, answer());
    await generate();
    const backup = parseDevBackupPayload(await stored(), "2026-10");
    expect(backup.version).toBe(16);
    expect(backup.remuneration.drkEmployeeMonthConfirmations).toHaveLength(1);
    expect(await listDrkEmployeeMonthConfirmations(f.db)).toEqual([]);
    await generate();
    await restoreTestBackup(f.db, ["2026-10"]);
    expect(await listDrkEmployeeMonthConfirmations(f.db)).toEqual([original]);
  });

  it("reads old v14 without a new answer but rejects undeclared fields", async () => {
    await generate();
    const payload = JSON.parse(await stored());
    payload.version = 14;
    delete payload.remuneration.drkEmployeeMonthConfirmations;
    delete payload.remuneration.drkTrainingMonthConfirmations;
    expect(
      parseDevBackupPayload(JSON.stringify(payload), "2026-10").remuneration
        .drkEmployeeMonthConfirmations,
    ).toEqual([]);
    payload.remuneration.drkEmployeeMonthConfirmations = [];
    expect(() => parseDevBackupPayload(JSON.stringify(payload), "2026-10")).toThrow();
  });

  it.each(["missing", "duplicate", "wrong-month", "invalid"])(
    "rejects %s before replacing the test month",
    async (mutation) => {
      await saveDrkEmployeeMonthConfirmation(f.db, answer());
      await generate();
      const payload = JSON.parse(await stored());
      const rows = payload.remuneration.drkEmployeeMonthConfirmations;
      const row = rows[0];
      const parsed = JSON.parse(row.confirmation_json);
      if (mutation === "missing") delete payload.remuneration.drkEmployeeMonthConfirmations;
      if (mutation === "duplicate") rows.push({ ...row });
      if (mutation === "wrong-month") row.month = "2026-11";
      if (mutation === "invalid") parsed.weeklyTimeBasisConfirmed = "maybe";
      row.confirmation_json = JSON.stringify(parsed);
      await f.db.runAsync(
        "UPDATE dev_test_backups SET payload=? WHERE month='2026-10'",
        JSON.stringify(payload),
      );
      const before = f.adapter.database.prepare("SELECT * FROM shift_entries ORDER BY id").all();
      await expect(restoreTestBackup(f.db, ["2026-10"])).rejects.toThrow();
      expect(f.adapter.database.prepare("SELECT * FROM shift_entries ORDER BY id").all()).toEqual(
        before,
      );
    },
  );
});
