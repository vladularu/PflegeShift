import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { work } from "@/engine/remuneration-test-fixtures";
import { DEV_BACKUP_VERSION, parseDevBackupPayload } from "./dev-backup-payload";
import { generateTestRun, restoreTestBackup, setDeveloperMode } from "./dev-tools-repository";
import { saveDatedRemunerationProfile } from "./remuneration-profile-repository";
import {
  listTvoedAnnexAMonthConfirmations,
  saveTvoedAnnexAMonthConfirmation,
} from "./tvoed-annex-a-month-confirmation-repository";
import { setupTvlShiftWork, type TvlShiftWorkFixture } from "./tvl-shift-work-test-fixtures";

describe("TVöD Anlage A month confirmations in test laboratory backup v11", () => {
  let f: TvlShiftWorkFixture;
  let profileRevision: number;
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
          packageId: "tvoed-vka-anlage-a",
          variant: "BT_K",
          region: "VKA",
          group: "EG5",
          level: "2",
          fullTimeWeeklyMinutes: 2340,
        },
      },
    });
    profileRevision = profile.revision;
  });
  afterEach(() => f.adapter.database.close());
  const answer = () => ({
    month: "2026-09",
    profileEffectiveFrom: "2026-09-01",
    expectedProfileRevision: profileRevision,
    ruleVersionId: "2026-05-01-draft1",
    applicabilityConfirmed: true as boolean | null,
    comparableFullTimeConfirmed: true as boolean | null,
    fullMonthBaseEntitlementConfirmed: true as boolean | null,
    fullMonthSameContractConfirmed: true as boolean | null,
    expectedRevision: 0,
  });
  const generate = () =>
    generateTestRun(f.db, { startMonth: "2026-09", range: 1, scenario: "NORMAL_ROTATION" }, work);
  const stored = async () => {
    const row = await f.db.getFirstAsync<{ payload: string }>(
      "SELECT payload FROM dev_test_backups WHERE month='2026-09'",
    );
    return row!.payload;
  };

  it("restores the exact original after repeated test generation", async () => {
    const original = await saveTvoedAnnexAMonthConfirmation(f.db, answer());
    await generate();
    const backup = parseDevBackupPayload(await stored(), "2026-09");
    expect(backup.version).toBe(DEV_BACKUP_VERSION);
    expect(backup.remuneration.tvoedAnnexAMonthConfirmations).toHaveLength(1);
    expect(await listTvoedAnnexAMonthConfirmations(f.db)).toEqual([]);
    await generate();
    await restoreTestBackup(f.db, ["2026-09"]);
    expect(await listTvoedAnnexAMonthConfirmations(f.db)).toEqual([original]);
  });

  it("reads v10 without a new answer, but rejects undeclared v10 fields", async () => {
    await generate();
    const payload = JSON.parse(await stored());
    payload.version = 10;
    delete payload.remuneration.tvoedAnnexAMonthConfirmations;
    delete payload.remuneration.tvoedSueMonthConfirmations;
    delete payload.remuneration.tvoedSueAllowanceConfirmations;
    delete payload.remuneration.tvoedAnnexAPremiumFacts;
    delete payload.remuneration.drkEmployeeMonthConfirmations;
    delete payload.remuneration.drkTrainingMonthConfirmations;
    expect(
      parseDevBackupPayload(JSON.stringify(payload), "2026-09").remuneration
        .tvoedAnnexAMonthConfirmations,
    ).toEqual([]);
    payload.remuneration.tvoedAnnexAMonthConfirmations = [];
    expect(() => parseDevBackupPayload(JSON.stringify(payload), "2026-09")).toThrow();
  });

  it.each(["missing", "duplicate", "wrong-month", "invalid", "key"])(
    "rejects %s before replacing test-month data",
    async (mutation) => {
      await saveTvoedAnnexAMonthConfirmation(f.db, answer());
      await generate();
      const payload = JSON.parse(await stored());
      const rows = payload.remuneration.tvoedAnnexAMonthConfirmations;
      const row = rows[0];
      const value = JSON.parse(row.confirmation_json);
      if (mutation === "missing") delete payload.remuneration.tvoedAnnexAMonthConfirmations;
      if (mutation === "duplicate") rows.push({ ...row });
      if (mutation === "wrong-month") row.month = "2026-10";
      if (mutation === "invalid") value.groupId = "p5";
      if (mutation === "key") row.month = "2026-08";
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
});
