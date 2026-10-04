import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  isCurrentTvoedAnnexAMonthConfirmation,
  validateSavedTvoedAnnexAMonthConfirmation,
} from "@/domain/saved-tvoed-annex-a-month-confirmation";
import { migrateDatabase } from "./migrations";
import { saveDatedRemunerationProfile } from "./remuneration-profile-repository";
import {
  listTvoedAnnexAMonthConfirmations,
  loadTvoedAnnexAMonthConfirmation,
  mapTvoedAnnexAMonthConfirmationRow,
  requireTvoedAnnexAMonthConfirmationParent,
  saveTvoedAnnexAMonthConfirmation,
} from "./tvoed-annex-a-month-confirmation-repository";
import { setupTvlShiftWork, type TvlShiftWorkFixture } from "./tvl-shift-work-test-fixtures";

describe("TVöD Anlage A month confirmations", () => {
  let f: TvlShiftWorkFixture;
  beforeEach(async () => {
    f = await setupTvlShiftWork();
  });
  afterEach(() => f.adapter.database.close());
  const annexProfile = (fixture: TvlShiftWorkFixture) =>
    saveDatedRemunerationProfile(fixture.db, {
      effectiveFrom: "2026-09-01",
      expectedRevision: fixture.profile.revision,
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
  const answer = (expectedProfileRevision: number, expectedRevision = 0) => ({
    month: "2026-09",
    profileEffectiveFrom: "2026-09-01",
    expectedProfileRevision,
    ruleVersionId: "2026-05-01-draft1",
    applicabilityConfirmed: true as boolean | null,
    comparableFullTimeConfirmed: true as boolean | null,
    fullMonthBaseEntitlementConfirmed: true as boolean | null,
    fullMonthSameContractConfirmed: true as boolean | null,
    expectedRevision,
  });

  it("persists tri-state answers bound to month, profile and rule version", async () => {
    const profile = await annexProfile(f);
    const saved = await saveTvoedAnnexAMonthConfirmation(f.db, {
      ...answer(profile.revision),
      comparableFullTimeConfirmed: null,
    });
    expect(await loadTvoedAnnexAMonthConfirmation(f.db, "2026-09")).toEqual(saved);
    expect(await listTvoedAnnexAMonthConfirmations(f.db)).toEqual([saved]);
    expect(isCurrentTvoedAnnexAMonthConfirmation(saved, profile, saved.ruleVersionId)).toBe(true);
    expect(isCurrentTvoedAnnexAMonthConfirmation(saved, profile, "2027-01-01-draft1")).toBe(false);
    expect(Object.isFrozen(saved)).toBe(true);
  });

  it("rejects other tariff, stale writes and a split profile within the month", async () => {
    await expect(
      saveTvoedAnnexAMonthConfirmation(f.db, answer(f.profile.revision)),
    ).rejects.toThrow("kein TVöD-Anlage-A-Profil");
    const profile = await annexProfile(f);
    await saveTvoedAnnexAMonthConfirmation(f.db, answer(profile.revision));
    await expect(saveTvoedAnnexAMonthConfirmation(f.db, answer(profile.revision))).rejects.toThrow(
      "inzwischen geändert",
    );
    await saveDatedRemunerationProfile(f.db, {
      effectiveFrom: "2026-09-15",
      expectedRevision: 0,
      data: profile.data,
    });
    await expect(
      saveTvoedAnnexAMonthConfirmation(f.db, answer(profile.revision, 1)),
    ).rejects.toThrow("Vergütungsstand");
  });

  it("keeps stale history, but rejects malformed rows or future profile references", async () => {
    const profile = await annexProfile(f);
    const saved = await saveTvoedAnnexAMonthConfirmation(f.db, answer(profile.revision));
    expect(() => requireTvoedAnnexAMonthConfirmationParent(saved, [profile])).not.toThrow();
    expect(() => requireTvoedAnnexAMonthConfirmationParent(saved, [])).toThrow("profilreferenz");
    expect(() =>
      requireTvoedAnnexAMonthConfirmationParent(
        { ...saved, profileRevision: profile.revision + 1 },
        [profile],
      ),
    ).toThrow("profilreferenz");
    expect(
      isCurrentTvoedAnnexAMonthConfirmation(
        saved,
        { ...profile, revision: profile.revision + 1 },
        saved.ruleVersionId,
      ),
    ).toBe(false);
    for (const change of [
      { month: "2026-13" },
      { groupId: "p6" },
      { stepId: "s7" },
      { ruleVersionId: "" },
      { applicabilityConfirmed: "yes" },
      { profileRevision: 0 },
      { extra: true },
    ])
      expect(() => validateSavedTvoedAnnexAMonthConfirmation({ ...saved, ...change })).toThrow();
    expect(() =>
      mapTvoedAnnexAMonthConfirmationRow({
        month: "2026-10",
        confirmation_json: JSON.stringify(saved),
      }),
    ).toThrow();
  });

  it("applies additive migration 26 exactly once and rolls failed registration back", async () => {
    f.adapter.database.exec(
      "DROP TABLE tvoed_annex_a_month_confirmations; DELETE FROM schema_migrations WHERE version=26",
    );
    f.adapter.fail = "VALUES(26,?)";
    await expect(migrateDatabase(f.db)).rejects.toThrow("injected");
    expect(
      f.adapter.database
        .prepare("SELECT name FROM sqlite_master WHERE name='tvoed_annex_a_month_confirmations'")
        .get(),
    ).toBeUndefined();
    f.adapter.fail = null;
    await migrateDatabase(f.db);
    await migrateDatabase(f.db);
    expect(await listTvoedAnnexAMonthConfirmations(f.db)).toEqual([]);
    expect(
      f.adapter.database.prepare("SELECT COUNT(*) n FROM schema_migrations WHERE version=26").get(),
    ).toEqual({ n: 1 });
  });
});
