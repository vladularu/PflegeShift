import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  isCurrentDrkTrainingMonthConfirmation,
  validateSavedDrkTrainingMonthConfirmation,
} from "@/domain/saved-drk-training-month-confirmation";
import type { TrainingProfileData } from "@/domain/training-data";
import { migrateDatabase } from "./migrations";
import { saveDatedRemunerationProfile } from "./remuneration-profile-repository";
import { saveTrainingProfile } from "./training-repository";
import {
  listDrkTrainingMonthConfirmations,
  mapDrkTrainingMonthConfirmationRow,
  requireDrkTrainingMonthConfirmationParents,
  saveDrkTrainingMonthConfirmation,
} from "./drk-training-month-confirmation-repository";
import { setupTvlShiftWork, type TvlShiftWorkFixture } from "./tvl-shift-work-test-fixtures";

describe("DRK training month confirmations", () => {
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

  it("rejects stale answers and either profile changing inside the month", async () => {
    const { remuneration, training } = await parents(f);
    const saved = await saveDrkTrainingMonthConfirmation(f.db, answer());
    await expect(saveDrkTrainingMonthConfirmation(f.db, answer())).rejects.toThrow("geändert");
    const revised = await saveTrainingProfile(f.db, {
      data: {
        ...trainingData,
        training: { ...trainingData.training!, profession: "Andere Ausbildung" },
      },
      expectedRevision: training.revision,
    });
    expect(
      isCurrentDrkTrainingMonthConfirmation(saved, remuneration, revised, saved.ruleVersionId),
    ).toBe(false);
    await expect(saveDrkTrainingMonthConfirmation(f.db, { ...answer(1) })).rejects.toThrow(
      "Profilstand",
    );
    await saveTrainingProfile(f.db, {
      data: { ...trainingData, effectiveFrom: "2026-10-15" },
      expectedRevision: 0,
    });
    await expect(
      saveDrkTrainingMonthConfirmation(f.db, { ...answer(1), expectedTrainingProfileRevision: 2 }),
    ).rejects.toThrow("Profilstand");
  });

  it("does not infer a DRK category, year, or entitlement from an incomplete profile", async () => {
    await expect(saveDrkTrainingMonthConfirmation(f.db, answer())).rejects.toThrow("Profilstand");
    await parents(f);
    for (const change of [
      { training: { ...trainingData.training!, legalBasis: "UNKNOWN" as const } },
      { training: { ...trainingData.training!, year: null, yearConfirmedFrom: null } },
    ]) {
      const original = await saveTrainingProfile(f.db, {
        data: { ...trainingData, ...change },
        expectedRevision: change.training.legalBasis === "UNKNOWN" ? 1 : 2,
      });
      await expect(
        saveDrkTrainingMonthConfirmation(f.db, {
          ...answer(),
          expectedTrainingProfileRevision: original.revision,
        }),
      ).rejects.toThrow("vollständiges");
    }
  });

  it("rejects malformed imported rows and missing parent references", async () => {
    const { remuneration, training } = await parents(f);
    const saved = await saveDrkTrainingMonthConfirmation(f.db, answer());
    expect(() => requireDrkTrainingMonthConfirmationParents(saved, [], [training])).toThrow(
      "Profilreferenz",
    );
    expect(() => requireDrkTrainingMonthConfirmationParents(saved, [remuneration], [])).toThrow(
      "Profilreferenz",
    );
    for (const change of [
      { month: "2026-13" },
      { variantId: "ANLAGE_3" },
      { groupId: "anlage-3-general" },
      { trainingYear: 0 },
      { trainingLegalBasis: "UNKNOWN" },
      { trainingCategoryConfirmed: "yes" },
      { trainingProfileRevision: 0 },
      { ruleVersionId: "" },
      { extra: true },
    ])
      expect(() => validateSavedDrkTrainingMonthConfirmation({ ...saved, ...change })).toThrow();
    expect(() =>
      mapDrkTrainingMonthConfirmationRow({
        month: "2026-11",
        confirmation_json: JSON.stringify(saved),
      }),
    ).toThrow();
  });

  it("applies migration 31 once and rolls failed registration back", async () => {
    f.adapter.database.exec(
      "DROP TABLE drk_training_month_confirmations; DELETE FROM schema_migrations WHERE version=31",
    );
    f.adapter.fail = "VALUES(31,?)";
    await expect(migrateDatabase(f.db)).rejects.toThrow("injected");
    expect(
      f.adapter.database
        .prepare("SELECT name FROM sqlite_master WHERE name='drk_training_month_confirmations'")
        .get(),
    ).toBeUndefined();
    f.adapter.fail = null;
    await migrateDatabase(f.db);
    await migrateDatabase(f.db);
    expect(await listDrkTrainingMonthConfirmations(f.db)).toEqual([]);
    expect(
      f.adapter.database.prepare("SELECT COUNT(*) n FROM schema_migrations WHERE version=31").get(),
    ).toEqual({ n: 1 });
  });
});
