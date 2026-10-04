import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { isCurrentDrkTrainingMonthConfirmation } from "@/domain/saved-drk-training-month-confirmation";
import type { TrainingProfileData } from "@/domain/training-data";
import { createProfilePorts } from "@/composition/create-profile-ports";
import { saveDatedRemunerationProfile } from "./remuneration-profile-repository";
import { saveTrainingProfile } from "./training-repository";
import {
  listDrkTrainingMonthConfirmations,
  loadDrkTrainingMonthConfirmation,
  requireDrkTrainingMonthConfirmationParents,
} from "./drk-training-month-confirmation-repository";
import { setupTvlShiftWork, type TvlShiftWorkFixture } from "./tvl-shift-work-test-fixtures";

describe("DRK training full port acceptance", () => {
  let f: TvlShiftWorkFixture;
  beforeEach(async () => {
    f = await setupTvlShiftWork();
  });
  afterEach(() => f.adapter.database.close());

  const trainingData: TrainingProfileData = {
    version: 1,
    effectiveFrom: "2026-09-01",
    birthDate: null,
    fullTimeCompulsorySchooling: null,
    status: "training",
    training: {
      profession: "Pflegefachperson",
      legalBasis: "PFLBG",
      startedOn: "2026-09-01",
      expectedEndOn: null,
      year: 1,
      yearConfirmedFrom: "2026-09-01",
      shorteningMonths: null,
    },
  };
  const remunerationData = {
    version: 1 as const,
    weeklyMinutes: 2340,
    selection: {
      kind: "tariff" as const,
      packageId: "drk-rtv-training",
      variant: "ANLAGE_3A_A",
      region: "BTG",
      group: "anlage-3a-a",
      level: "1",
      fullTimeWeeklyMinutes: 2340,
    },
  };
  const parents = async (fixture: TvlShiftWorkFixture) => {
    const remuneration = await saveDatedRemunerationProfile(fixture.db, {
      effectiveFrom: "2026-10-01",
      expectedRevision: 0,
      data: remunerationData,
    });
    const training = await saveTrainingProfile(fixture.db, {
      data: trainingData,
      expectedRevision: 0,
    });
    return { remuneration, training };
  };
  const answer = (expectedRevision = 0) => ({
    month: "2026-10",
    remunerationProfileEffectiveFrom: "2026-10-01",
    expectedRemunerationProfileRevision: 1,
    trainingProfileEffectiveFrom: "2026-09-01",
    expectedTrainingProfileRevision: 1,
    ruleVersionId: "2026-10-01-draft1",
    drkApplicabilityConfirmed: true as boolean | null,
    trainingCategoryConfirmed: true as boolean | null,
    trainingYearConfirmed: true as boolean | null,
    fullMonthBaseEntitlementConfirmed: true as boolean | null,
    fullTimeTrainingConfirmed: true as boolean | null,
    expectedRevision,
  });

  it("persists five tri-state answers bound to both profiles and a rule version", async () => {
    const { remuneration, training } = await parents(f);
    const port = createProfilePorts(f.db).remuneration;
    const saved = await port.saveDrkTrainingMonthConfirmation({
      ...answer(),
      trainingCategoryConfirmed: null,
    });
    expect(await loadDrkTrainingMonthConfirmation(f.db, "2026-10")).toEqual(saved);
    expect(await listDrkTrainingMonthConfirmations(f.db)).toEqual([saved]);
    expect((await port.loadSnapshot()).drkTrainingMonthConfirmations).toEqual([saved]);
    expect(
      isCurrentDrkTrainingMonthConfirmation(saved, remuneration, training, saved.ruleVersionId),
    ).toBe(true);
    expect(
      isCurrentDrkTrainingMonthConfirmation(saved, remuneration, training, "2027-10-01-draft1"),
    ).toBe(false);
    expect(Object.isFrozen(saved)).toBe(true);
    expect(() =>
      requireDrkTrainingMonthConfirmationParents(saved, [remuneration], [training]),
    ).not.toThrow();
  });
});
