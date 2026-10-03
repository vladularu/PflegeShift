import { LATEST_DATABASE_SCHEMA_VERSION } from "./migrations";
import { beforeEach, afterEach, describe, it, expect } from "vitest";
import { saveShift } from "./calendar-entry-repository";
import { saveTvlShiftWork, listTvlShiftWork } from "./tvl-shift-work-repository";
import { restoreLocalBackup } from "./local-backup-restore";
import { LOCAL_BACKUP_VERSION, loadLocalBackupSnapshot } from "./local-backup";
import {
  setupTvlShiftWork,
  exportTvlBackup,
  validateTvlBackup,
  resignTvlBackup,
  type TvlShiftWorkFixture,
} from "./tvl-shift-work-test-fixtures";

describe("TV-L service confirmation across backup versions", () => {
  let f: TvlShiftWorkFixture;
  beforeEach(async () => {
    f = await setupTvlShiftWork();
  });
  afterEach(() => f.adapter.database.close());
  it.each([true, false, null])(
    "restores %s and preserves stale history verbatim",
    async (shiftWork) => {
      const saved = await saveTvlShiftWork(f.db, { ...f.input, shiftWork });
      await saveShift(f.db, { ...f.shift, expectedRevision: f.shift.revision, endTime: "20:00" });
      const exported = await exportTvlBackup(f);
      expect(exported.document).toMatchObject({
        version: LOCAL_BACKUP_VERSION,
        databaseSchemaVersion: LATEST_DATABASE_SCHEMA_VERSION,
      });
      expect(exported.document.data.tvlShiftWork).toHaveLength(1);
      const before = await loadLocalBackupSnapshot(f.db);
      const verified = await validateTvlBackup(exported.serialized);
      await f.db.runAsync("DELETE FROM tvl_shift_work");
      await restoreLocalBackup(f.db, verified);
      expect(await listTvlShiftWork(f.db)).toEqual([saved]);
      expect(await loadLocalBackupSnapshot(f.db)).toEqual(before);
    },
  );
  it.each([1, 2, 3, 4, 5, 6, 7, 8, 9])(
    "restores legacy v%i without retaining target confirmations",
    async (version) => {
      const original = await exportTvlBackup(f);
      const old = await resignTvlBackup(original.serialized, (root) => {
        root.version = version;
        root.databaseSchemaVersion = 13 + version;
        delete root.data.caritasWorkDays;
        delete root.data.caritasMonthFacts;
        delete root.data.caritasOvertime;
        delete root.data.tvoedAnnexAMonthConfirmations;
        delete root.data.tvoedSueMonthConfirmations;
        delete root.data.tvoedSueAllowanceConfirmations;
        if (version < 9) delete root.data.tvlShiftWork;
        if (version < 8) delete root.data.tariffAnnualClaims;
        if (version < 7) delete root.data.actualAnnualPayments;
        if (version < 6) {
          delete root.data.trainingProfiles;
          delete root.data.shiftTrainingDetails;
        }
        if (version < 5) delete root.data.paidAbsences;
        if (version < 4) delete root.data.overtimeAllocations;
        if (version < 3) delete root.data.allowanceDecisions;
        if (version < 2) delete root.data.remunerationProfiles;
      });
      const checked = await validateTvlBackup(old);
      expect(checked.document.data.tvlShiftWork).toEqual([]);
      await saveTvlShiftWork(f.db, f.input);
      await restoreLocalBackup(f.db, checked);
      expect(await listTvlShiftWork(f.db)).toEqual([]);
    },
  );
  it.each([
    "missing",
    "duplicate",
    "orphan-shift",
    "orphan-profile",
    "future-shift",
    "future-profile",
    "invalid-value",
    "key-mismatch",
    "extra",
    "schema",
    "downgrade",
    "wrong-period",
  ])(
    "rejects %s even with a recomputed checksum, before touching current data",
    async (mutation) => {
      await saveTvlShiftWork(f.db, f.input);
      const exported = await exportTvlBackup(f);
      const before = await loadLocalBackupSnapshot(f.db);
      const changed = await resignTvlBackup(exported.serialized, (root) => {
        const rows = root.data.tvlShiftWork as Record<string, unknown>[];
        const row = rows[0];
        const data = JSON.parse(row.confirmation_json as string);
        if (mutation === "missing") delete root.data.tvlShiftWork;
        if (mutation === "duplicate") rows.push({ ...row });
        if (mutation === "orphan-shift") {
          row.shift_id = "missing";
          data.shiftId = "missing";
        }
        if (mutation === "orphan-profile") {
          row.profile_effective_from = "2026-09-02";
          data.profileEffectiveFrom = "2026-09-02";
        }
        if (mutation === "future-shift") data.shiftRevision = 999;
        if (mutation === "future-profile") data.profileRevision = 999;
        if (mutation === "invalid-value") data.shiftWork = 1;
        if (mutation === "key-mismatch") row.shift_id = "different";
        if (mutation === "extra") data.extra = true;
        if (mutation === "schema") root.databaseSchemaVersion = 21;
        if (mutation === "downgrade") root.version = 8;
        if (mutation === "wrong-period") {
          // Both the stored profile and confirmation are moved beyond the actual service.
          const profiles = root.data.remunerationProfiles as Record<string, unknown>[];
          const profile = profiles.find(
            (item) => item.effective_from === f.input.profileEffectiveFrom,
          )!;
          profile.id = "from:2026-09-21";
          profile.effective_from = "2026-09-21";
          row.profile_effective_from = "2026-09-21";
          data.profileEffectiveFrom = "2026-09-21";
        }
        row.confirmation_json = JSON.stringify(data);
      });
      await expect(validateTvlBackup(changed)).rejects.toThrow();
      expect(await loadLocalBackupSnapshot(f.db)).toEqual(before);
    },
  );
  it("rolls the entire import back on a confirmation insert failure", async () => {
    await saveTvlShiftWork(f.db, f.input);
    const checked = await validateTvlBackup((await exportTvlBackup(f)).serialized);
    await saveTvlShiftWork(f.db, { ...f.input, expectedRevision: 1, shiftWork: false });
    const before = await loadLocalBackupSnapshot(f.db);
    f.adapter.fail = "INSERT INTO tvl_shift_work";
    await expect(restoreLocalBackup(f.db, checked)).rejects.toThrow("injected");
    expect(await loadLocalBackupSnapshot(f.db)).toEqual(before);
    expect(f.adapter.database.inTransaction).toBe(false);
  });
});
