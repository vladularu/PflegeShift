import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { work } from "@/engine/remuneration-test-fixtures";
import { listCaritasMonthFacts, saveCaritasMonthFacts } from "./caritas-month-facts-repository";
import { DEV_BACKUP_VERSION, parseDevBackupPayload } from "./dev-backup-payload";
import {
  acceptTestRun,
  generateTestRun,
  restoreTestBackup,
  setDeveloperMode,
} from "./dev-tools-repository";
import { saveDatedRemunerationProfile } from "./remuneration-profile-repository";
import { setupTvlShiftWork, type TvlShiftWorkFixture } from "./tvl-shift-work-test-fixtures";

describe("Caritas month facts in test-laboratory backups", () => {
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
          packageId: "avr-caritas-p-bw",
          variant: "ANLAGE_31",
          region: "BW",
          group: "p6",
          level: "1",
          fullTimeWeeklyMinutes: 2340,
        },
      },
    });
    profileRevision = profile.revision;
  });
  afterEach(() => f.adapter.database.close());
  const facts = (revision = 0) => ({
    month: "2026-09",
    profileEffectiveFrom: "2026-09-01",
    expectedProfileRevision: profileRevision,
    ruleVersionId: "2026-02-01-draft1",
    fullMonthEmploymentConfirmed: true as boolean | null,
    fullMonthlyBaseEntitlementConfirmed: true as boolean | null,
    fixedAllowanceClaim: "NOT_ENTITLED" as const,
    careAllowanceClaim: "UNKNOWN" as const,
    localAgreement: "UNKNOWN" as const,
    expectedRevision: revision,
  });
  const generate = () =>
    generateTestRun(f.db, { startMonth: "2026-09", range: 1, scenario: "NORMAL_ROTATION" }, work);
  const stored = async () => {
    const row = await f.db.getFirstAsync<{ payload: string }>(
      "SELECT payload FROM dev_test_backups WHERE month='2026-09'",
    );
    return row!.payload;
  };

  it("round-trips exact monthly facts after repeated generation", async () => {
    const original = await saveCaritasMonthFacts(f.db, {
      ...facts(),
      fullMonthEmploymentConfirmed: null,
    });
    await generate();
    const payload = parseDevBackupPayload(await stored(), "2026-09");
    expect(payload.version).toBe(DEV_BACKUP_VERSION);
    expect(payload.remuneration.caritasMonthFacts).toHaveLength(1);
    expect(await listCaritasMonthFacts(f.db)).toEqual([]);
    await generate();
    await restoreTestBackup(f.db, ["2026-09"]);
    expect(await listCaritasMonthFacts(f.db)).toEqual([original]);
  });

  it("accepts new confirmations without restoring the original", async () => {
    await saveCaritasMonthFacts(f.db, facts());
    await generate();
    const current = await saveCaritasMonthFacts(f.db, {
      ...facts(),
      fullMonthEmploymentConfirmed: false,
    });
    await acceptTestRun(f.db, ["2026-09"]);
    expect(await listCaritasMonthFacts(f.db)).toEqual([current]);
  });

  it("reads v8 without inventing monthly facts and rejects an extra v8 field", async () => {
    await generate();
    const payload = JSON.parse(await stored());
    payload.version = 8;
    delete payload.remuneration.caritasMonthFacts;
    delete payload.remuneration.caritasOvertime;
    delete payload.remuneration.tvoedAnnexAMonthConfirmations;
    delete payload.remuneration.tvoedSueMonthConfirmations;
    delete payload.remuneration.tvoedSueAllowanceConfirmations;
    delete payload.remuneration.tvoedAnnexAPremiumFacts;
    delete payload.remuneration.drkEmployeeMonthConfirmations;
    delete payload.remuneration.drkTrainingMonthConfirmations;
    expect(
      parseDevBackupPayload(JSON.stringify(payload), "2026-09").remuneration.caritasMonthFacts,
    ).toEqual([]);
    payload.remuneration.caritasMonthFacts = [];
    expect(() => parseDevBackupPayload(JSON.stringify(payload), "2026-09")).toThrow();
  });

  it.each(["missing", "duplicate", "wrong-month", "invalid", "future", "orphan"])(
    "rejects %s monthly facts without replacing user data",
    async (mutation) => {
      await saveCaritasMonthFacts(f.db, facts());
      await generate();
      const payload = JSON.parse(await stored());
      const rows = payload.remuneration.caritasMonthFacts;
      const row = rows[0];
      const parsed = JSON.parse(row.facts_json);
      if (mutation === "missing") delete payload.remuneration.caritasMonthFacts;
      if (mutation === "duplicate") rows.push({ ...row });
      if (mutation === "wrong-month") row.month = "2026-10";
      if (mutation === "invalid") parsed.careAllowanceClaim = "MAYBE";
      if (mutation === "future") parsed.profileRevision = 999;
      if (mutation === "orphan") parsed.profileEffectiveFrom = "2025-01-01";
      row.facts_json = JSON.stringify(parsed);
      await f.db.runAsync(
        "UPDATE dev_test_backups SET payload=? WHERE month='2026-09'",
        JSON.stringify(payload),
      );
      const before = f.adapter.database.prepare("SELECT * FROM shift_entries ORDER BY id").all();
      await expect(restoreTestBackup(f.db, ["2026-09"])).rejects.toThrow();
      expect(f.adapter.database.prepare("SELECT * FROM shift_entries ORDER BY id").all()).toEqual(
        before,
      );
      expect(await listCaritasMonthFacts(f.db)).toEqual([]);
    },
  );

  it("rolls back a failed restore, retaining the test-lab backup", async () => {
    const original = await saveCaritasMonthFacts(f.db, facts());
    await generate();
    f.adapter.fail = "INSERT INTO caritas_month_facts";
    await expect(restoreTestBackup(f.db, ["2026-09"])).rejects.toThrow("injected");
    expect(await listCaritasMonthFacts(f.db)).toEqual([]);
    expect(await stored()).toBeTruthy();
    f.adapter.fail = null;
    await restoreTestBackup(f.db, ["2026-09"]);
    expect(await listCaritasMonthFacts(f.db)).toEqual([original]);
  });
});
