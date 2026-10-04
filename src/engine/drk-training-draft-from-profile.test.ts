import { describe, expect, it } from "vitest";
import p2026 from "../../rules/packages/reviewed/drk-rtv-training/2026-10-01-draft1.json";
import type { DatedRemunerationProfile } from "@/domain/remuneration-profile";
import type { SavedTrainingProfile } from "@/domain/training-data";
import type { RuleTariffPackage } from "@/rules/contracts.generated";
import { createRuleResolver } from "@/rules/rule-resolver";
import {
  calculateDrkTrainingDraftFromProfile,
  type DrkTrainingDraftFromProfileInput,
} from "./drk-training-draft-from-profile";

const resolver = createRuleResolver(
  { tariff: [p2026 as RuleTariffPackage], legal: [], holiday: [] },
  { tariff: "drk-rtv-training", legal: "unused", holiday: "unused" },
);
const confirmations: DrkTrainingDraftFromProfileInput["confirmations"] = {
  drkApplicabilityConfirmed: true,
  trainingCategoryConfirmed: true,
  trainingYearConfirmed: true,
  fullMonthBaseEntitlementConfirmed: true,
  fullTimeTrainingConfirmed: true,
};

function remunerationProfile(
  variant: string,
  group: string,
  level: string,
): DatedRemunerationProfile {
  return {
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
        variant,
        region: "BTG",
        group,
        level,
        fullTimeWeeklyMinutes: 2340,
      },
    },
  };
}

function trainingProfile(
  year = 1,
  legalBasis: "PFLBG" | "BBIG" | "OTHER" | "UNKNOWN" = "PFLBG",
): SavedTrainingProfile {
  return {
    data: {
      version: 1,
      effectiveFrom: "2026-09-01",
      birthDate: null,
      fullTimeCompulsorySchooling: null,
      status: "training",
      training: {
        profession: "Pflegefachperson",
        legalBasis,
        startedOn: "2026-09-01",
        expectedEndOn: null,
        year,
        yearConfirmedFrom: "2026-09-01",
        shorteningMonths: null,
      },
    },
    revision: 1,
    updatedAt: "2026-09-22T00:00:00Z",
  };
}

function calculate(
  remunerationProfiles: readonly DatedRemunerationProfile[],
  trainingProfiles: readonly SavedTrainingProfile[] = [trainingProfile()],
  answers = confirmations,
) {
  return calculateDrkTrainingDraftFromProfile({
    month: "2026-10",
    remunerationProfiles,
    trainingProfiles,
    resolver,
    confirmations: answers,
  });
}

describe("dated DRK training profile to isolated catalog draft", () => {
  it.each([
    ["ANLAGE_3", "anlage-3-general", 141074],
    ["ANLAGE_3A_A", "anlage-3a-a", 154006],
    ["ANLAGE_3A_B", "anlage-3a-b", 146246],
  ] as const)(
    "uses the confirmed %s category, not the profession name",
    (variant, group, cents) => {
      expect(
        calculate(
          [remunerationProfile(variant, group, "1")],
          [trainingProfile(1, variant === "ANLAGE_3" ? "BBIG" : "PFLBG")],
        ),
      ).toMatchObject({
        kind: "draft-full-month-training-table-base",
        monthlyCents: cents,
        completeGross: false,
        versionId: "2026-10-01-draft1",
      });
    },
  );

  it("takes the explicitly confirmed training year and never advances it automatically", () => {
    expect(
      calculate(
        [remunerationProfile("ANLAGE_3", "anlage-3-general", "4")],
        [trainingProfile(4, "BBIG")],
      ),
    ).toMatchObject({
      kind: "draft-full-month-training-table-base",
      monthlyCents: 159108,
      trainingYear: 4,
    });
    expect(calculate([remunerationProfile("ANLAGE_3", "anlage-3-general", "2")])).toEqual({
      kind: "unavailable",
      reason: "TRAINING_YEAR_CONFLICT",
    });
  });

  it("rejects changes within the month, missing training status and part-time", () => {
    const pay = remunerationProfile("ANLAGE_3A_A", "anlage-3a-a", "1");
    expect(calculate([pay, { ...pay, effectiveFrom: "2026-10-15" }])).toEqual({
      kind: "unavailable",
      reason: "PROFILE_CHANGES_IN_MONTH",
    });
    const training = trainingProfile();
    expect(
      calculate(
        [pay],
        [training, { ...training, data: { ...training.data, effectiveFrom: "2026-10-15" } }],
      ),
    ).toEqual({ kind: "unavailable", reason: "TRAINING_PROFILE_CHANGES_IN_MONTH" });
    expect(
      calculate(
        [pay],
        [{ ...training, data: { ...training.data, status: "employment", training: null } }],
      ),
    ).toEqual({ kind: "unavailable", reason: "TRAINING_STATUS_MISSING" });
    expect(calculate([{ ...pay, data: { ...pay.data, weeklyMinutes: 1200 } }])).toEqual({
      kind: "unavailable",
      reason: "NON_FULL_TIME_SEPARATE_CALCULATION",
    });
    expect(calculate([pay], [])).toEqual({
      kind: "unavailable",
      reason: "TRAINING_PROFILE_MISSING",
    });
    expect(calculate([pay], [training, training])).toEqual({
      kind: "unavailable",
      reason: "TRAINING_PROFILE_INVALID",
    });
  });

  it("fails closed when the injected catalog changes inside the month", () => {
    const changed = {
      ...resolver,
      resolveTariff: (date: string) => ({
        ok: true as const,
        value: (date.endsWith("-01") ? p2026 : structuredClone(p2026)) as RuleTariffPackage,
      }),
    };
    expect(
      calculateDrkTrainingDraftFromProfile({
        month: "2026-10",
        remunerationProfiles: [remunerationProfile("ANLAGE_3A_A", "anlage-3a-a", "1")],
        trainingProfiles: [trainingProfile()],
        resolver: changed,
        confirmations,
      }),
    ).toEqual({ kind: "unavailable", reason: "RULE_VERSION_CHANGES_IN_MONTH" });
  });

  it("requires a full confirmed year, month, category and personal applicability", () => {
    const pay = remunerationProfile("ANLAGE_3A_A", "anlage-3a-a", "1");
    const training = trainingProfile();
    expect(
      calculate([pay], [training], { ...confirmations, drkApplicabilityConfirmed: false }),
    ).toEqual({ kind: "unavailable", reason: "DRK_APPLICABILITY_UNCONFIRMED" });
    expect(calculate([pay], [{ ...training, data: { ...training.data, training: null } }])).toEqual(
      {
        kind: "unavailable",
        reason: "TRAINING_PROFILE_INVALID",
      },
    );
    expect(
      calculate(
        [pay],
        [
          {
            ...training,
            data: {
              ...training.data,
              training: { ...training.data.training!, yearConfirmedFrom: "2026-10-15" },
            },
          },
        ],
      ),
    ).toEqual({ kind: "unavailable", reason: "TRAINING_YEAR_CONFLICT" });
    expect(calculate([remunerationProfile("ANLAGE_3", "anlage-3a-a", "1")])).toEqual({
      kind: "unavailable",
      reason: "TRAINING_CATEGORY_CONFLICT",
    });
    expect(calculate([remunerationProfile("ANLAGE_3", "anlage-3-general", "1")])).toEqual({
      kind: "unavailable",
      reason: "TRAINING_CATEGORY_CONFLICT",
    });
    expect(calculate([pay], [trainingProfile(1, "UNKNOWN")])).toEqual({
      kind: "unavailable",
      reason: "TRAINING_LEGAL_BASIS_UNKNOWN",
    });
    expect(
      calculate(
        [pay],
        [
          {
            ...training,
            data: {
              ...training.data,
              training: {
                ...training.data.training!,
                startedOn: "2026-10-10",
                yearConfirmedFrom: "2026-10-10",
              },
            },
          },
        ],
      ),
    ).toEqual({ kind: "unavailable", reason: "TRAINING_NOT_FULL_MONTH" });
  });
});
