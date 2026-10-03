import { describe, expect, it } from "vitest";
import { history, shift } from "@/engine/remuneration-test-fixtures";
import { requireTvlBurnCareIntervalParents } from "@/engine/tvl-burn-care-intervals";
import type { DatedRemunerationProfile } from "./remuneration-profile";
import {
  isCurrentTvlServiceFacts,
  isCurrentTvlShiftWork,
  validateTvlShiftWork,
} from "./saved-tvl-shift-work";
import { validateTvlBurnCareIntervals } from "./tvl-burn-care";

const profile: DatedRemunerationProfile = {
  ...history("2026-09-01"),
  data: {
    version: 4,
    weeklyMinutes: 2310,
    selection: {
      kind: "tariff",
      packageId: "tvl-kr-tdl",
      variant: "SECTION_43",
      region: "WEST_38_5",
      group: "KR5",
      level: "1",
      fullTimeWeeklyMinutes: 2310,
      tvlEmploymentCategory: "SALARIED_SECTION_38_5_1",
    },
  },
};
const service = shift({
  date: "2026-09-19",
  startTime: "20:00",
  endTime: "06:00",
  breakMinutes: 60,
});
const facts = {
  shiftId: service.id,
  shiftRevision: service.revision,
  shiftDate: service.date,
  shiftUpdatedAt: service.updatedAt,
  timeZone: "Europe/Berlin",
  profileEffectiveFrom: profile.effectiveFrom,
  profileRevision: profile.revision,
  shiftWork: null,
  revision: 1,
  confirmedAt: "2026-09-22T00:00:00Z",
  updatedAt: "2026-09-22T00:00:00Z",
};

describe("TV-L service facts before storage or entitlement calculation", () => {
  it("preserves unknown activity, an explicit empty result and an independent Saturday decision", () => {
    const absent = validateTvlShiftWork(facts);
    expect(Object.hasOwn(absent, "burnCareIntervals")).toBe(false);
    const unknown = validateTvlShiftWork({ ...facts, burnCareIntervals: null });
    expect(unknown.burnCareIntervals).toBeNull();
    const none = validateTvlShiftWork({ ...facts, burnCareIntervals: [] });
    expect(none.burnCareIntervals).toEqual([]);
    expect(isCurrentTvlServiceFacts(none, service, "Europe/Berlin", profile)).toBe(true);
    expect(isCurrentTvlShiftWork(none, service, "Europe/Berlin", profile)).toBe(false);
    for (const shiftWork of [true, false]) {
      const decided = validateTvlShiftWork({ ...facts, shiftWork });
      expect(isCurrentTvlShiftWork(decided, service, "Europe/Berlin", profile)).toBe(true);
    }
    expect(Object.isFrozen(none)).toBe(true);
    expect(Object.isFrozen(none.burnCareIntervals)).toBe(true);
  });

  it("requires reconfirmation after every service, profile or timezone change", () => {
    const saved = validateTvlShiftWork({ ...facts, shiftWork: false });
    for (const changed of [
      { ...service, id: "another" },
      { ...service, revision: 2 },
      { ...service, date: "2026-09-20" },
      { ...service, updatedAt: "2026-09-23T00:00:00Z" },
      { ...service, deletedAt: "2026-09-23T00:00:00Z" },
      { ...service, allDay: true },
      { ...service, type: "VACATION" as const },
    ])
      expect(isCurrentTvlServiceFacts(saved, changed, "Europe/Berlin", profile)).toBe(false);
    expect(isCurrentTvlServiceFacts(saved, service, "UTC", profile)).toBe(false);
    expect(
      isCurrentTvlServiceFacts(saved, service, "Europe/Berlin", { ...profile, revision: 2 }),
    ).toBe(false);
    expect(isCurrentTvlServiceFacts(saved, service, "Europe/Berlin", history("2026-09-01"))).toBe(
      false,
    );
    expect(saved.shiftWork).toBe(false);
  });

  it("rejects corrupt or ambiguous persisted identity before using a confirmation", () => {
    for (const change of [
      { shiftWork: "yes" },
      { revision: 0 },
      { shiftRevision: 1.5 },
      { profileRevision: -1 },
      { profileEffectiveFrom: "2026-02-30" },
      { shiftDate: "2026-02-30" },
      { timeZone: "+02:00" },
      { timeZone: "Not/AZone" },
      { shiftId: "" },
      { extra: true },
      { confirmedAt: "2099-01-01T00:00:00Z" },
    ])
      expect(() => validateTvlShiftWork({ ...facts, ...change })).toThrow();
  });

  it("owns and freezes intervals and rejects overlapping, unordered or impossible activity", () => {
    const input = [
      { from: 0, until: 120 },
      { from: 150, until: 240 },
    ];
    const intervals = validateTvlBurnCareIntervals(input)!;
    input[0]!.until = 150;
    expect(intervals).toEqual([
      { from: 0, until: 120 },
      { from: 150, until: 240 },
    ]);
    expect(Object.isFrozen(intervals[0])).toBe(true);
    for (const invalid of [
      [{ from: -1, until: 60 }],
      [{ from: 0, until: 0 }],
      [{ from: 0, until: 60.5 }],
      [{ from: 0, until: 1501 }],
      [
        { from: 0, until: 120 },
        { from: 119, until: 180 },
      ],
      [{ from: 0, until: 60, extra: true }],
    ])
      expect(() => validateTvlBurnCareIntervals(invalid)).toThrow();
  });

  it("binds each elapsed interval to its actual dated profile across midnight", () => {
    const next = { ...profile, effectiveFrom: "2026-09-20" };
    const profiles = [profile, next];
    expect(() =>
      requireTvlBurnCareIntervalParents(
        [{ from: 0, until: 240 }],
        service,
        "Europe/Berlin",
        profile,
        profiles,
      ),
    ).not.toThrow();
    expect(() =>
      requireTvlBurnCareIntervalParents(
        [{ from: 240, until: 300 }],
        service,
        "Europe/Berlin",
        next,
        profiles,
      ),
    ).not.toThrow();
    expect(() =>
      requireTvlBurnCareIntervalParents(
        [{ from: 240, until: 300 }],
        service,
        "Europe/Berlin",
        profile,
        profiles,
      ),
    ).toThrow("Vergütungszeitraum");
    expect(() =>
      requireTvlBurnCareIntervalParents(
        [{ from: 0, until: 600 }],
        service,
        "Europe/Berlin",
        profile,
        [profile],
      ),
    ).toThrow("ohne Pause");
  });

  it("uses real elapsed bounds at the daylight-saving rollback", () => {
    const dst = shift({ date: "2026-10-24", startTime: "23:00", endTime: "04:00" });
    expect(() =>
      requireTvlBurnCareIntervalParents([{ from: 0, until: 360 }], dst, "Europe/Berlin", profile, [
        profile,
      ]),
    ).not.toThrow();
    expect(() =>
      requireTvlBurnCareIntervalParents([{ from: 0, until: 361 }], dst, "Europe/Berlin", profile, [
        profile,
      ]),
    ).toThrow();
  });
});
