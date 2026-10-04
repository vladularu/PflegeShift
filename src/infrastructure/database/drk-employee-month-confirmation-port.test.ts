import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createProfilePorts } from "@/composition/create-profile-ports";
import { saveDatedRemunerationProfile } from "./remuneration-profile-repository";
import { setupTvlShiftWork, type TvlShiftWorkFixture } from "./tvl-shift-work-test-fixtures";

describe("DRK employee full port acceptance", () => {
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

  it("exposes a committed answer through the shared remuneration snapshot", async () => {
    const profile = await drkProfile(f);
    const port = createProfilePorts(f.db).remuneration;
    const saved = await port.saveDrkEmployeeMonthConfirmation(answer(profile.revision));
    expect((await port.loadSnapshot()).drkEmployeeMonthConfirmations).toEqual([saved]);
  });
});
