import { describe, expect, it } from "vitest";
import { validateRemunerationProfileData } from "./remuneration-profile";
import { UNKNOWN_TVAL_CARE, validateTvalCareAllowances } from "./tval-care-allowances";

const selection = {
  kind: "tariff",
  packageId: "tval-pflege-tdl",
  variant: "CARE",
  region: "WEST_38_5",
  group: "regular",
  level: "1",
  fullTimeWeeklyMinutes: 2310,
  tvalEmployerScope: null,
  tvlEmploymentCategory: null,
};
const profile = (facts: unknown) => ({
  version: 8,
  weeklyMinutes: 1155,
  selection: { ...selection, tvalCareAllowances: facts },
});

describe("dated TVA-L activity facts", () => {
  it.each(
    ([null, false, true] as const).flatMap((paidEntitlement) =>
      ([null, "NONE", "LOWER", "HIGHER"] as const).flatMap((clinical) =>
        ([null, false, true] as const).map((burnCare) => ({ paidEntitlement, clinical, burnCare })),
      ),
    ),
  )("preserves unknown/none/confirmed independently: %j", (facts) => {
    expect(validateTvalCareAllowances(facts)).toEqual(facts);
    const result = validateRemunerationProfileData(profile(facts));
    expect(result).toEqual(profile(facts));
    expect(Object.isFrozen(result.selection)).toBe(true);
    if (result.selection.kind === "tariff")
      expect(Object.isFrozen(result.selection.tvalCareAllowances)).toBe(true);
  });
  it.each([
    undefined,
    true,
    [],
    {},
    { ...UNKNOWN_TVAL_CARE, nursing: true },
    { ...UNKNOWN_TVAL_CARE, clinical: "DIRECT_LOWER" },
    { ...UNKNOWN_TVAL_CARE, clinical: "LEADER_HIGHER" },
    { ...UNKNOWN_TVAL_CARE, paidEntitlement: "true" },
    { ...UNKNOWN_TVAL_CARE, burnCare: 0 },
  ])("rejects malformed or employee-only facts %j", (facts) => {
    expect(() => validateTvalCareAllowances(facts)).toThrow();
    expect(() => validateRemunerationProfileData(profile(facts))).toThrow();
  });
  it("allows explicitly unknown facts but never silently upgrades legacy versions", () => {
    expect(validateTvalCareAllowances(null)).toBeNull();
    expect(validateRemunerationProfileData(profile(null))).toEqual(profile(null));
    const v7 = { version: 7, weeklyMinutes: 2310, selection };
    expect(validateRemunerationProfileData(v7)).toEqual(v7);
    expect(() => validateRemunerationProfileData({ ...profile(null), version: 7 })).toThrow();
    expect(() => validateRemunerationProfileData({ ...v7, version: 8 })).toThrow();
  });
  it("keeps version 8 exclusive to TVA-L and rejects accidental employee claims", () => {
    const original = profile(UNKNOWN_TVAL_CARE);
    expect(() =>
      validateRemunerationProfileData({
        ...original,
        selection: { ...original.selection, packageId: "tvl-kr-tdl" },
      }),
    ).toThrow();
    expect(() =>
      validateRemunerationProfileData({
        ...original,
        selection: { kind: "own-monthly", monthlyGrossCents: 200000 },
      }),
    ).toThrow();
  });
});
