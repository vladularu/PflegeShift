import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  isCurrentCaritasMonthFacts,
  validateSavedCaritasMonthFacts,
} from "@/domain/saved-caritas-month-facts";
import {
  listCaritasMonthFacts,
  loadCaritasMonthFacts,
  mapCaritasMonthFactsRow,
  requireCaritasMonthFactsParent,
  saveCaritasMonthFacts,
} from "./caritas-month-facts-repository";
import { migrateDatabase } from "./migrations";
import { saveDatedRemunerationProfile } from "./remuneration-profile-repository";
import { setupTvlShiftWork, type TvlShiftWorkFixture } from "./tvl-shift-work-test-fixtures";

describe("Caritas month-specific confirmed facts", () => {
  let f: TvlShiftWorkFixture;
  beforeEach(async () => {
    f = await setupTvlShiftWork();
  });
  afterEach(() => f.adapter.database.close());
  const caritasProfile = async (fixture: TvlShiftWorkFixture) =>
    saveDatedRemunerationProfile(fixture.db, {
      effectiveFrom: "2026-09-01",
      expectedRevision: fixture.profile.revision,
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
  const input = (profileRevision: number) => ({
    month: "2026-09",
    profileEffectiveFrom: "2026-09-01",
    expectedProfileRevision: profileRevision,
    ruleVersionId: "2026-02-01-draft1",
    fullMonthEmploymentConfirmed: true as boolean | null,
    fullMonthlyBaseEntitlementConfirmed: true as boolean | null,
    fixedAllowanceClaim: "NOT_ENTITLED" as const,
    careAllowanceClaim: "UNKNOWN" as const,
    localAgreement: "UNKNOWN" as const,
    expectedRevision: 0,
  });

  it("persists tri-state answers bound to profile and rule revisions", async () => {
    const profile = await caritasProfile(f);
    const saved = await saveCaritasMonthFacts(f.db, {
      ...input(profile.revision),
      fullMonthEmploymentConfirmed: null,
      fullMonthlyBaseEntitlementConfirmed: false,
    });
    expect(await loadCaritasMonthFacts(f.db, "2026-09")).toEqual(saved);
    expect(await listCaritasMonthFacts(f.db)).toEqual([saved]);
    expect(
      isCurrentCaritasMonthFacts(saved, profile, "avr-caritas-p-bw", "2026-02-01-draft1"),
    ).toBe(true);
    expect(
      isCurrentCaritasMonthFacts(saved, profile, "avr-caritas-p-bw", "2027-01-01-draft1"),
    ).toBe(false);
    expect(Object.isFrozen(saved)).toBe(true);
  });

  it("rejects non-Caritas selection, conflicts, and a profile split within the month", async () => {
    await expect(saveCaritasMonthFacts(f.db, input(f.profile.revision))).rejects.toThrow(
      "Caritas-Pflegeprofil",
    );
    const profile = await caritasProfile(f);
    await saveCaritasMonthFacts(f.db, input(profile.revision));
    await expect(saveCaritasMonthFacts(f.db, input(profile.revision))).rejects.toThrow(
      "inzwischen geändert",
    );
    await saveDatedRemunerationProfile(f.db, {
      effectiveFrom: "2026-09-15",
      expectedRevision: 0,
      data: profile.data,
    });
    await expect(
      saveCaritasMonthFacts(f.db, {
        ...input(profile.revision),
        expectedRevision: 1,
      }),
    ).rejects.toThrow("Vergütungsstand");
    expect(await listCaritasMonthFacts(f.db)).toHaveLength(1);
  });

  it("keeps stale history but rejects missing or future profile references", async () => {
    const profile = await caritasProfile(f);
    const saved = await saveCaritasMonthFacts(f.db, input(profile.revision));
    expect(() => requireCaritasMonthFactsParent(saved, [profile])).not.toThrow();
    expect(() => requireCaritasMonthFactsParent(saved, [])).toThrow("profilreferenz");
    expect(() =>
      requireCaritasMonthFactsParent({ ...saved, profileRevision: profile.revision + 1 }, [
        profile,
      ]),
    ).toThrow("profilreferenz");
    expect(() =>
      requireCaritasMonthFactsParent(saved, [
        {
          ...profile,
          revision: profile.revision + 1,
        },
      ]),
    ).not.toThrow();
    expect(
      isCurrentCaritasMonthFacts(
        saved,
        {
          ...profile,
          revision: profile.revision + 1,
        },
        saved.packageId,
        saved.ruleVersionId,
      ),
    ).toBe(false);
  });

  it("rejects malformed claims, dates, versions, and mismatched SQL keys", async () => {
    const profile = await caritasProfile(f);
    const saved = await saveCaritasMonthFacts(f.db, input(profile.revision));
    for (const change of [
      { month: "2026-13" },
      { fullMonthEmploymentConfirmed: "yes" },
      { careAllowanceClaim: "MAYBE" },
      { localAgreement: "OTHER" },
      { ruleVersionId: "" },
      { profileRevision: 0 },
      { extra: true },
      { confirmedAt: "2099-01-01T00:00:00Z" },
    ])
      expect(() => validateSavedCaritasMonthFacts({ ...saved, ...change })).toThrow();
    expect(() =>
      mapCaritasMonthFactsRow({
        month: "2026-10",
        facts_json: JSON.stringify(saved),
      }),
    ).toThrow();
  });

  it("applies additive migration 24 exactly once and rolls failed registration back", async () => {
    const before = f.adapter.database.prepare("SELECT * FROM shift_entries").all();
    f.adapter.database.exec(
      "DROP TABLE caritas_month_facts; DELETE FROM schema_migrations WHERE version=24",
    );
    f.adapter.fail = "VALUES(24,?)";
    await expect(migrateDatabase(f.db)).rejects.toThrow("injected");
    expect(
      f.adapter.database
        .prepare("SELECT name FROM sqlite_master WHERE name='caritas_month_facts'")
        .get(),
    ).toBeUndefined();
    f.adapter.fail = null;
    await migrateDatabase(f.db);
    await migrateDatabase(f.db);
    expect(await listCaritasMonthFacts(f.db)).toEqual([]);
    expect(f.adapter.database.prepare("SELECT * FROM shift_entries").all()).toEqual(before);
    expect(
      f.adapter.database.prepare("SELECT COUNT(*) n FROM schema_migrations WHERE version=24").get(),
    ).toEqual({ n: 1 });
  });
});
