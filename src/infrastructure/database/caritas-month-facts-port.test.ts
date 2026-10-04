import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createProfilePorts } from "@/composition/create-profile-ports";
import { saveDatedRemunerationProfile } from "./remuneration-profile-repository";
import { setupTvlShiftWork, type TvlShiftWorkFixture } from "./tvl-shift-work-test-fixtures";
describe("Caritas month confirmation provider port", () => {
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

  it("exposes the same committed facts through the shared remuneration port", async () => {
    const profile = await caritasProfile(f);
    const port = createProfilePorts(f.db).remuneration;
    const saved = await port.saveCaritasMonthFacts(input(profile.revision));
    expect((await port.loadSnapshot()).caritasMonthFacts).toEqual([saved]);
  });
});
