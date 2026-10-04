import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createProfilePorts } from "@/composition/create-profile-ports";
import { saveDatedRemunerationProfile } from "./remuneration-profile-repository";
import { setupTvlShiftWork, type TvlShiftWorkFixture } from "./tvl-shift-work-test-fixtures";

describe("TVöD SuE shared storage port", () => {
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

  it("exposes committed answers through the shared remuneration snapshot port", async () => {
    const profile = await sueProfile(f);
    const port = createProfilePorts(f.db).remuneration;
    const saved = await port.saveTvoedSueMonthConfirmation(answer(profile.revision));
    expect((await port.loadSnapshot()).tvoedSueMonthConfirmations).toEqual([saved]);
  });
});
