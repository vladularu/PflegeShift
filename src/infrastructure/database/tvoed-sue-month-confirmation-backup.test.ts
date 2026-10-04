import { LATEST_DATABASE_SCHEMA_VERSION } from "./migrations";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { LOCAL_BACKUP_VERSION, loadLocalBackupSnapshot } from "./local-backup";
import { restoreLocalBackup } from "./local-backup-restore";
import { saveDatedRemunerationProfile } from "./remuneration-profile-repository";
import {
  listTvoedSueMonthConfirmations,
  saveTvoedSueMonthConfirmation,
} from "./tvoed-sue-month-confirmation-repository";
import {
  exportTvlBackup,
  resignTvlBackup,
  setupTvlShiftWork,
  validateTvlBackup,
  type TvlShiftWorkFixture,
} from "./tvl-shift-work-test-fixtures";

describe("TVöD SuE confirmations in local backup v15", () => {
  let f: TvlShiftWorkFixture;
  let profileRevision: number;
  beforeEach(async () => {
    f = await setupTvlShiftWork();
    const profile = await saveDatedRemunerationProfile(f.db, {
      effectiveFrom: "2026-09-01",
      expectedRevision: f.profile.revision,
      data: {
        version: 1,
        weeklyMinutes: 1920,
        selection: {
          kind: "tariff",
          packageId: "tvoed-vka-sue-bt-b",
          variant: "BT_B",
          region: "VKA",
          group: "S8a",
          level: "3",
          fullTimeWeeklyMinutes: 2340,
        },
      },
    });
    profileRevision = profile.revision;
  });
  afterEach(() => f.adapter.database.close());
  const answer = (expectedRevision = 0) => ({
    month: "2026-09",
    profileEffectiveFrom: "2026-09-01",
    expectedProfileRevision: profileRevision,
    ruleVersionId: "2026-05-01-draft1",
    tariffApplicabilityConfirmed: true as boolean | null,
    sueClassificationConfirmed: true as boolean | null,
    standardFullTimeConfirmed: true as boolean | null,
    fullMonthBaseEntitlementConfirmed: null as boolean | null,
    fullMonthSameContractConfirmed: false as boolean | null,
    expectedRevision,
  });

  it("round-trips exact answers and preserves unrelated user data", async () => {
    const saved = await saveTvoedSueMonthConfirmation(f.db, answer());
    const before = await loadLocalBackupSnapshot(f.db);
    const exported = await exportTvlBackup(f);
    expect(exported.document).toMatchObject({
      version: LOCAL_BACKUP_VERSION,
      databaseSchemaVersion: LATEST_DATABASE_SCHEMA_VERSION,
    });
    expect(exported.document.data.tvoedSueMonthConfirmations).toHaveLength(1);
    await f.db.runAsync("DELETE FROM tvoed_sue_month_confirmations");
    await restoreLocalBackup(f.db, await validateTvlBackup(exported.serialized));
    expect(await listTvoedSueMonthConfirmations(f.db)).toEqual([saved]);
    expect(await loadLocalBackupSnapshot(f.db)).toEqual(before);
  });

  it("accepts v14 without inventing or retaining newer SuE answers", async () => {
    await saveTvoedSueMonthConfirmation(f.db, answer());
    const legacy = await resignTvlBackup((await exportTvlBackup(f)).serialized, (root) => {
      root.version = 14;
      root.databaseSchemaVersion = 26;
      delete root.data.tvoedSueMonthConfirmations;
      delete root.data.tvoedSueAllowanceConfirmations;
    });
    const checked = await validateTvlBackup(legacy);
    expect(checked.document.data.tvoedSueMonthConfirmations).toEqual([]);
    await restoreLocalBackup(f.db, checked);
    expect(await listTvoedSueMonthConfirmations(f.db)).toEqual([]);
  });

  it.each(["missing", "duplicate", "wrong-month", "invalid", "future", "orphan", "schema"])(
    "rejects %s without changing local data",
    async (mutation) => {
      await saveTvoedSueMonthConfirmation(f.db, answer());
      const before = await loadLocalBackupSnapshot(f.db);
      const changed = await resignTvlBackup((await exportTvlBackup(f)).serialized, (root) => {
        const rows = root.data.tvoedSueMonthConfirmations as Record<string, unknown>[];
        const row = rows[0];
        const parsed = JSON.parse(row.confirmation_json as string);
        if (mutation === "missing") delete root.data.tvoedSueMonthConfirmations;
        if (mutation === "duplicate") rows.push({ ...row });
        if (mutation === "wrong-month") row.month = "2026-10";
        if (mutation === "invalid") parsed.sueClassificationConfirmed = "maybe";
        if (mutation === "future") parsed.profileRevision = 999;
        if (mutation === "orphan") parsed.profileEffectiveFrom = "2025-01-01";
        if (mutation === "schema") root.databaseSchemaVersion = 26;
        row.confirmation_json = JSON.stringify(parsed);
      });
      await expect(validateTvlBackup(changed)).rejects.toThrow();
      expect(await loadLocalBackupSnapshot(f.db)).toEqual(before);
    },
  );

  it("rolls a failed replacement back including the original answer", async () => {
    await saveTvoedSueMonthConfirmation(f.db, answer());
    const checked = await validateTvlBackup((await exportTvlBackup(f)).serialized);
    await saveTvoedSueMonthConfirmation(f.db, {
      ...answer(1),
      fullMonthSameContractConfirmed: true,
    });
    const before = await loadLocalBackupSnapshot(f.db);
    f.adapter.fail = "INSERT INTO tvoed_sue_month_confirmations";
    await expect(restoreLocalBackup(f.db, checked)).rejects.toThrow("injected");
    expect(await loadLocalBackupSnapshot(f.db)).toEqual(before);
    expect(f.adapter.database.inTransaction).toBe(false);
  });
});
