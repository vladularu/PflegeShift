import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { work } from "@/engine/remuneration-test-fixtures";
import { parseDevBackupPayload } from "./dev-backup-payload";
import { generateTestRun, restoreTestBackup, setDeveloperMode } from "./dev-tools-repository";
import { saveDatedRemunerationProfile } from "./remuneration-profile-repository";
import { saveTrainingProfile } from "./training-repository";
import {
  listDrkTrainingMonthConfirmations,
  saveDrkTrainingMonthConfirmation,
} from "./drk-training-month-confirmation-repository";
import { setupTvlShiftWork, type TvlShiftWorkFixture } from "./tvl-shift-work-test-fixtures";

describe("DRK training confirmations in test laboratory backup v16", () => {
  let f: TvlShiftWorkFixture;
  beforeEach(async () => {
    f = await setupTvlShiftWork();
    await setDeveloperMode(f.db, true);
    await saveDatedRemunerationProfile(f.db, {
      effectiveFrom: "2026-10-01",
      expectedRevision: 0,
      data: {
        version: 1,
        weeklyMinutes: 2340,
        selection: {
          kind: "tariff",
          packageId: "drk-rtv-training",
          variant: "ANLAGE_3A_A",
          region: "BTG",
          group: "anlage-3a-a",
          level: "1",
          fullTimeWeeklyMinutes: 2340,
        },
      },
    });
    await saveTrainingProfile(f.db, {
      data: {
        version: 1,
        effectiveFrom: "2026-09-01",
        birthDate: null,
        fullTimeCompulsorySchooling: null,
        status: "training",
        training: {
          profession: "Pflegefachperson",
          legalBasis: "PFLBG",
          startedOn: "2026-09-01",
          expectedEndOn: null,
          year: 1,
          yearConfirmedFrom: "2026-09-01",
          shorteningMonths: null,
        },
      },
      expectedRevision: 0,
    });
  });
  afterEach(() => f.adapter.database.close());

  const answer = () => ({
    month: "2026-10",
    remunerationProfileEffectiveFrom: "2026-10-01",
    expectedRemunerationProfileRevision: 1,
    trainingProfileEffectiveFrom: "2026-09-01",
    expectedTrainingProfileRevision: 1,
    ruleVersionId: "2026-10-01-draft1",
    drkApplicabilityConfirmed: true as boolean | null,
    trainingCategoryConfirmed: null as boolean | null,
    trainingYearConfirmed: true as boolean | null,
    fullMonthBaseEntitlementConfirmed: true as boolean | null,
    fullTimeTrainingConfirmed: true as boolean | null,
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
    const original = await saveDrkTrainingMonthConfirmation(f.db, answer());
    await generate();
    const backup = parseDevBackupPayload(await stored(), "2026-10");
    expect(backup.version).toBe(16);
    expect(backup.remuneration.drkTrainingMonthConfirmations).toHaveLength(1);
    expect(await listDrkTrainingMonthConfirmations(f.db)).toEqual([]);
    await generate();
    await restoreTestBackup(f.db, ["2026-10"]);
    expect(await listDrkTrainingMonthConfirmations(f.db)).toEqual([original]);
  });

  it("reads old v15 without a new answer but rejects undeclared fields", async () => {
    await generate();
    const payload = JSON.parse(await stored());
    payload.version = 15;
    delete payload.remuneration.drkTrainingMonthConfirmations;
    expect(
      parseDevBackupPayload(JSON.stringify(payload), "2026-10").remuneration
        .drkTrainingMonthConfirmations,
    ).toEqual([]);
    payload.remuneration.drkTrainingMonthConfirmations = [];
    expect(() => parseDevBackupPayload(JSON.stringify(payload), "2026-10")).toThrow();
  });

  it.each(["missing", "duplicate", "wrong-month", "invalid"])(
    "rejects %s before replacing the test month",
    async (mutation) => {
      await saveDrkTrainingMonthConfirmation(f.db, answer());
      await generate();
      const payload = JSON.parse(await stored());
      const rows = payload.remuneration.drkTrainingMonthConfirmations;
      const row = rows[0];
      const parsed = JSON.parse(row.confirmation_json);
      if (mutation === "missing") delete payload.remuneration.drkTrainingMonthConfirmations;
      if (mutation === "duplicate") rows.push({ ...row });
      if (mutation === "wrong-month") row.month = "2026-11";
      if (mutation === "invalid") parsed.trainingCategoryConfirmed = "maybe";
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
