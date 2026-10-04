import { LATEST_DATABASE_SCHEMA_VERSION } from "./migrations";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { tvoedAnnexAShiftBinding } from "@/domain/saved-tvoed-annex-a-premium-facts";
import { LOCAL_BACKUP_VERSION, loadLocalBackupSnapshot } from "./local-backup";
import { restoreLocalBackup } from "./local-backup-restore";
import { saveDatedRemunerationProfile } from "./remuneration-profile-repository";
import {
  listTvoedAnnexAPremiumFacts,
  saveTvoedAnnexAPremiumFacts,
} from "./tvoed-annex-a-premium-facts-repository";
import {
  exportTvlBackup,
  resignTvlBackup,
  setupTvlShiftWork,
  validateTvlBackup,
  type TvlShiftWorkFixture,
} from "./tvl-shift-work-test-fixtures";

describe("TVöD Anlage A premium facts in local backup v17", () => {
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
          variant: "BT_K",
          region: "VKA",
          group: "EG6",
          level: "2",
          fullTimeWeeklyMinutes: 2340,
        },
      },
    });
    profileRevision = profile.revision;
  });
  afterEach(() => f.adapter.database.close());

  const answer = (fixture: TvlShiftWorkFixture, expectedRevision = 0) => ({
    month: "2026-09",
    profileEffectiveFrom: "2026-09-01",
    expectedProfileRevision: profileRevision,
    ruleVersionId: "2026-05-01-draft1",
    cashPaymentConfirmed: true as boolean | null,
    localAgreement: "NONE_CONFIRMED" as const,
    dayDecisions: [
      {
        shiftId: fixture.shift.id,
        date: fixture.shift.date,
        origin: "confirmed" as const,
        shiftBinding: tvoedAnnexAShiftBinding(fixture.shift, "Europe/Berlin"),
        workKind: "REGULAR_ACTIVE" as const,
        holidayTimeOff: null,
        shiftWork: true,
        legacyAngestellteClass: null,
      },
    ],
    expectedRevision,
  });

  it("round-trips exact answers and preserves the other user data", async () => {
    const saved = await saveTvoedAnnexAPremiumFacts(f.db, answer(f));
    const before = await loadLocalBackupSnapshot(f.db);
    const exported = await exportTvlBackup(f);
    expect(exported.document).toMatchObject({
      version: LOCAL_BACKUP_VERSION,
      databaseSchemaVersion: LATEST_DATABASE_SCHEMA_VERSION,
    });
    expect(exported.document.data.tvoedAnnexAPremiumFacts).toHaveLength(1);
    await f.db.runAsync("DELETE FROM tvoed_annex_a_premium_facts");
    await restoreLocalBackup(f.db, await validateTvlBackup(exported.serialized));
    expect(await listTvoedAnnexAPremiumFacts(f.db)).toEqual([saved]);
    expect(await loadLocalBackupSnapshot(f.db)).toEqual(before);
  });

  it("loads a v16 backup without inventing or retaining newer answers", async () => {
    await saveTvoedAnnexAPremiumFacts(f.db, answer(f));
    const legacy = await resignTvlBackup((await exportTvlBackup(f)).serialized, (root) => {
      root.version = 16;
      root.databaseSchemaVersion = 28;
      delete root.data.tvoedAnnexAPremiumFacts;
    });
    const checked = await validateTvlBackup(legacy);
    expect(checked.document.data.tvoedAnnexAPremiumFacts).toEqual([]);
    await restoreLocalBackup(f.db, checked);
    expect(await listTvoedAnnexAPremiumFacts(f.db)).toEqual([]);
  });

  it.each([
    "missing",
    "duplicate",
    "wrong-month",
    "future",
    "orphan-profile",
    "orphan-shift",
    "schema",
  ])("rejects %s before changing the database", async (mutation) => {
    await saveTvoedAnnexAPremiumFacts(f.db, answer(f));
    const before = await loadLocalBackupSnapshot(f.db);
    const changed = await resignTvlBackup((await exportTvlBackup(f)).serialized, (root) => {
      const rows = root.data.tvoedAnnexAPremiumFacts as Record<string, unknown>[];
      const row = rows[0];
      const parsed = JSON.parse(row.facts_json as string);
      if (mutation === "missing") delete root.data.tvoedAnnexAPremiumFacts;
      if (mutation === "duplicate") rows.push({ ...row });
      if (mutation === "wrong-month") row.month = "2026-10";
      if (mutation === "future") parsed.profileRevision = 999;
      if (mutation === "orphan-profile") parsed.profileEffectiveFrom = "2025-01-01";
      if (mutation === "orphan-shift") {
        parsed.dayDecisions[0].shiftId = "missing-shift";
        const binding = JSON.parse(parsed.dayDecisions[0].shiftBinding);
        binding[0] = "missing-shift";
        parsed.dayDecisions[0].shiftBinding = JSON.stringify(binding);
      }
      if (mutation === "schema") root.databaseSchemaVersion = 28;
      row.facts_json = JSON.stringify(parsed);
    });
    await expect(validateTvlBackup(changed)).rejects.toThrow();
    expect(await loadLocalBackupSnapshot(f.db)).toEqual(before);
  });

  it("rolls failed replacement back, including the original confirmation", async () => {
    await saveTvoedAnnexAPremiumFacts(f.db, answer(f));
    const checked = await validateTvlBackup((await exportTvlBackup(f)).serialized);
    await saveTvoedAnnexAPremiumFacts(f.db, { ...answer(f, 1), cashPaymentConfirmed: false });
    const before = await loadLocalBackupSnapshot(f.db);
    f.adapter.fail = "INSERT INTO tvoed_annex_a_premium_facts";
    await expect(restoreLocalBackup(f.db, checked)).rejects.toThrow("injected");
    expect(await loadLocalBackupSnapshot(f.db)).toEqual(before);
    expect(f.adapter.database.inTransaction).toBe(false);
  });
});
