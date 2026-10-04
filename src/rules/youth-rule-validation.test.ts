import { describe, expect, it } from "vitest";
import candidate from "../../rules/packages/reviewed/de-arbzg-care/2026-01-youth-r1.json";
import examCandidate from "../../rules/packages/reviewed/de-arbzg-care/2026-01-youth-r2.json";
import existing from "../../rules/packages/reviewed/de-arbzg-care/2026-01.json";
import { validateRulePackage } from "./validation";
import { RULE_CATALOG_SUPPORTED_ENGINE_CONTRACT_VERSIONS } from "./rule-catalog-engine-support";
describe("versioned youth rule contract", () => {
  it("accepts a source-bound v10 exam draft without changing the v9 candidate", () => {
    expect(validateRulePackage(candidate).ok).toBe(true);
    expect(validateRulePackage(examCandidate).ok).toBe(true);
    expect(examCandidate.engineContractVersion).toBe(10);
    expect(examCandidate.status).toBe("DRAFT");
    expect(examCandidate.rules.youthProtection.exam.sourceIds).toEqual(["jarbschg-2024"]);
    expect(examCandidate.rules.adultTraining.bbig.exam.sourceIds).toEqual(["bbig-2025"]);
    expect(examCandidate.rules.adultTraining.pflbg.examRelease).toBe(true);
    expect(examCandidate.rules.youthProtection.exam).toEqual({
      releaseRequiredOutsideParticipation: true,
      releasePrecedingWrittenFinalWorkday: true,
      creditParticipationBreaksNecessaryTravel: true,
      creditPrecedingAverageDay: true,
      sourceIds: ["jarbschg-2024"],
    });
  });
  it("rejects missing, unsupported, incomplete or unreferenced exam rules", () => {
    const missing = structuredClone(examCandidate) as unknown as Record<string, unknown>;
    const missingRules = missing.rules as Record<string, Record<string, unknown>>;
    delete missingRules.youthProtection.exam;
    expect(validateRulePackage(missing).ok).toBe(false);
    expect(validateRulePackage({ ...examCandidate, engineContractVersion: 9 }).ok).toBe(false);
    for (const property of [
      "releaseRequiredOutsideParticipation",
      "releasePrecedingWrittenFinalWorkday",
      "creditParticipationBreaksNecessaryTravel",
      "creditPrecedingAverageDay",
    ] as const) {
      const invalid = structuredClone(examCandidate);
      invalid.rules.youthProtection.exam[property] = false;
      expect(validateRulePackage(invalid).ok).toBe(false);
    }
    const unreferenced = structuredClone(examCandidate);
    unreferenced.rules.youthProtection.exam.sourceIds = ["missing"];
    expect(validateRulePackage(unreferenced).ok).toBe(false);
    const missingBbig = structuredClone(examCandidate) as unknown as Record<string, unknown>;
    const adultRules = (missingBbig.rules as Record<string, unknown>).adultTraining as Record<
      string,
      Record<string, unknown>
    >;
    delete adultRules.bbig.exam;
    expect(validateRulePackage(missingBbig).ok).toBe(false);
    const incompleteBbig = structuredClone(examCandidate);
    incompleteBbig.rules.adultTraining.bbig.exam.creditPrecedingAverageDay = false;
    expect(validateRulePackage(incompleteBbig).ok).toBe(false);
    const unreferencedBbig = structuredClone(examCandidate);
    unreferencedBbig.rules.adultTraining.bbig.exam.sourceIds = ["missing"];
    expect(validateRulePackage(unreferencedBbig).ok).toBe(false);
    const missingPflbg = structuredClone(examCandidate) as unknown as Record<string, unknown>;
    const pflbg = (
      (missingPflbg.rules as Record<string, unknown>).adultTraining as Record<
        string,
        Record<string, unknown>
      >
    ).pflbg;
    delete pflbg.examRelease;
    expect(validateRulePackage(missingPflbg).ok).toBe(false);
    const disabledPflbg = structuredClone(examCandidate);
    disabledPflbg.rules.adultTraining.pflbg.examRelease = false;
    expect(validateRulePackage(disabledPflbg).ok).toBe(false);
  });
  it("validates the new draft while retaining every existing adult rule", () => {
    expect(validateRulePackage(candidate).ok).toBe(true);
    const { youthProtection, adultTraining, ...adult } = candidate.rules;
    expect(adult).toEqual(existing.rules);
    expect(adultTraining.minimumAge).toBe(youthProtection.adultAge);
    expect(adultTraining.bbig.sourceIds).toEqual(["bbig-2025"]);
    expect(adultTraining.pflbg.sourceIds).toEqual(["pflbg-2025"]);
    expect(candidate.status).toBe("DRAFT");
    expect(candidate.review.reviewedBy).toBeNull();
    expect(youthProtection.workingTime.dailyMinutes).toBe(8 * 60);
    expect(youthProtection.workingTime.weeklyMinutes).toBe(40 * 60);
    expect(youthProtection.breaks.tiers).toEqual([
      { overMinutes: 270, requiredMinutes: 30 },
      { overMinutes: 360, requiredMinutes: 60 },
    ]);
    expect(candidate.sources.at(-1)?.sha256).toBe(
      "f3bc2712f40f764f1860486a1dd759b1fd804eb8e205c02f0023d3f36161d0b1",
    );
    expect(RULE_CATALOG_SUPPORTED_ENGINE_CONTRACT_VERSIONS).not.toContain(9);
  });
  it("still accepts the unchanged v6 package without youth support", () =>
    expect(validateRulePackage(existing).ok).toBe(true));
  it("does not allow old contracts to claim youth support or v9 to omit it", () => {
    expect(validateRulePackage({ ...candidate, engineContractVersion: 6 }).ok).toBe(false);
    expect(validateRulePackage({ ...existing, engineContractVersion: 9 }).ok).toBe(false);
  });
  it.each([
    (p: typeof candidate) => {
      p.rules.adultTraining.minimumAge = 17;
    },
    (p: typeof candidate) => {
      p.rules.adultTraining.bbig.sourceIds = ["missing"];
    },
    (p: typeof candidate) => {
      p.rules.youthProtection.minimumAge = 19;
    },
    (p: typeof candidate) => {
      p.rules.youthProtection.workingTime.reducedWeekDailyMinutes = 400;
    },
    (p: typeof candidate) => {
      p.rules.youthProtection.breaks.tiers.reverse();
    },
    (p: typeof candidate) => {
      p.rules.youthProtection.daysOff.absoluteFixedHolidays = ["02-30"];
    },
    (p: typeof candidate) => {
      p.rules.youthProtection.sourceIds = ["missing"];
    },
    (p: typeof candidate) => {
      p.rules.youthProtection.employmentWindow.multiShiftMinimumAge = 18;
    },
  ])("rejects structurally or semantically inconsistent rules", (change) => {
    const value = structuredClone(candidate);
    change(value);
    expect(validateRulePackage(value).ok).toBe(false);
  });
});
