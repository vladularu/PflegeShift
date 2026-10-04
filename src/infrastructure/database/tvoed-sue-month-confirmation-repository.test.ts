import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  isCurrentTvoedSueMonthConfirmation,
  validateSavedTvoedSueMonthConfirmation,
} from "@/domain/saved-tvoed-sue-month-confirmation";
import { migrateDatabase } from "./migrations";
import { saveDatedRemunerationProfile } from "./remuneration-profile-repository";
import {
  listTvoedSueMonthConfirmations,
  loadTvoedSueMonthConfirmation,
  mapTvoedSueMonthConfirmationRow,
  requireTvoedSueMonthConfirmationParent,
  saveTvoedSueMonthConfirmation,
} from "./tvoed-sue-month-confirmation-repository";
import { setupTvlShiftWork, type TvlShiftWorkFixture } from "./tvl-shift-work-test-fixtures";

describe("TVöD SuE month confirmations", () => {
  let f: TvlShiftWorkFixture;
  beforeEach(async () => {
    f = await setupTvlShiftWork();
  });
  afterEach(() => f.adapter.database.close());

  const sueProfile = (fixture: TvlShiftWorkFixture) =>
    saveDatedRemunerationProfile(fixture.db, {
      effectiveFrom: "2026-09-01",
      expectedRevision: fixture.profile.revision,
      data: {
        version: 1,
        weeklyMinutes: 1920,
        selection: {
          kind: "tariff",
          packageId: "tvoed-vka-sue-bt-b",
          variant: "BT_B",
          region: "VKA",
          group: "S8a",
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
    tariffApplicabilityConfirmed: true as boolean | null,
    sueClassificationConfirmed: true as boolean | null,
    standardFullTimeConfirmed: true as boolean | null,
    fullMonthBaseEntitlementConfirmed: true as boolean | null,
    fullMonthSameContractConfirmed: true as boolean | null,
    expectedRevision,
  });

  it("persists tri-state answers bound to month, profile and rule revision", async () => {
    const profile = await sueProfile(f);
    const saved = await saveTvoedSueMonthConfirmation(f.db, {
      ...answer(profile.revision),
      sueClassificationConfirmed: null,
    });
    expect(await loadTvoedSueMonthConfirmation(f.db, "2026-09")).toEqual(saved);
    expect(await listTvoedSueMonthConfirmations(f.db)).toEqual([saved]);
    expect(isCurrentTvoedSueMonthConfirmation(saved, profile, saved.ruleVersionId)).toBe(true);
    expect(isCurrentTvoedSueMonthConfirmation(saved, profile, "2027-01-01-draft1")).toBe(false);
    expect(Object.isFrozen(saved)).toBe(true);
  });

  it("rejects another tariff, stale writes and a split profile within the month", async () => {
    await expect(saveTvoedSueMonthConfirmation(f.db, answer(f.profile.revision))).rejects.toThrow(
      "kein TVöD-SuE-Profil",
    );
    const profile = await sueProfile(f);
    await saveTvoedSueMonthConfirmation(f.db, answer(profile.revision));
    await expect(saveTvoedSueMonthConfirmation(f.db, answer(profile.revision))).rejects.toThrow(
      "inzwischen geändert",
    );
    await saveDatedRemunerationProfile(f.db, {
      effectiveFrom: "2026-09-15",
      expectedRevision: 0,
      data: profile.data,
    });
    await expect(saveTvoedSueMonthConfirmation(f.db, answer(profile.revision, 1))).rejects.toThrow(
      "Vergütungsstand",
    );
  });

  it("keeps stale history while rejecting malformed rows and future profile references", async () => {
    const profile = await sueProfile(f);
    const saved = await saveTvoedSueMonthConfirmation(f.db, answer(profile.revision));
    expect(() => requireTvoedSueMonthConfirmationParent(saved, [profile])).not.toThrow();
    expect(() => requireTvoedSueMonthConfirmationParent(saved, [])).toThrow("profilreferenz");
    expect(() =>
      requireTvoedSueMonthConfirmationParent({ ...saved, profileRevision: profile.revision + 1 }, [
        profile,
      ]),
    ).toThrow("profilreferenz");
    expect(
      isCurrentTvoedSueMonthConfirmation(
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
      { sueClassificationConfirmed: "yes" },
      { standardFullTimeWeeklyMinutes: 2400 },
      { profileRevision: 0 },
      { extra: true },
    ])
      expect(() => validateSavedTvoedSueMonthConfirmation({ ...saved, ...change })).toThrow();
    expect(() =>
      mapTvoedSueMonthConfirmationRow({
        month: "2026-10",
        confirmation_json: JSON.stringify(saved),
      }),
    ).toThrow();
  });

  it("applies additive migration 27 exactly once and rolls failed registration back", async () => {
    f.adapter.database.exec(
      "DROP TABLE tvoed_sue_month_confirmations; DELETE FROM schema_migrations WHERE version=27",
    );
    f.adapter.fail = "VALUES(27,?)";
    await expect(migrateDatabase(f.db)).rejects.toThrow("injected");
    expect(
      f.adapter.database
        .prepare("SELECT name FROM sqlite_master WHERE name='tvoed_sue_month_confirmations'")
        .get(),
    ).toBeUndefined();
    f.adapter.fail = null;
    await migrateDatabase(f.db);
    await migrateDatabase(f.db);
    expect(await listTvoedSueMonthConfirmations(f.db)).toEqual([]);
    expect(
      f.adapter.database.prepare("SELECT COUNT(*) n FROM schema_migrations WHERE version=27").get(),
    ).toEqual({ n: 1 });
  });
});
