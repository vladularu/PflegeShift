import { LATEST_DATABASE_SCHEMA_VERSION } from "./migrations";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { LOCAL_BACKUP_VERSION, loadLocalBackupSnapshot } from "./local-backup";
import { restoreLocalBackup } from "./local-backup-restore";
import { saveDatedRemunerationProfile } from "./remuneration-profile-repository";
import {
  listTvoedAnnexAMonthConfirmations,
  saveTvoedAnnexAMonthConfirmation,
} from "./tvoed-annex-a-month-confirmation-repository";
import {
  exportTvlBackup,
  resignTvlBackup,
  setupTvlShiftWork,
  validateTvlBackup,
  type TvlShiftWorkFixture,
} from "./tvl-shift-work-test-fixtures";

describe("TVöD Anlage A month confirmations in local backup v14", () => {
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
          packageId: "tvoed-vka-anlage-a",
          variant: "BT_B",
          region: "VKA",
          group: "EG8",
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
    applicabilityConfirmed: true as boolean | null,
    comparableFullTimeConfirmed: true as boolean | null,
    fullMonthBaseEntitlementConfirmed: null as boolean | null,
    fullMonthSameContractConfirmed: false as boolean | null,
    expectedRevision,
  });

  it("round-trips exact answers and leaves unrelated data unchanged", async () => {
    const saved = await saveTvoedAnnexAMonthConfirmation(f.db, answer());
    const before = await loadLocalBackupSnapshot(f.db);
    const exported = await exportTvlBackup(f);
    expect(exported.document).toMatchObject({
      version: LOCAL_BACKUP_VERSION,
      databaseSchemaVersion: LATEST_DATABASE_SCHEMA_VERSION,
    });
    expect(exported.document.data.tvoedAnnexAMonthConfirmations).toHaveLength(1);
    await f.db.runAsync("DELETE FROM tvoed_annex_a_month_confirmations");
    await restoreLocalBackup(f.db, await validateTvlBackup(exported.serialized));
    expect(await listTvoedAnnexAMonthConfirmations(f.db)).toEqual([saved]);
    expect(await loadLocalBackupSnapshot(f.db)).toEqual(before);
  });

  it("accepts v13 without inventing or retaining newer answers", async () => {
    await saveTvoedAnnexAMonthConfirmation(f.db, answer());
    const exported = await exportTvlBackup(f);
    const legacy = await resignTvlBackup(exported.serialized, (root) => {
      root.version = 13;
      root.databaseSchemaVersion = 25;
      delete root.data.tvoedAnnexAMonthConfirmations;
      delete root.data.tvoedSueMonthConfirmations;
      delete root.data.tvoedSueAllowanceConfirmations;
    });
    const checked = await validateTvlBackup(legacy);
    expect(checked.document.data.tvoedAnnexAMonthConfirmations).toEqual([]);
    await restoreLocalBackup(f.db, checked);
    expect(await listTvoedAnnexAMonthConfirmations(f.db)).toEqual([]);
  });

  it.each(["missing", "duplicate", "wrong-month", "invalid", "future", "orphan", "schema"])(
    "rejects %s without changing local data",
    async (mutation) => {
      await saveTvoedAnnexAMonthConfirmation(f.db, answer());
      const exported = await exportTvlBackup(f);
      const before = await loadLocalBackupSnapshot(f.db);
      const changed = await resignTvlBackup(exported.serialized, (root) => {
        const rows = root.data.tvoedAnnexAMonthConfirmations as Record<string, unknown>[];
        const row = rows[0];
        const parsed = JSON.parse(row.confirmation_json as string);
        if (mutation === "missing") delete root.data.tvoedAnnexAMonthConfirmations;
        if (mutation === "duplicate") rows.push({ ...row });
        if (mutation === "wrong-month") row.month = "2026-10";
        if (mutation === "invalid") parsed.applicabilityConfirmed = "maybe";
        if (mutation === "future") parsed.profileRevision = 999;
        if (mutation === "orphan") parsed.profileEffectiveFrom = "2025-01-01";
        if (mutation === "schema") root.databaseSchemaVersion = 25;
        row.confirmation_json = JSON.stringify(parsed);
      });
      await expect(validateTvlBackup(changed)).rejects.toThrow();
      expect(await loadLocalBackupSnapshot(f.db)).toEqual(before);
    },
  );

  it("rolls a failed replacement back including the original answer", async () => {
    await saveTvoedAnnexAMonthConfirmation(f.db, answer());
    const checked = await validateTvlBackup((await exportTvlBackup(f)).serialized);
    await saveTvoedAnnexAMonthConfirmation(f.db, {
      ...answer(1),
      fullMonthSameContractConfirmed: true,
    });
    const before = await loadLocalBackupSnapshot(f.db);
    f.adapter.fail = "INSERT INTO tvoed_annex_a_month_confirmations";
    await expect(restoreLocalBackup(f.db, checked)).rejects.toThrow("injected");
    expect(await loadLocalBackupSnapshot(f.db)).toEqual(before);
    expect(f.adapter.database.inTransaction).toBe(false);
  });
});
