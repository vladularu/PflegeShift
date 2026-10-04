import { describe, expect, it } from "vitest";
import type { DatedRemunerationProfile } from "./remuneration-profile";
import type { SavedTrainingProfile } from "./training-data";
import {
  validateSavedDrkEmployeeMonthConfirmation as employee,
  isCurrentDrkEmployeeMonthConfirmation as currentEmployee,
} from "./saved-drk-employee-month-confirmation";
import {
  validateSavedDrkTrainingMonthConfirmation as training,
  isCurrentDrkTrainingMonthConfirmation as currentTraining,
} from "./saved-drk-training-month-confirmation";

const stamp = "2026-09-22T00:00:00Z";
const employeeRecord = {
  month: "2026-10",
  profileEffectiveFrom: "2026-10-01",
  profileRevision: 1,
  packageId: "drk-rtv-p",
  ruleVersionId: "2026-10-01-draft1",
  variantId: "ANLAGE_A2",
  regionId: "BTG",
  groupId: "p6",
  stepId: "s1",
  contractedWeeklyMinutes: 1920,
  fullTimeWeeklyMinutes: 2340,
  drkApplicabilityConfirmed: true,
  annexAssignmentConfirmed: true,
  payGroupAndStepConfirmed: true,
  weeklyTimeBasisConfirmed: true,
  fullMonthBaseEntitlementConfirmed: true,
  revision: 1,
  confirmedAt: stamp,
  updatedAt: stamp,
} as const;
const trainingRecord = {
  month: "2026-10",
  remunerationProfileEffectiveFrom: "2026-10-01",
  remunerationProfileRevision: 1,
  trainingProfileEffectiveFrom: "2026-09-01",
  trainingProfileRevision: 1,
  packageId: "drk-rtv-training",
  ruleVersionId: "2026-10-01-draft1",
  variantId: "ANLAGE_3A_A",
  regionId: "BTG",
  groupId: "anlage-3a-a",
  trainingYear: 1,
  weeklyMinutes: 2340,
  fullTimeWeeklyMinutes: 2340,
  trainingProfession: "Pflegefachperson",
  trainingLegalBasis: "PFLBG",
  trainingStartedOn: "2026-09-01",
  trainingExpectedEndOn: null,
  trainingYearConfirmedFrom: "2026-09-01",
  drkApplicabilityConfirmed: true,
  trainingCategoryConfirmed: true,
  trainingYearConfirmed: true,
  fullMonthBaseEntitlementConfirmed: true,
  fullTimeTrainingConfirmed: true,
  revision: 1,
  confirmedAt: stamp,
  updatedAt: stamp,
} as const;

describe("DRK employee confirmation contract", () => {
  it.each([
    ["drk-rtv-e", "ANLAGE_A1", "eg6"],
    ["drk-rtv-p", "ANLAGE_A2", "p6"],
    ["drk-rtv-s", "ANLAGE_A3", "s8a"],
  ])("keeps the exact %s assignment", (packageId, variantId, groupId) => {
    const saved = employee({ ...employeeRecord, packageId, variantId, groupId });
    expect(saved).toMatchObject({ packageId, variantId, groupId });
    expect(Object.isFrozen(saved)).toBe(true);
  });
  it.each([true, false, null])("does not infer any employee answer from %s", (answer) => {
    const saved = employee({
      ...employeeRecord,
      drkApplicabilityConfirmed: answer,
      annexAssignmentConfirmed: answer,
      payGroupAndStepConfirmed: answer,
      weeklyTimeBasisConfirmed: answer,
      fullMonthBaseEntitlementConfirmed: answer,
    });
    expect([
      saved.drkApplicabilityConfirmed,
      saved.annexAssignmentConfirmed,
      saved.payGroupAndStepConfirmed,
      saved.weeklyTimeBasisConfirmed,
      saved.fullMonthBaseEntitlementConfirmed,
    ]).toEqual(Array(5).fill(answer));
  });
  it.each([
    { variantId: "ANLAGE_A1" },
    { packageId: "tvoed-p-vka" },
    { regionId: "VKA" },
    { stepId: "s7" },
    { profileRevision: 0 },
    { revision: 1.5 },
    { contractedWeeklyMinutes: 2341 },
    { drkApplicabilityConfirmed: "yes" },
    { month: "2026-13" },
    { confirmedAt: "2026-09-23T00:00:00Z" },
    { extra: true },
  ])("rejects the imported employee contradiction %j", (change) => {
    expect(() => employee({ ...employeeRecord, ...change })).toThrow();
  });
  it("binds every profile selection field and rule version", () => {
    const saved = employee(employeeRecord);
    const profile: DatedRemunerationProfile = {
      effectiveFrom: saved.profileEffectiveFrom,
      revision: 1,
      createdAt: stamp,
      updatedAt: stamp,
      data: {
        version: 1,
        weeklyMinutes: 1920,
        selection: {
          kind: "tariff",
          packageId: saved.packageId,
          variant: saved.variantId,
          region: "BTG",
          group: "P6",
          level: "1",
          fullTimeWeeklyMinutes: 2340,
        },
      },
    };
    expect(currentEmployee(saved, profile, saved.ruleVersionId)).toBe(true);
    for (const change of [
      { profileEffectiveFrom: "2026-09-01" },
      { profileRevision: 2 },
      { packageId: "drk-rtv-e" as const },
      { variantId: "ANLAGE_A1" as const },
      { groupId: "p7" },
      { stepId: "s2" },
      { contractedWeeklyMinutes: 1800 },
      { fullTimeWeeklyMinutes: 2400 },
    ])
      expect(currentEmployee({ ...saved, ...change }, profile, saved.ruleVersionId)).toBe(false);
    expect(currentEmployee(saved, profile, "new-rule")).toBe(false);
  });
});

describe("DRK training confirmation contract", () => {
  it.each([
    ["ANLAGE_3", "anlage-3-general", "BBIG"],
    ["ANLAGE_3A_A", "anlage-3a-a", "PFLBG"],
    ["ANLAGE_3A_B", "anlage-3a-b", "PFLBG"],
  ])("keeps the explicit %s category", (variantId, groupId, trainingLegalBasis) => {
    const saved = training({ ...trainingRecord, variantId, groupId, trainingLegalBasis });
    expect(saved).toMatchObject({ variantId, groupId, trainingLegalBasis });
    expect(Object.isFrozen(saved)).toBe(true);
  });
  it.each([true, false, null])("does not infer any training answer from %s", (answer) => {
    const saved = training({
      ...trainingRecord,
      drkApplicabilityConfirmed: answer,
      trainingCategoryConfirmed: answer,
      trainingYearConfirmed: answer,
      fullMonthBaseEntitlementConfirmed: answer,
      fullTimeTrainingConfirmed: answer,
    });
    expect([
      saved.drkApplicabilityConfirmed,
      saved.trainingCategoryConfirmed,
      saved.trainingYearConfirmed,
      saved.fullMonthBaseEntitlementConfirmed,
      saved.fullTimeTrainingConfirmed,
    ]).toEqual(Array(5).fill(answer));
  });
  it.each([
    { variantId: "ANLAGE_3" },
    { groupId: "anlage-3a-b" },
    { weeklyMinutes: 1920 },
    { trainingYear: 7 },
    { remunerationProfileRevision: 0 },
    { trainingProfileRevision: 0 },
    { remunerationProfileEffectiveFrom: "2026-10-02" },
    { trainingProfileEffectiveFrom: "2026-10-02" },
    { trainingStartedOn: "2026-10-02" },
    { trainingExpectedEndOn: "2026-10-30" },
    { trainingYearConfirmedFrom: "2026-08-31" },
    { trainingYearConfirmedFrom: "2026-10-02" },
    { trainingCategoryConfirmed: "yes" },
    { extra: true },
  ])("rejects the imported training contradiction %j", (change) => {
    expect(() => training({ ...trainingRecord, ...change })).toThrow();
  });
  it("invalidates both profile revisions and the actual training facts", () => {
    const saved = training(trainingRecord);
    const remuneration: DatedRemunerationProfile = {
      effectiveFrom: saved.remunerationProfileEffectiveFrom,
      revision: 1,
      createdAt: stamp,
      updatedAt: stamp,
      data: {
        version: 1,
        weeklyMinutes: 2340,
        selection: {
          kind: "tariff",
          packageId: saved.packageId,
          variant: saved.variantId,
          region: "BTG",
          group: saved.groupId,
          level: "1",
          fullTimeWeeklyMinutes: 2340,
        },
      },
    };
    const profile: SavedTrainingProfile = {
      revision: 1,
      updatedAt: stamp,
      data: {
        version: 1,
        effectiveFrom: saved.trainingProfileEffectiveFrom,
        birthDate: null,
        fullTimeCompulsorySchooling: null,
        status: "training",
        training: {
          profession: saved.trainingProfession,
          legalBasis: saved.trainingLegalBasis,
          startedOn: saved.trainingStartedOn,
          expectedEndOn: null,
          year: 1,
          yearConfirmedFrom: saved.trainingYearConfirmedFrom,
          shorteningMonths: null,
        },
      },
    };
    expect(currentTraining(saved, remuneration, profile, saved.ruleVersionId)).toBe(true);
    for (const change of [
      { remunerationProfileRevision: 2 },
      { trainingProfileRevision: 2 },
      { trainingProfession: "Other" },
      { trainingStartedOn: "2026-08-01" },
      { trainingExpectedEndOn: "2029-08-31" },
      { trainingYearConfirmedFrom: "2026-08-01" },
      { trainingYear: 2 },
      { weeklyMinutes: 1920 },
    ])
      expect(
        currentTraining({ ...saved, ...change }, remuneration, profile, saved.ruleVersionId),
      ).toBe(false);
    expect(currentTraining(saved, remuneration, profile, "new-rule")).toBe(false);
  });
});
