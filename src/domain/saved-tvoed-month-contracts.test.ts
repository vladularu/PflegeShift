import { describe, expect, it } from "vitest";
import type { DatedRemunerationProfile } from "./remuneration-profile";
import {
  validateSavedTvoedAnnexAMonthConfirmation as annex,
  isCurrentTvoedAnnexAMonthConfirmation as currentAnnex,
} from "./saved-tvoed-annex-a-month-confirmation";
import {
  validateSavedTvoedSueMonthConfirmation as sue,
  isCurrentTvoedSueMonthConfirmation as currentSue,
} from "./saved-tvoed-sue-month-confirmation";
import {
  validateSavedTvoedSueAllowanceConfirmation as allowance,
  isCurrentTvoedSueAllowanceConfirmation as currentAllowance,
} from "./saved-tvoed-sue-allowance-confirmation";

const stamp = "2026-10-04T00:00:00Z";
const shared = {
  month: "2026-09",
  profileEffectiveFrom: "2026-09-01",
  profileRevision: 1,
  ruleVersionId: "2026-05-draft1",
  regionId: "VKA",
  stepId: "s2",
  contractedWeeklyMinutes: 1170,
  revision: 1,
  confirmedAt: stamp,
  updatedAt: stamp,
};
const cases = [
  {
    name: "Anlage A",
    validate: annex,
    current: (v: unknown, p: DatedRemunerationProfile, r: string) => currentAnnex(annex(v), p, r),
    factory: () => ({
      ...shared,
      packageId: "tvoed-vka-anlage-a",
      variantId: "BT_K",
      groupId: "eg7",
      comparableFullTimeWeeklyMinutes: 2340,
      applicabilityConfirmed: null,
      comparableFullTimeConfirmed: false,
      fullMonthBaseEntitlementConfirmed: null,
      fullMonthSameContractConfirmed: true,
    }),
  },
  {
    name: "SuE base",
    validate: sue,
    current: (v: unknown, p: DatedRemunerationProfile, r: string) => currentSue(sue(v), p, r),
    factory: () => ({
      ...shared,
      packageId: "tvoed-vka-sue-bt-b",
      variantId: "BT_B",
      groupId: "s8a",
      standardFullTimeWeeklyMinutes: 2340,
      tariffApplicabilityConfirmed: null,
      sueClassificationConfirmed: false,
      standardFullTimeConfirmed: true,
      fullMonthBaseEntitlementConfirmed: null,
      fullMonthSameContractConfirmed: true,
    }),
  },
  {
    name: "SuE allowance",
    validate: allowance,
    current: (v: unknown, p: DatedRemunerationProfile, r: string) =>
      currentAllowance(allowance(v), p, r),
    factory: () => ({
      ...shared,
      packageId: "tvoed-vka-sue-bt-b",
      variantId: "BT_B",
      groupId: "s15",
      standardFullTimeWeeklyMinutes: 2340,
      sectionXxivClassificationConfirmed: null,
      fullMonthAllowanceEntitlementConfirmed: false,
      caseGroup: null,
      conversionDays: null,
    }),
  },
];
const profile = (f: ReturnType<(typeof cases)[number]["factory"]>): DatedRemunerationProfile => ({
  effectiveFrom: f.profileEffectiveFrom,
  revision: f.profileRevision,
  createdAt: stamp,
  updatedAt: stamp,
  data: {
    version: 1,
    weeklyMinutes: f.contractedWeeklyMinutes,
    selection: {
      kind: "tariff",
      packageId: f.packageId,
      variant: f.variantId,
      region: f.regionId,
      group: f.groupId,
      level: f.stepId.slice(1),
      fullTimeWeeklyMinutes: 2340,
    },
  },
});
describe.each(cases)("$name explicit monthly evidence", (entry) => {
  it("retains unknown, false and true answers as distinct immutable data", () => {
    const input = entry.factory();
    const saved = entry.validate(input);
    expect(saved).toEqual(input);
    expect(Object.isFrozen(saved)).toBe(true);
    expect(entry.current(saved, profile(input), input.ruleVersionId)).toBe(true);
  });
  it.each([
    { month: "2026-13" },
    { profileEffectiveFrom: "2026-02-30" },
    { profileRevision: 0 },
    { revision: 0 },
    { packageId: "avr-caritas-p-bw" },
    { regionId: "OTHER" },
    { stepId: "s7" },
    { contractedWeeklyMinutes: 2341 },
    { ruleVersionId: "invalid version" },
    { updatedAt: "2026-10-03T00:00:00Z" },
    { extra: true },
  ])("rejects malformed or inconsistent evidence %j", (change) => {
    expect(() => entry.validate({ ...entry.factory(), ...change })).toThrow();
  });
  it("invalidates every changed profile identity or catalog version", () => {
    const input = entry.factory(),
      p = profile(input);
    if (p.data.selection.kind !== "tariff") throw Error("Fixture");
    const selection = p.data.selection;
    const changedProfiles: DatedRemunerationProfile[] = [
      { ...p, revision: 2 },
      { ...p, effectiveFrom: "2026-09-02" },
      { ...p, data: { ...p.data, weeklyMinutes: 1169 } },
      ...[
        { packageId: "other" },
        { variant: "OTHER" },
        { region: "OTHER" },
        { group: "other" },
        { level: "3" },
        { fullTimeWeeklyMinutes: 2310 },
      ].map((change) => ({ ...p, data: { ...p.data, selection: { ...selection, ...change } } })),
    ];
    for (const changed of changedProfiles)
      expect(entry.current(input, changed, input.ruleVersionId)).toBe(false);
    expect(entry.current(input, p, "2027-01-draft1")).toBe(false);
  });
});
it("keeps the SuE fall group exclusive to S15 and preserves conversion choices", () => {
  const input = cases[2].factory();
  expect(allowance({ ...input, caseGroup: "6", conversionDays: "TAKEN" })).toMatchObject({
    caseGroup: "6",
    conversionDays: "TAKEN",
  });
  expect(
    allowance({ ...input, caseGroup: "OTHER", conversionDays: "NONE_CONFIRMED" }),
  ).toMatchObject({ caseGroup: "OTHER", conversionDays: "NONE_CONFIRMED" });
  expect(() => allowance({ ...input, groupId: "s8a", caseGroup: "6" })).toThrow("Fallgruppen");
  expect(() => allowance({ ...input, conversionDays: false })).toThrow("Umwandlung");
});
