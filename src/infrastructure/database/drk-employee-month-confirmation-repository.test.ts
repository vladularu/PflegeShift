import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  isCurrentDrkEmployeeMonthConfirmation,
  validateSavedDrkEmployeeMonthConfirmation,
} from "@/domain/saved-drk-employee-month-confirmation";
import { migrateDatabase } from "./migrations";
import { saveDatedRemunerationProfile } from "./remuneration-profile-repository";
import {
  listDrkEmployeeMonthConfirmations,
  loadDrkEmployeeMonthConfirmation,
  mapDrkEmployeeMonthConfirmationRow,
  requireDrkEmployeeMonthConfirmationParent,
  saveDrkEmployeeMonthConfirmation,
} from "./drk-employee-month-confirmation-repository";
import { setupTvlShiftWork, type TvlShiftWorkFixture } from "./tvl-shift-work-test-fixtures";

describe("DRK employee month confirmations", () => {
  let f: TvlShiftWorkFixture;
  beforeEach(async () => {
    f = await setupTvlShiftWork();
  });
  afterEach(() => f.adapter.database.close());

  const drkProfile = (fixture: TvlShiftWorkFixture) =>
    saveDatedRemunerationProfile(fixture.db, {
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
  const answer = (expectedProfileRevision: number, expectedRevision = 0) => ({
    month: "2026-10",
    profileEffectiveFrom: "2026-10-01",
    expectedProfileRevision,
    ruleVersionId: "2026-10-01-draft1",
    drkApplicabilityConfirmed: true as boolean | null,
    annexAssignmentConfirmed: true as boolean | null,
    payGroupAndStepConfirmed: true as boolean | null,
    weeklyTimeBasisConfirmed: true as boolean | null,
    fullMonthBaseEntitlementConfirmed: true as boolean | null,
    expectedRevision,
  });

  it("persists five tri-state answers with a dated profile and catalog version", async () => {
    const profile = await drkProfile(f);
    const saved = await saveDrkEmployeeMonthConfirmation(f.db, {
      ...answer(profile.revision),
      annexAssignmentConfirmed: null,
    });
    expect(await loadDrkEmployeeMonthConfirmation(f.db, "2026-10")).toEqual(saved);
    expect(await listDrkEmployeeMonthConfirmations(f.db)).toEqual([saved]);
    expect(isCurrentDrkEmployeeMonthConfirmation(saved, profile, saved.ruleVersionId)).toBe(true);
    expect(isCurrentDrkEmployeeMonthConfirmation(saved, profile, "2027-10-01-draft1")).toBe(false);
    expect(Object.isFrozen(saved)).toBe(true);
  });

  it("rejects unrelated profiles, stale saves, and profile changes inside the month", async () => {
    await expect(
      saveDrkEmployeeMonthConfirmation(f.db, answer(f.profile.revision)),
    ).rejects.toThrow();
    const profile = await drkProfile(f);
    await saveDrkEmployeeMonthConfirmation(f.db, answer(profile.revision));
    await expect(saveDrkEmployeeMonthConfirmation(f.db, answer(profile.revision))).rejects.toThrow(
      "geändert",
    );
    await saveDatedRemunerationProfile(f.db, {
      effectiveFrom: "2026-10-15",
      expectedRevision: 0,
      data: profile.data,
    });
    await expect(
      saveDrkEmployeeMonthConfirmation(f.db, answer(profile.revision, 1)),
    ).rejects.toThrow("Vergütungsstand");
  });

  it("rejects malformed facts and unrelated package/annex combinations", async () => {
    const profile = await drkProfile(f);
    const saved = await saveDrkEmployeeMonthConfirmation(f.db, answer(profile.revision));
    expect(() => requireDrkEmployeeMonthConfirmationParent(saved, [profile])).not.toThrow();
    expect(() => requireDrkEmployeeMonthConfirmationParent(saved, [])).toThrow("profilreferenz");
    for (const change of [
      { month: "2026-13" },
      { packageId: "drk-rtv-e" },
      { variantId: "ANLAGE_A3" },
      { groupId: "P 6" },
      { stepId: "s7" },
      { ruleVersionId: "" },
      { drkApplicabilityConfirmed: "yes" },
      { profileRevision: 0 },
      { extra: true },
    ])
      expect(() => validateSavedDrkEmployeeMonthConfirmation({ ...saved, ...change })).toThrow();
    expect(() =>
      mapDrkEmployeeMonthConfirmationRow({
        month: "2026-11",
        confirmation_json: JSON.stringify(saved),
      }),
    ).toThrow();
  });

  it("applies migration 30 once and rolls failed registration back", async () => {
    f.adapter.database.exec(
      "DROP TABLE drk_employee_month_confirmations; DELETE FROM schema_migrations WHERE version=30",
    );
    f.adapter.fail = "VALUES(30,?)";
    await expect(migrateDatabase(f.db)).rejects.toThrow("injected");
    expect(
      f.adapter.database
        .prepare("SELECT name FROM sqlite_master WHERE name='drk_employee_month_confirmations'")
        .get(),
    ).toBeUndefined();
    f.adapter.fail = null;
    await migrateDatabase(f.db);
    await migrateDatabase(f.db);
    expect(await listDrkEmployeeMonthConfirmations(f.db)).toEqual([]);
    expect(
      f.adapter.database.prepare("SELECT COUNT(*) n FROM schema_migrations WHERE version=30").get(),
    ).toEqual({ n: 1 });
  });
});
