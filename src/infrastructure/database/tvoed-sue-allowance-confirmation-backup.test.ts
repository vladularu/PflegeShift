import { LATEST_DATABASE_SCHEMA_VERSION } from "./migrations";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { LOCAL_BACKUP_VERSION, loadLocalBackupSnapshot } from "./local-backup";
import { restoreLocalBackup } from "./local-backup-restore";
import { saveDatedRemunerationProfile } from "./remuneration-profile-repository";
import {
  listTvoedSueAllowanceConfirmations,
  saveTvoedSueAllowanceConfirmation,
} from "./tvoed-sue-allowance-confirmation-repository";
import {
  exportTvlBackup,
  resignTvlBackup,
  setupTvlShiftWork,
  validateTvlBackup,
  type TvlShiftWorkFixture,
} from "./tvl-shift-work-test-fixtures";

describe("TVöD SuE allowance confirmations in local backup v16", () => {
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
          group: "S15",
          level: "2",
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
    sectionXxivClassificationConfirmed: true as boolean | null,
    fullMonthAllowanceEntitlementConfirmed: true as boolean | null,
    caseGroup: "6" as "6" | "OTHER" | null,
    conversionDays: "TAKEN" as "NONE_CONFIRMED" | "TAKEN" | null,
    expectedRevision,
  });

  it("round-trips exact answers and leaves unrelated user data unchanged", async () => {
    const saved = await saveTvoedSueAllowanceConfirmation(f.db, answer());
    const before = await loadLocalBackupSnapshot(f.db);
    const exported = await exportTvlBackup(f);
    expect(exported.document).toMatchObject({
      version: LOCAL_BACKUP_VERSION,
      databaseSchemaVersion: LATEST_DATABASE_SCHEMA_VERSION,
    });
    expect(exported.document.data.tvoedSueAllowanceConfirmations).toHaveLength(1);
    await f.db.runAsync("DELETE FROM tvoed_sue_allowance_confirmations");
    await restoreLocalBackup(f.db, await validateTvlBackup(exported.serialized));
    expect(await listTvoedSueAllowanceConfirmations(f.db)).toEqual([saved]);
    expect(await loadLocalBackupSnapshot(f.db)).toEqual(before);
  });

  it("accepts v15 without inventing or retaining newer allowance answers", async () => {
    await saveTvoedSueAllowanceConfirmation(f.db, answer());
    const legacy = await resignTvlBackup((await exportTvlBackup(f)).serialized, (root) => {
      root.version = 15;
      root.databaseSchemaVersion = 27;
      delete root.data.tvoedSueAllowanceConfirmations;
    });
    const checked = await validateTvlBackup(legacy);
    expect(checked.document.data.tvoedSueAllowanceConfirmations).toEqual([]);
    await restoreLocalBackup(f.db, checked);
    expect(await listTvoedSueAllowanceConfirmations(f.db)).toEqual([]);
  });

  it.each(["missing", "duplicate", "wrong-month", "invalid", "future", "orphan", "schema"])(
    "rejects %s without changing local data",
    async (mutation) => {
      await saveTvoedSueAllowanceConfirmation(f.db, answer());
      const before = await loadLocalBackupSnapshot(f.db);
      const changed = await resignTvlBackup((await exportTvlBackup(f)).serialized, (root) => {
        const rows = root.data.tvoedSueAllowanceConfirmations as Record<string, unknown>[];
        const row = rows[0];
        const parsed = JSON.parse(row.confirmation_json as string);
        if (mutation === "missing") delete root.data.tvoedSueAllowanceConfirmations;
        if (mutation === "duplicate") rows.push({ ...row });
        if (mutation === "wrong-month") row.month = "2026-10";
        if (mutation === "invalid") parsed.caseGroup = "7";
        if (mutation === "future") parsed.profileRevision = 999;
        if (mutation === "orphan") parsed.profileEffectiveFrom = "2025-01-01";
        if (mutation === "schema") root.databaseSchemaVersion = 27;
        row.confirmation_json = JSON.stringify(parsed);
      });
      await expect(validateTvlBackup(changed)).rejects.toThrow();
      expect(await loadLocalBackupSnapshot(f.db)).toEqual(before);
    },
  );

  it("rolls a failed replacement back including the original answer", async () => {
    await saveTvoedSueAllowanceConfirmation(f.db, answer());
    const checked = await validateTvlBackup((await exportTvlBackup(f)).serialized);
    await saveTvoedSueAllowanceConfirmation(f.db, {
      ...answer(1),
      fullMonthAllowanceEntitlementConfirmed: false,
    });
    const before = await loadLocalBackupSnapshot(f.db);
    f.adapter.fail = "INSERT INTO tvoed_sue_allowance_confirmations";
    await expect(restoreLocalBackup(f.db, checked)).rejects.toThrow("injected");
    expect(await loadLocalBackupSnapshot(f.db)).toEqual(before);
    expect(f.adapter.database.inTransaction).toBe(false);
  });
});
