import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { listCaritasMonthFacts, saveCaritasMonthFacts } from "./caritas-month-facts-repository";
import { loadLocalBackupSnapshot } from "./local-backup";
import { restoreLocalBackup } from "./local-backup-restore";
import { saveDatedRemunerationProfile } from "./remuneration-profile-repository";
import {
  exportTvlBackup,
  resignTvlBackup,
  setupTvlShiftWork,
  validateTvlBackup,
  type TvlShiftWorkFixture,
} from "./tvl-shift-work-test-fixtures";

describe("Caritas monthly facts in local backup v11", () => {
  let f: TvlShiftWorkFixture;
  let profileRevision: number;
  beforeEach(async () => {
    f = await setupTvlShiftWork();
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
  const facts = () => ({
    month: "2026-09",
    profileEffectiveFrom: "2026-09-01",
    expectedProfileRevision: profileRevision,
    ruleVersionId: "2026-02-01-draft1",
    fullMonthEmploymentConfirmed: null as boolean | null,
    fullMonthlyBaseEntitlementConfirmed: true as boolean | null,
    fixedAllowanceClaim: "NOT_ENTITLED" as const,
    careAllowanceClaim: "UNKNOWN" as const,
    localAgreement: "UNKNOWN" as const,
    expectedRevision: 0,
  });

  it("round-trips the exact confirmation and preserves unrelated data", async () => {
    const saved = await saveCaritasMonthFacts(f.db, facts());
    const before = await loadLocalBackupSnapshot(f.db);
    const exported = await exportTvlBackup(f);
    expect(exported.document).toMatchObject({ version: 19, databaseSchemaVersion: 31 });
    expect(exported.document.data.caritasMonthFacts).toHaveLength(1);
    await f.db.runAsync("DELETE FROM caritas_month_facts");
    await restoreLocalBackup(f.db, await validateTvlBackup(exported.serialized));
    expect(await listCaritasMonthFacts(f.db)).toEqual([saved]);
    expect(await loadLocalBackupSnapshot(f.db)).toEqual(before);
  });

  it("restores v10 without inventing or retaining a monthly confirmation", async () => {
    await saveCaritasMonthFacts(f.db, facts());
    const exported = await exportTvlBackup(f);
    const legacy = await resignTvlBackup(exported.serialized, (root) => {
      root.version = 10;
      root.databaseSchemaVersion = 23;
      delete root.data.caritasMonthFacts;
      delete root.data.caritasOvertime;
      delete root.data.tvoedAnnexAMonthConfirmations;
      delete root.data.tvoedSueMonthConfirmations;
      delete root.data.tvoedSueAllowanceConfirmations;
    });
    const checked = await validateTvlBackup(legacy);
    expect(checked.document.data.caritasMonthFacts).toBeUndefined();
    await restoreLocalBackup(f.db, checked);
    expect(await listCaritasMonthFacts(f.db)).toEqual([]);
  });

  it.each(["missing", "duplicate", "wrong-month", "invalid", "future", "orphan", "schema"])(
    "rejects %s without changing local data",
    async (mutation) => {
      await saveCaritasMonthFacts(f.db, facts());
      const exported = await exportTvlBackup(f);
      const before = await loadLocalBackupSnapshot(f.db);
      const changed = await resignTvlBackup(exported.serialized, (root) => {
        const rows = root.data.caritasMonthFacts as Record<string, unknown>[];
        const row = rows[0];
        const parsed = JSON.parse(row.facts_json as string);
        if (mutation === "missing") delete root.data.caritasMonthFacts;
        if (mutation === "duplicate") rows.push({ ...row });
        if (mutation === "wrong-month") row.month = "2026-10";
        if (mutation === "invalid") parsed.careAllowanceClaim = "MAYBE";
        if (mutation === "future") parsed.profileRevision = 999;
        if (mutation === "orphan") parsed.profileEffectiveFrom = "2025-01-01";
        if (mutation === "schema") root.databaseSchemaVersion = 23;
        row.facts_json = JSON.stringify(parsed);
      });
      await expect(validateTvlBackup(changed)).rejects.toThrow();
      expect(await loadLocalBackupSnapshot(f.db)).toEqual(before);
    },
  );

  it("rolls back a failed replacement including original monthly facts", async () => {
    const original = await saveCaritasMonthFacts(f.db, facts());
    const checked = await validateTvlBackup((await exportTvlBackup(f)).serialized);
    await saveCaritasMonthFacts(f.db, {
      ...facts(),
      expectedRevision: 1,
      careAllowanceClaim: "ENTITLED",
    });
    const before = await loadLocalBackupSnapshot(f.db);
    f.adapter.fail = "INSERT INTO caritas_month_facts";
    await expect(restoreLocalBackup(f.db, checked)).rejects.toThrow("injected");
    expect(await loadLocalBackupSnapshot(f.db)).toEqual(before);
    expect(await listCaritasMonthFacts(f.db)).not.toEqual([original]);
    expect(f.adapter.database.inTransaction).toBe(false);
  });
});
