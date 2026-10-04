import { LATEST_DATABASE_SCHEMA_VERSION } from "./migrations";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { LOCAL_BACKUP_VERSION, loadLocalBackupSnapshot } from "./local-backup";
import { restoreLocalBackup } from "./local-backup-restore";
import { saveDatedRemunerationProfile } from "./remuneration-profile-repository";
import { saveTrainingProfile } from "./training-repository";
import {
  listDrkTrainingMonthConfirmations,
  saveDrkTrainingMonthConfirmation,
} from "./drk-training-month-confirmation-repository";
import {
  exportTvlBackup,
  resignTvlBackup,
  setupTvlShiftWork,
  validateTvlBackup,
  type TvlShiftWorkFixture,
} from "./tvl-shift-work-test-fixtures";

describe("DRK training confirmations in local backup v19", () => {
  let f: TvlShiftWorkFixture;
  beforeEach(async () => {
    f = await setupTvlShiftWork();
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

  const answer = (expectedRevision = 0) => ({
    month: "2026-10",
    remunerationProfileEffectiveFrom: "2026-10-01",
    expectedRemunerationProfileRevision: 1,
    trainingProfileEffectiveFrom: "2026-09-01",
    expectedTrainingProfileRevision: 1,
    ruleVersionId: "2026-10-01-draft1",
    drkApplicabilityConfirmed: true as boolean | null,
    trainingCategoryConfirmed: null as boolean | null,
    trainingYearConfirmed: true as boolean | null,
    fullMonthBaseEntitlementConfirmed: false as boolean | null,
    fullTimeTrainingConfirmed: true as boolean | null,
    expectedRevision,
  });

  it("round-trips both profile bindings and tri-state answers", async () => {
    const saved = await saveDrkTrainingMonthConfirmation(f.db, answer());
    const before = await loadLocalBackupSnapshot(f.db);
    const exported = await exportTvlBackup(f);
    expect(exported.document).toMatchObject({
      version: LOCAL_BACKUP_VERSION,
      databaseSchemaVersion: LATEST_DATABASE_SCHEMA_VERSION,
    });
    expect(exported.document.data.drkTrainingMonthConfirmations).toHaveLength(1);
    await f.db.runAsync("DELETE FROM drk_training_month_confirmations");
    await restoreLocalBackup(f.db, await validateTvlBackup(exported.serialized));
    expect(await listDrkTrainingMonthConfirmations(f.db)).toEqual([saved]);
    expect(await loadLocalBackupSnapshot(f.db)).toEqual(before);
  });

  it("accepts an old v18 backup without inventing new confirmations", async () => {
    await saveDrkTrainingMonthConfirmation(f.db, answer());
    const exported = await exportTvlBackup(f);
    const legacy = await resignTvlBackup(exported.serialized, (root) => {
      root.version = 18;
      root.databaseSchemaVersion = 30;
    });
    const checked = await validateTvlBackup(legacy);
    expect(checked.document.data.drkTrainingMonthConfirmations).toEqual([]);
    await restoreLocalBackup(f.db, checked);
    expect(await listDrkTrainingMonthConfirmations(f.db)).toEqual([]);
  });

  it.each([
    "missing",
    "duplicate",
    "wrong-month",
    "invalid",
    "orphan-remuneration",
    "orphan-training",
    "future-training",
    "schema",
  ])("rejects %s without touching local data", async (mutation) => {
    await saveDrkTrainingMonthConfirmation(f.db, answer());
    const before = await loadLocalBackupSnapshot(f.db);
    const changed = await resignTvlBackup((await exportTvlBackup(f)).serialized, (root) => {
      const rows = root.data.drkTrainingMonthConfirmations as Record<string, unknown>[];
      const row = rows[0];
      const parsed = JSON.parse(row.confirmation_json as string);
      if (mutation === "missing") delete root.data.drkTrainingMonthConfirmations;
      if (mutation === "duplicate") rows.push({ ...row });
      if (mutation === "wrong-month") row.month = "2026-11";
      if (mutation === "invalid") parsed.trainingCategoryConfirmed = "maybe";
      if (mutation === "orphan-remuneration")
        parsed.remunerationProfileEffectiveFrom = "2025-01-01";
      if (mutation === "orphan-training") parsed.trainingProfileEffectiveFrom = "2025-01-01";
      if (mutation === "future-training") parsed.trainingProfileRevision = 999;
      if (mutation === "schema") root.databaseSchemaVersion = 30;
      row.confirmation_json = JSON.stringify(parsed);
    });
    await expect(validateTvlBackup(changed)).rejects.toThrow();
    expect(await loadLocalBackupSnapshot(f.db)).toEqual(before);
  });

  it("rolls a failed replacement back with the existing confirmation intact", async () => {
    await saveDrkTrainingMonthConfirmation(f.db, answer());
    const checked = await validateTvlBackup((await exportTvlBackup(f)).serialized);
    await saveDrkTrainingMonthConfirmation(f.db, {
      ...answer(1),
      trainingCategoryConfirmed: true,
    });
    const before = await loadLocalBackupSnapshot(f.db);
    f.adapter.fail = "INSERT INTO drk_training_month_confirmations";
    await expect(restoreLocalBackup(f.db, checked)).rejects.toThrow("injected");
    expect(await loadLocalBackupSnapshot(f.db)).toEqual(before);
    expect(f.adapter.database.inTransaction).toBe(false);
  });
});
