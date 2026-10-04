import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  isCurrentTvoedAnnexAPremiumFacts,
  tvoedAnnexAShiftBinding,
  validateSavedTvoedAnnexAPremiumFacts,
} from "@/domain/saved-tvoed-annex-a-premium-facts";
import { migrateDatabase } from "./migrations";
import { saveDatedRemunerationProfile } from "./remuneration-profile-repository";
import { saveShift } from "./calendar-entry-repository";
import {
  listTvoedAnnexAPremiumFacts,
  loadTvoedAnnexAPremiumFacts,
  mapTvoedAnnexAPremiumFactsRow,
  requireTvoedAnnexAPremiumFactsParent,
  saveTvoedAnnexAPremiumFacts,
} from "./tvoed-annex-a-premium-facts-repository";
import { setupTvlShiftWork, type TvlShiftWorkFixture } from "./tvl-shift-work-test-fixtures";

describe("TVöD Anlage A premium facts storage", () => {
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
  const answer = (
    fixture: TvlShiftWorkFixture,
    expectedProfileRevision: number,
    expectedRevision = 0,
  ) => ({
    month: "2026-09",
    profileEffectiveFrom: "2026-09-01",
    expectedProfileRevision,
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

  it("stores explicit month and current shift answers without modifying the shift", async () => {
    const profile = await annexProfile(f);
    const saved = await saveTvoedAnnexAPremiumFacts(f.db, answer(f, profile.revision));
    expect(saved.dayDecisions).toHaveLength(1);
    expect(await loadTvoedAnnexAPremiumFacts(f.db, "2026-09")).toEqual(saved);
    expect(await listTvoedAnnexAPremiumFacts(f.db)).toEqual([saved]);
    expect(isCurrentTvoedAnnexAPremiumFacts(saved, profile, saved.ruleVersionId)).toBe(true);
    expect(isCurrentTvoedAnnexAPremiumFacts(saved, profile, "different")).toBe(false);
    expect(() => requireTvoedAnnexAPremiumFactsParent(saved, [profile])).not.toThrow();
    expect(() => requireTvoedAnnexAPremiumFactsParent(saved, [])).toThrow("profilreferenz");
    const count = f.adapter.database.prepare("SELECT COUNT(*) AS n FROM shift_entries").get() as {
      n: number;
    };
    expect(count.n).toBe(1);
  });

  it("rejects a changed shift even when revision and timestamp are reused", async () => {
    const profile = await annexProfile(f);
    const input = answer(f, profile.revision);
    await f.db.runAsync("UPDATE shift_entries SET start_time='14:00' WHERE id=?", f.shift.id);
    await expect(saveTvoedAnnexAPremiumFacts(f.db, input)).rejects.toThrow("Dienst wurde geändert");
    expect(await loadTvoedAnnexAPremiumFacts(f.db, "2026-09")).toBeNull();
  });

  it("stores separate work-day answers for one overnight shift", async () => {
    const profile = await annexProfile(f);
    const night = await saveShift(f.db, {
      ...f.shift,
      expectedRevision: f.shift.revision,
      startTime: "21:00",
      endTime: "07:00",
    });
    const base = answer(f, profile.revision);
    const binding = tvoedAnnexAShiftBinding(night, "Europe/Berlin");
    const saved = await saveTvoedAnnexAPremiumFacts(f.db, {
      ...base,
      dayDecisions: [
        { ...base.dayDecisions[0], shiftBinding: binding },
        {
          ...base.dayDecisions[0],
          date: "2026-09-20",
          shiftBinding: binding,
          holidayTimeOff: false,
        },
      ],
    });
    expect(saved.dayDecisions.map((item) => item.date)).toEqual(["2026-09-19", "2026-09-20"]);
    expect(await loadTvoedAnnexAPremiumFacts(f.db, "2026-09")).toEqual(saved);
  });

  it("stores only the October work date of a September overnight shift", async () => {
    const profile = await annexProfile(f);
    const night = await saveShift(f.db, {
      ...f.shift,
      expectedRevision: f.shift.revision,
      date: "2026-09-30",
      startTime: "21:00",
      endTime: "07:00",
    });
    const base = answer(f, profile.revision);
    const saved = await saveTvoedAnnexAPremiumFacts(f.db, {
      ...base,
      month: "2026-10",
      dayDecisions: [
        {
          ...base.dayDecisions[0],
          date: "2026-10-01",
          shiftBinding: tvoedAnnexAShiftBinding(night, "Europe/Berlin"),
        },
      ],
    });
    expect(saved.dayDecisions[0]?.date).toBe("2026-10-01");
    expect(await loadTvoedAnnexAPremiumFacts(f.db, "2026-10")).toEqual(saved);
  });

  it("rejects stale month writes, split profiles and unrelated tariffs", async () => {
    await expect(saveTvoedAnnexAPremiumFacts(f.db, answer(f, f.profile.revision))).rejects.toThrow(
      "kein TVöD-Anlage-A-Profil",
    );
    const profile = await annexProfile(f);
    const initial = answer(f, profile.revision);
    await saveTvoedAnnexAPremiumFacts(f.db, initial);
    await expect(saveTvoedAnnexAPremiumFacts(f.db, initial)).rejects.toThrow("inzwischen geändert");
    await saveDatedRemunerationProfile(f.db, {
      effectiveFrom: "2026-09-15",
      expectedRevision: 0,
      data: profile.data,
    });
    await expect(
      saveTvoedAnnexAPremiumFacts(f.db, { ...initial, expectedRevision: 1 }),
    ).rejects.toThrow("Vergütungsstand");
  });

  it("rejects malformed rows and future profile references", async () => {
    const profile = await annexProfile(f);
    const saved = await saveTvoedAnnexAPremiumFacts(f.db, answer(f, profile.revision));
    expect(() =>
      requireTvoedAnnexAPremiumFactsParent({ ...saved, profileRevision: profile.revision + 1 }, [
        profile,
      ]),
    ).toThrow("profilreferenz");
    expect(
      isCurrentTvoedAnnexAPremiumFacts(
        saved,
        { ...profile, revision: profile.revision + 1 },
        saved.ruleVersionId,
      ),
    ).toBe(false);
    expect(() =>
      mapTvoedAnnexAPremiumFactsRow({
        month: "2026-10",
        facts_json: JSON.stringify(saved),
      }),
    ).toThrow("Widersprüchlicher");
    expect(() =>
      validateSavedTvoedAnnexAPremiumFacts({
        ...saved,
        dayDecisions: [{ ...saved.dayDecisions[0], shiftId: "other" }],
      }),
    ).toThrow();
  });

  it("migrates atomically and only once", async () => {
    f.adapter.database.exec(
      "DROP TABLE tvoed_annex_a_premium_facts; DELETE FROM schema_migrations WHERE version=29",
    );
    f.adapter.fail = "VALUES(29,?)";
    await expect(migrateDatabase(f.db)).rejects.toThrow("injected");
    expect(
      f.adapter.database
        .prepare("SELECT name FROM sqlite_master WHERE name='tvoed_annex_a_premium_facts'")
        .get(),
    ).toBeUndefined();
    f.adapter.fail = null;
    await migrateDatabase(f.db);
    await migrateDatabase(f.db);
    expect(
      f.adapter.database
        .prepare("SELECT COUNT(*) AS n FROM schema_migrations WHERE version=29")
        .get(),
    ).toEqual({ n: 1 });
  });
});
