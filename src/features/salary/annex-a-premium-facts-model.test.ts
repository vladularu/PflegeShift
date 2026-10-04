import { describe, expect, it } from "vitest";
import type { DatedRemunerationProfile } from "@/domain/remuneration-profile";
import { validateSavedTvoedAnnexAPremiumFacts } from "@/domain/saved-tvoed-annex-a-premium-facts";
import { history, shift, work } from "@/engine/remuneration-test-fixtures";
import {
  annexAPremiumDayChoices,
  currentAnnexAPremiumDayDecision,
} from "./annex-a-premium-facts-model";

const profile: DatedRemunerationProfile = {
  ...history("2026-09-01"),
  data: {
    version: 1,
    weeklyMinutes: 2340,
    selection: {
      kind: "tariff",
      packageId: "tvoed-vka-anlage-a",
      variant: "BT_K",
      region: "VKA",
      group: "EG8",
      level: "3",
      fullTimeWeeklyMinutes: 2340,
    },
  },
};

describe("TVöD Anlage A work-day choices", () => {
  it("offers both local dates of one night shift and only the current-month carry-in day", () => {
    const night = shift({
      id: "overnight",
      date: "2026-09-30",
      startTime: "23:00",
      endTime: "01:00",
    });
    expect(
      annexAPremiumDayChoices("2026-09", [night], profile, work.timeZone).map((c) => c.date),
    ).toEqual(["2026-09-30"]);
    expect(
      annexAPremiumDayChoices("2026-10", [night], profile, work.timeZone).map((c) => c.date),
    ).toEqual(["2026-10-01"]);
    const sameMonth = shift({ id: "same-month", date: "2026-09-20" });
    const choices = annexAPremiumDayChoices("2026-09", [sameMonth], profile, work.timeZone);
    expect(choices.map((c) => c.date)).toEqual(["2026-09-20", "2026-09-21"]);
    expect(new Set(choices.map((c) => c.key)).size).toBe(2);
  });

  it("does not offer absences, deleted entries, other tariffs or another time zone", () => {
    const entries = [
      shift({ id: "deleted", deletedAt: work.updatedAt }),
      shift({ id: "vacation", type: "VACATION" }),
      shift({ id: "all-day", allDay: true }),
    ];
    expect(annexAPremiumDayChoices("2026-09", entries, profile, work.timeZone)).toEqual([]);
    expect(annexAPremiumDayChoices("2026-09", [shift()], history(), work.timeZone)).toEqual([]);
    expect(annexAPremiumDayChoices("2026-09", [shift()], profile, "UTC")).toEqual([]);
  });

  it("reuses a confirmed answer only for the exact shift content", () => {
    const choice = annexAPremiumDayChoices("2026-09", [shift()], profile, work.timeZone)[0];
    const saved = validateSavedTvoedAnnexAPremiumFacts({
      month: "2026-09",
      profileEffectiveFrom: "2026-09-01",
      profileRevision: profile.revision,
      packageId: "tvoed-vka-anlage-a",
      ruleVersionId: "2026-05-01-draft1",
      variantId: "BT_K",
      regionId: "VKA",
      groupId: "eg8",
      stepId: "s3",
      contractedWeeklyMinutes: 2340,
      comparableFullTimeWeeklyMinutes: 2340,
      timeZoneId: "Europe/Berlin",
      cashPaymentConfirmed: null,
      localAgreement: "UNKNOWN",
      dayDecisions: [
        {
          shiftId: choice.shift.id,
          date: choice.date,
          origin: "confirmed",
          shiftBinding: choice.shiftBinding,
          workKind: "REGULAR_ACTIVE",
          holidayTimeOff: null,
          shiftWork: null,
          legacyAngestellteClass: null,
        },
      ],
      revision: 1,
      confirmedAt: "2026-09-24T09:00:00.000Z",
      updatedAt: "2026-09-24T09:00:00.000Z",
    });
    expect(currentAnnexAPremiumDayDecision(choice, saved)?.workKind).toBe("REGULAR_ACTIVE");
    const changed = annexAPremiumDayChoices(
      "2026-09",
      [shift({ startTime: "22:00" })],
      profile,
      work.timeZone,
    )[0];
    expect(currentAnnexAPremiumDayDecision(changed, saved)).toBeNull();
  });
});
