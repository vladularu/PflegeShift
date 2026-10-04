import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  isCurrentTvoedSueAllowanceConfirmation,
  validateSavedTvoedSueAllowanceConfirmation,
} from "@/domain/saved-tvoed-sue-allowance-confirmation";
import { migrateDatabase } from "./migrations";
import { saveDatedRemunerationProfile } from "./remuneration-profile-repository";
import {
  listTvoedSueAllowanceConfirmations,
  mapTvoedSueAllowanceConfirmationRow,
  requireTvoedSueAllowanceConfirmationParent,
  saveTvoedSueAllowanceConfirmation,
} from "./tvoed-sue-allowance-confirmation-repository";
import { setupTvlShiftWork, type TvlShiftWorkFixture } from "./tvl-shift-work-test-fixtures";

describe("TVöD SuE allowance confirmations", () => {
  let f: TvlShiftWorkFixture;
  beforeEach(async () => {
    f = await setupTvlShiftWork();
  });
  afterEach(() => f.adapter.database.close());

  const sueProfile = (fixture: TvlShiftWorkFixture, group = "S8a") =>
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
          group,
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
    sectionXxivClassificationConfirmed: true as boolean | null,
    fullMonthAllowanceEntitlementConfirmed: true as boolean | null,
    caseGroup: null as "6" | "OTHER" | null,
    conversionDays: "NONE_CONFIRMED" as "NONE_CONFIRMED" | "TAKEN" | null,
    expectedRevision,
  });

  it("records S15 case group 6 only when explicitly entered", async () => {
    const profile = await sueProfile(f, "S15");
    const saved = await saveTvoedSueAllowanceConfirmation(f.db, {
      ...answer(profile.revision),
      caseGroup: "6",
    });
    expect(saved.caseGroup).toBe("6");
    expect(saved.groupId).toBe("s15");
    expect(() =>
      validateSavedTvoedSueAllowanceConfirmation({ ...saved, caseGroup: "7" }),
    ).toThrow();
  });

  it("rejects wrong tariff, conflicting writes, split months and fabricated facts", async () => {
    await expect(
      saveTvoedSueAllowanceConfirmation(f.db, answer(f.profile.revision)),
    ).rejects.toThrow("kein TVöD-SuE-Profil");
    const profile = await sueProfile(f);
    const saved = await saveTvoedSueAllowanceConfirmation(f.db, answer(profile.revision));
    await expect(saveTvoedSueAllowanceConfirmation(f.db, answer(profile.revision))).rejects.toThrow(
      "inzwischen geändert",
    );
    for (const change of [
      { caseGroup: "6" },
      { conversionDays: "NOT_KNOWN" },
      { fullMonthAllowanceEntitlementConfirmed: "yes" },
      { groupId: "s10" },
      { ruleVersionId: "" },
      { extra: true },
    ])
      expect(() => validateSavedTvoedSueAllowanceConfirmation({ ...saved, ...change })).toThrow();
    expect(() =>
      mapTvoedSueAllowanceConfirmationRow({
        month: "2026-10",
        confirmation_json: JSON.stringify(saved),
      }),
    ).toThrow();
    await saveDatedRemunerationProfile(f.db, {
      effectiveFrom: "2026-09-15",
      expectedRevision: 0,
      data: profile.data,
    });
    await expect(
      saveTvoedSueAllowanceConfirmation(f.db, answer(profile.revision, 1)),
    ).rejects.toThrow("Vergütungsstand");
    expect(await listTvoedSueAllowanceConfirmations(f.db)).toEqual([saved]);
  });

  it("retains a historical answer but rejects false parent references", async () => {
    const profile = await sueProfile(f);
    const saved = await saveTvoedSueAllowanceConfirmation(f.db, answer(profile.revision));
    expect(() => requireTvoedSueAllowanceConfirmationParent(saved, [profile])).not.toThrow();
    expect(() => requireTvoedSueAllowanceConfirmationParent(saved, [])).toThrow("profilreferenz");
    expect(() =>
      requireTvoedSueAllowanceConfirmationParent(
        { ...saved, profileRevision: profile.revision + 1 },
        [profile],
      ),
    ).toThrow("profilreferenz");
    expect(
      isCurrentTvoedSueAllowanceConfirmation(
        saved,
        { ...profile, revision: profile.revision + 1 },
        saved.ruleVersionId,
      ),
    ).toBe(false);
  });

  it("applies additive migration 28 once and rolls failed registration back", async () => {
    f.adapter.database.exec(
      "DROP TABLE tvoed_sue_allowance_confirmations; DELETE FROM schema_migrations WHERE version=28",
    );
    f.adapter.fail = "VALUES(28,?)";
    await expect(migrateDatabase(f.db)).rejects.toThrow("injected");
    expect(
      f.adapter.database
        .prepare("SELECT name FROM sqlite_master WHERE name='tvoed_sue_allowance_confirmations'")
        .get(),
    ).toBeUndefined();
    f.adapter.fail = null;
    await migrateDatabase(f.db);
    await migrateDatabase(f.db);
    expect(await listTvoedSueAllowanceConfirmations(f.db)).toEqual([]);
    expect(
      f.adapter.database.prepare("SELECT COUNT(*) n FROM schema_migrations WHERE version=28").get(),
    ).toEqual({ n: 1 });
  });
});
