import { describe, expect, it } from "vitest";
import {
  emptyTrainingProfile,
  trainingProfileDraft,
  trainingProfileFromDraft,
} from "./training-profile-model";
import type { TrainingProfileData } from "@/domain/training-data";
import { UNKNOWN_YOUTH_CONTEXT } from "@/domain/youth-context";
import { youthContextDraft } from "./youth-context-model";
const profile: TrainingProfileData = {
  version: 1,
  effectiveFrom: "2026-09-01",
  birthDate: "2009-01-02",
  status: "training",
  fullTimeCompulsorySchooling: false,
  training: {
    profession: "Pflegefachperson",
    legalBasis: "PFLBG",
    startedOn: "2026-09-01",
    expectedEndOn: "2029-08-31",
    year: 1,
    yearConfirmedFrom: "2026-09-01",
    shorteningMonths: 0,
  },
};
describe("training profile input", () => {
  it("roundtrips youth confirmations without changing advanced day assignments", () => {
    const data: TrainingProfileData = {
      ...profile,
      version: 2,
      youth: {
        ...UNKNOWN_YOUTH_CONTEXT,
        careInstitution: true,
        averageDailyTrainingMinutes: 462,
        shortenedWorkingDays: ["2026-09-15"],
        holidayLostMinutes: { "2026-10-03": 0 },
        blockTrainingShiftIds: ["confirmed-training"],
      },
    };
    expect(trainingProfileFromDraft(trainingProfileDraft(data))).toEqual(data);
    expect(trainingProfileFromDraft({ ...trainingProfileDraft(data), youth: null })).toMatchObject({
      version: 2,
      youth: null,
    });
  });
  it("rejects day facts if the profile start is subsequently moved past them", () => {
    const draft = trainingProfileDraft(profile);
    expect(() =>
      trainingProfileFromDraft({
        ...draft,
        effectiveFrom: "15.09.2026",
        youth: youthContextDraft({
          ...UNKNOWN_YOUTH_CONTEXT,
          shortenedWorkingDays: ["2026-09-14"],
        }),
      }),
    ).toThrow("vor dem Gültigkeitsbeginn");
  });
  it("rejects malformed school credit input instead of partially parsing it", () => {
    expect(() =>
      trainingProfileFromDraft({
        ...trainingProfileDraft(profile),
        youth: {
          ...youthContextDraft(),
          dailyMinutes: "480x",
        },
      }),
    ).toThrow("ganze Minuten");
  });
  it("starts with unknown rather than inferred personal evidence", () => {
    expect(
      trainingProfileFromDraft(trainingProfileDraft(emptyTrainingProfile("2026-09-01"))),
    ).toEqual(emptyTrainingProfile("2026-09-01"));
  });
  it("roundtrips confirmed training without interpreting legal basis as a tariff", () => {
    const draft = trainingProfileDraft(profile);
    expect(draft.birthDate).toBe("02.01.2009");
    expect(draft.shorteningMonths).toBe("0");
    expect(trainingProfileFromDraft(draft)).toEqual(profile);
  });
  it("keeps employment and age separate and clears only the new profile's training", () => {
    const result = trainingProfileFromDraft({
      ...trainingProfileDraft(profile),
      status: "employment",
    });
    expect(result.training).toBeNull();
    expect(result.birthDate).toBe(profile.birthDate);
    expect(profile.training?.year).toBe(1);
  });
  it("does not turn empty optional amounts into zero or advance years automatically", () => {
    const result = trainingProfileFromDraft({
      ...trainingProfileDraft(profile),
      year: "",
      yearConfirmedFrom: "",
      shorteningMonths: "",
      expectedEndOn: "",
    });
    expect(result.training).toMatchObject({
      year: null,
      yearConfirmedFrom: null,
      shorteningMonths: null,
      expectedEndOn: null,
    });
  });
  it.each(["1.5", "1,5", "1e0", "1x", "-1", "7"])("rejects an invalid year %s", (year) =>
    expect(() => trainingProfileFromDraft({ ...trainingProfileDraft(profile), year })).toThrow(),
  );
  it.each(["31.02.2026", "1.9.26", "2026-13-01", ""])(
    "rejects a bad effective date %s",
    (effectiveFrom) =>
      expect(() =>
        trainingProfileFromDraft({ ...trainingProfileDraft(profile), effectiveFrom }),
      ).toThrow("Gültig ab"),
  );
  it("requires a validity date only when an explicit year is provided", () => {
    expect(() =>
      trainingProfileFromDraft({ ...trainingProfileDraft(profile), yearConfirmedFrom: "" }),
    ).toThrow("Bestätigungsbeginn");
    expect(() => trainingProfileFromDraft({ ...trainingProfileDraft(profile), year: "" })).toThrow(
      "Bestätigungsbeginn",
    );
  });
  it("preserves unknown legal basis and school duty", () => {
    const result = trainingProfileFromDraft({
      ...trainingProfileDraft(profile),
      schooling: "unknown",
      legalBasis: "UNKNOWN",
    });
    expect(result.fullTimeCompulsorySchooling).toBeNull();
    expect(result.training?.legalBasis).toBe("UNKNOWN");
  });
});
