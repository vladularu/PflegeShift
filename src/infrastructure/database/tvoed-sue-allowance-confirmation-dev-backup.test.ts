import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { work } from "@/engine/remuneration-test-fixtures";
import { parseDevBackupPayload } from "./dev-backup-payload";
import { generateTestRun, restoreTestBackup, setDeveloperMode } from "./dev-tools-repository";
import { saveDatedRemunerationProfile } from "./remuneration-profile-repository";
import {
  listTvoedSueAllowanceConfirmations,
  saveTvoedSueAllowanceConfirmation,
} from "./tvoed-sue-allowance-confirmation-repository";
import { setupTvlShiftWork, type TvlShiftWorkFixture } from "./tvl-shift-work-test-fixtures";

describe("TVöD SuE allowance confirmations in test laboratory backup v13", () => {
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
          packageId: "tvoed-vka-sue-bt-b",
          variant: "BT_B",
          region: "VKA",
          group: "S15",
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
    sectionXxivClassificationConfirmed: true as boolean | null,
    fullMonthAllowanceEntitlementConfirmed: true as boolean | null,
    caseGroup: "6" as "6" | "OTHER" | null,
    conversionDays: "NONE_CONFIRMED" as "NONE_CONFIRMED" | "TAKEN" | null,
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
    const original = await saveTvoedSueAllowanceConfirmation(f.db, answer());
    await generate();
    const backup = parseDevBackupPayload(await stored(), "2026-09");
    expect(backup.version).toBe(16);
    expect(backup.remuneration.tvoedSueAllowanceConfirmations).toHaveLength(1);
    expect(await listTvoedSueAllowanceConfirmations(f.db)).toEqual([]);
    await generate();
    await restoreTestBackup(f.db, ["2026-09"]);
    expect(await listTvoedSueAllowanceConfirmations(f.db)).toEqual([original]);
  });

  it("reads v12 without inventing allowance answers, but rejects undeclared v12 fields", async () => {
    await generate();
    const payload = JSON.parse(await stored());
    payload.version = 12;
    delete payload.remuneration.tvoedSueAllowanceConfirmations;
    delete payload.remuneration.tvoedAnnexAPremiumFacts;
    delete payload.remuneration.drkEmployeeMonthConfirmations;
    delete payload.remuneration.drkTrainingMonthConfirmations;
    expect(
      parseDevBackupPayload(JSON.stringify(payload), "2026-09").remuneration
        .tvoedSueAllowanceConfirmations,
    ).toEqual([]);
    payload.remuneration.tvoedSueAllowanceConfirmations = [];
    expect(() => parseDevBackupPayload(JSON.stringify(payload), "2026-09")).toThrow();
  });

  it.each(["missing", "duplicate", "wrong-month", "invalid", "future"])(
    "rejects %s before replacing test-month data",
    async (mutation) => {
      await saveTvoedSueAllowanceConfirmation(f.db, answer());
      await generate();
      const payload = JSON.parse(await stored());
      const rows = payload.remuneration.tvoedSueAllowanceConfirmations;
      const row = rows[0];
      const value = JSON.parse(row.confirmation_json);
      if (mutation === "missing") delete payload.remuneration.tvoedSueAllowanceConfirmations;
      if (mutation === "duplicate") rows.push({ ...row });
      if (mutation === "wrong-month") row.month = "2026-10";
      if (mutation === "invalid") value.caseGroup = "7";
      if (mutation === "future") value.profileRevision = 999;
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

  it("rolls back an injected allowance insert failure", async () => {
    const original = await saveTvoedSueAllowanceConfirmation(f.db, answer());
    await generate();
    const before = f.adapter.database.prepare("SELECT * FROM shift_entries ORDER BY id").all();
    f.adapter.fail = "INSERT INTO tvoed_sue_allowance_confirmations";
    await expect(restoreTestBackup(f.db, ["2026-09"])).rejects.toThrow("injected");
    expect(f.adapter.database.prepare("SELECT * FROM shift_entries ORDER BY id").all()).toEqual(
      before,
    );
    expect(await listTvoedSueAllowanceConfirmations(f.db)).toEqual([]);
    f.adapter.fail = null;
    await restoreTestBackup(f.db, ["2026-09"]);
    expect(await listTvoedSueAllowanceConfirmations(f.db)).toEqual([original]);
  });
});
