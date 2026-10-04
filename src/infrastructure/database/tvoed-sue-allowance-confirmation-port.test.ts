import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { isCurrentTvoedSueAllowanceConfirmation } from "@/domain/saved-tvoed-sue-allowance-confirmation";
import { loadRemunerationSnapshot } from "./remuneration-snapshot-repository";
import { saveDatedRemunerationProfile } from "./remuneration-profile-repository";
import {
  listTvoedSueAllowanceConfirmations,
  loadTvoedSueAllowanceConfirmation,
  saveTvoedSueAllowanceConfirmation,
} from "./tvoed-sue-allowance-confirmation-repository";
import { setupTvlShiftWork, type TvlShiftWorkFixture } from "./tvl-shift-work-test-fixtures";

describe("TVöD SuE allowance full snapshot acceptance", () => {
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

  it("persists an explicit answer bound to exact profile and rule versions", async () => {
    const profile = await sueProfile(f);
    const saved = await saveTvoedSueAllowanceConfirmation(f.db, {
      ...answer(profile.revision),
      conversionDays: null,
    });
    expect(await loadTvoedSueAllowanceConfirmation(f.db, "2026-09")).toEqual(saved);
    expect(await listTvoedSueAllowanceConfirmations(f.db)).toEqual([saved]);
    expect((await loadRemunerationSnapshot(f.db)).tvoedSueAllowanceConfirmations).toEqual([saved]);
    expect(isCurrentTvoedSueAllowanceConfirmation(saved, profile, saved.ruleVersionId)).toBe(true);
    expect(isCurrentTvoedSueAllowanceConfirmation(saved, profile, "other-rule")).toBe(false);
    expect(Object.isFrozen(saved)).toBe(true);
  });
});
