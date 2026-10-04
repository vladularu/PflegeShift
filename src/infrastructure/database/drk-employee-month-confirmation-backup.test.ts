import { LATEST_DATABASE_SCHEMA_VERSION } from "./migrations";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { LOCAL_BACKUP_VERSION, loadLocalBackupSnapshot } from "./local-backup";
import { restoreLocalBackup } from "./local-backup-restore";
import { saveDatedRemunerationProfile } from "./remuneration-profile-repository";
import {
  listDrkEmployeeMonthConfirmations,
  saveDrkEmployeeMonthConfirmation,
} from "./drk-employee-month-confirmation-repository";
import {
  exportTvlBackup,
  resignTvlBackup,
  setupTvlShiftWork,
  validateTvlBackup,
  type TvlShiftWorkFixture,
} from "./tvl-shift-work-test-fixtures";

describe("DRK employee confirmations in local backup v18", () => {
  let f: TvlShiftWorkFixture;
  let profileRevision: number;
  beforeEach(async () => {
    f = await setupTvlShiftWork();
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
  const answer = (expectedRevision = 0) => ({
    month: "2026-10",
    profileEffectiveFrom: "2026-10-01",
    expectedProfileRevision: profileRevision,
    ruleVersionId: "2026-10-01-draft1",
    drkApplicabilityConfirmed: true as boolean | null,
    annexAssignmentConfirmed: true as boolean | null,
    payGroupAndStepConfirmed: null as boolean | null,
    weeklyTimeBasisConfirmed: true as boolean | null,
    fullMonthBaseEntitlementConfirmed: false as boolean | null,
    expectedRevision,
  });

  it("round-trips exact answers without changing other user data", async () => {
    const saved = await saveDrkEmployeeMonthConfirmation(f.db, answer());
    const before = await loadLocalBackupSnapshot(f.db);
    const exported = await exportTvlBackup(f);
    expect(exported.document).toMatchObject({
      version: LOCAL_BACKUP_VERSION,
      databaseSchemaVersion: LATEST_DATABASE_SCHEMA_VERSION,
    });
    expect(exported.document.data.drkEmployeeMonthConfirmations).toHaveLength(1);
    await f.db.runAsync("DELETE FROM drk_employee_month_confirmations");
    await restoreLocalBackup(f.db, await validateTvlBackup(exported.serialized));
    expect(await listDrkEmployeeMonthConfirmations(f.db)).toEqual([saved]);
    expect(await loadLocalBackupSnapshot(f.db)).toEqual(before);
  });

  it("accepts old v17 backup and clears newer answers without inventing them", async () => {
    await saveDrkEmployeeMonthConfirmation(f.db, answer());
    const exported = await exportTvlBackup(f);
    const legacy = await resignTvlBackup(exported.serialized, (root) => {
      root.version = 17;
      root.databaseSchemaVersion = 29;
      delete root.data.drkEmployeeMonthConfirmations;
    });
    const checked = await validateTvlBackup(legacy);
    expect(checked.document.data.drkEmployeeMonthConfirmations).toEqual([]);
    await restoreLocalBackup(f.db, checked);
    expect(await listDrkEmployeeMonthConfirmations(f.db)).toEqual([]);
  });

  it.each(["missing", "duplicate", "wrong-month", "invalid", "orphan", "future", "schema"])(
    "rejects %s before touching local data",
    async (mutation) => {
      await saveDrkEmployeeMonthConfirmation(f.db, answer());
      const exported = await exportTvlBackup(f);
      const before = await loadLocalBackupSnapshot(f.db);
      const changed = await resignTvlBackup(exported.serialized, (root) => {
        const rows = root.data.drkEmployeeMonthConfirmations as Record<string, unknown>[];
        const row = rows[0];
        const parsed = JSON.parse(row.confirmation_json as string);
        if (mutation === "missing") delete root.data.drkEmployeeMonthConfirmations;
        if (mutation === "duplicate") rows.push({ ...row });
        if (mutation === "wrong-month") row.month = "2026-11";
        if (mutation === "invalid") parsed.annexAssignmentConfirmed = "maybe";
        if (mutation === "orphan") parsed.profileEffectiveFrom = "2025-01-01";
        if (mutation === "future") parsed.profileRevision = 999;
        if (mutation === "schema") root.databaseSchemaVersion = 29;
        row.confirmation_json = JSON.stringify(parsed);
      });
      await expect(validateTvlBackup(changed)).rejects.toThrow();
      expect(await loadLocalBackupSnapshot(f.db)).toEqual(before);
    },
  );

  it("rolls failed replacement back with original answers intact", async () => {
    await saveDrkEmployeeMonthConfirmation(f.db, answer());
    const checked = await validateTvlBackup((await exportTvlBackup(f)).serialized);
    await saveDrkEmployeeMonthConfirmation(f.db, {
      ...answer(1),
      payGroupAndStepConfirmed: true,
    });
    const before = await loadLocalBackupSnapshot(f.db);
    f.adapter.fail = "INSERT INTO drk_employee_month_confirmations";
    await expect(restoreLocalBackup(f.db, checked)).rejects.toThrow("injected");
    expect(await loadLocalBackupSnapshot(f.db)).toEqual(before);
    expect(f.adapter.database.inTransaction).toBe(false);
  });
});
