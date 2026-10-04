import { describe, expect, it } from "vitest";
import draft from "../../rules/packages/reviewed/drk-rtv-training/2026-10-01-draft1.json";
import { validateSavedDrkTrainingMonthConfirmation } from "@/domain/saved-drk-training-month-confirmation";
import type { DatedRemunerationProfile } from "@/domain/remuneration-profile";
import type { SavedTrainingProfile } from "@/domain/training-data";
import type { RuleTariffPackage } from "@/rules/contracts.generated";
import { createRuleResolver } from "@/rules/rule-resolver";
import { calculateDrkTrainingDraftFromSaved } from "./drk-training-draft-from-saved";

const resolver = createRuleResolver(
  { tariff: [draft as RuleTariffPackage], legal: [], holiday: [] },
  { tariff: "drk-rtv-training", legal: "unused", holiday: "unused" },
);

const remuneration: DatedRemunerationProfile = {
  effectiveFrom: "2026-10-01",
  revision: 1,
  createdAt: "2026-09-22T00:00:00Z",
  updatedAt: "2026-09-22T00:00:00Z",
  data: {
    version: 1,
    weeklyMinutes: 2340,
    selection: {
      kind: "tariff",
      packageId: "drk-rtv-training",
      variant: "ANLAGE_3A_A",
      region: "BTG",
      group: "anlage-3a-a",
      level: "1",
      fullTimeWeeklyMinutes: 2340,
    },
  },
};
const training: SavedTrainingProfile = {
  data: {
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
  },
  revision: 1,
  updatedAt: "2026-09-22T00:00:00Z",
};
const saved = validateSavedDrkTrainingMonthConfirmation({
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
  confirmedAt: "2026-09-22T00:00:00Z",
  updatedAt: "2026-09-22T00:00:00Z",
});

function calculate(
  overrides: Partial<Parameters<typeof calculateDrkTrainingDraftFromSaved>[0]> = {},
) {
  return calculateDrkTrainingDraftFromSaved({
    month: "2026-10",
    remunerationProfiles: [remuneration],
    trainingProfiles: [training],
    resolver,
    confirmations: [saved],
    ...overrides,
  });
}

describe("saved DRK training answers to isolated catalog draft", () => {
  it("uses the two dated profiles and saved answers for the draft table base only", () => {
    expect(calculate()).toMatchObject({
      kind: "draft-full-month-training-table-base",
      monthlyCents: 154006,
      completeGross: false,
      versionId: "2026-10-01-draft1",
    });
  });

  it("requires one current confirmation for the requested month", () => {
    expect(calculate({ confirmations: [] })).toEqual({
      kind: "unavailable",
      reason: "CONFIRMATION_MISSING",
    });
    expect(calculate({ confirmations: [saved, saved] })).toEqual({
      kind: "unavailable",
      reason: "CONFIRMATION_AMBIGUOUS",
    });
    expect(calculate({ month: "2026-11" })).toEqual({
      kind: "unavailable",
      reason: "CONFIRMATION_MISSING",
    });
    expect(calculate({ confirmations: [{ ...saved, ruleVersionId: "other-version" }] })).toEqual({
      kind: "unavailable",
      reason: "CONFIRMATION_STALE",
    });
  });

  it("invalidates answers when either profile changes", () => {
    expect(calculate({ remunerationProfiles: [{ ...remuneration, revision: 2 }] })).toEqual({
      kind: "unavailable",
      reason: "CONFIRMATION_STALE",
    });
    expect(calculate({ trainingProfiles: [{ ...training, revision: 2 }] })).toEqual({
      kind: "unavailable",
      reason: "CONFIRMATION_STALE",
    });
    expect(
      calculate({
        trainingProfiles: [
          training,
          { ...training, data: { ...training.data, effectiveFrom: "2026-10-15" } },
        ],
      }),
    ).toEqual({ kind: "unavailable", reason: "TRAINING_PROFILE_CHANGES_IN_MONTH" });
  });

  it("does not turn unknown or negative answers into consent", () => {
    expect(calculate({ confirmations: [{ ...saved, trainingYearConfirmed: null }] })).toEqual({
      kind: "unavailable",
      reason: "TRAINING_YEAR_UNCONFIRMED",
    });
    expect(calculate({ confirmations: [{ ...saved, trainingCategoryConfirmed: false }] })).toEqual({
      kind: "unavailable",
      reason: "TRAINING_CATEGORY_UNCONFIRMED",
    });
  });

  it("fails closed when the catalog generation changes within the month", () => {
    const changed = {
      ...resolver,
      resolveTariff: (date: string) => ({
        ok: true as const,
        value: (date.endsWith("-01") ? draft : structuredClone(draft)) as RuleTariffPackage,
      }),
    };
    expect(calculate({ resolver: changed })).toEqual({
      kind: "unavailable",
      reason: "RULE_VERSION_CHANGES_IN_MONTH",
    });
  });
});
