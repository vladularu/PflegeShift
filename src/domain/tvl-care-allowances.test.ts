import { describe, expect, it } from "vitest";
import { UNKNOWN_TVL_CARE, validateTvlCareAllowances } from "./tvl-care-allowances";
import { validateRemunerationProfileData } from "./remuneration-profile";

const selection = {
  kind: "tariff",
  packageId: "tvl-kr-tdl",
  variant: "SECTION_43",
  region: "WEST_38_5",
  group: "KR7",
  level: "2",
  fullTimeWeeklyMinutes: 2310,
  tvlEmploymentCategory: null,
};
describe("dated TV-L care confirmations", () => {
  it.each([
    null,
    UNKNOWN_TVL_CARE,
    {
      paidEntitlement: true,
      nursing: false,
      instructor: true,
      clinical: "DIRECT_HIGHER",
      leadershipAnnexFNumber: "NONE",
      burnCare: false,
    },
  ])("preserves null, false and explicit claims without inventing legacy history", (facts) => {
    const input = {
      version: 5,
      weeklyMinutes: 2310,
      selection: { ...selection, tvlCareAllowances: facts },
    };
    expect(validateRemunerationProfileData(JSON.parse(JSON.stringify(input)))).toEqual(input);
    expect(
      validateRemunerationProfileData({ version: 4, weeklyMinutes: 2310, selection }).selection,
    ).not.toHaveProperty("tvlCareAllowances");
  });
  it.each([
    undefined,
    [],
    {},
    { ...UNKNOWN_TVL_CARE, nursing: 1 },
    { ...UNKNOWN_TVL_CARE, instructor: "yes" },
    { ...UNKNOWN_TVL_CARE, clinical: "ALL" },
    { ...UNKNOWN_TVL_CARE, leadershipAnnexFNumber: "2" },
    { ...UNKNOWN_TVL_CARE, leadershipAnnexFNumber: 8 },
    { ...UNKNOWN_TVL_CARE, personalMonthlyCents: 20000 },
  ])("rejects malformed confirmations %#", (value) => {
    expect(() => validateTvlCareAllowances(value)).toThrow();
  });
  it("rejects v5 payloads on other tariffs and old versions", () => {
    const input = {
      version: 5,
      weeklyMinutes: 2310,
      selection: { ...selection, tvlCareAllowances: UNKNOWN_TVL_CARE },
    };
    expect(() => validateRemunerationProfileData({ ...input, version: 4 })).toThrow();
    expect(() =>
      validateRemunerationProfileData({
        ...input,
        selection: { ...input.selection, packageId: "tvoed-p-vka" },
      }),
    ).toThrow();
  });
  it("copies and freezes the validated confirmations", () => {
    const raw = { ...UNKNOWN_TVL_CARE };
    const result = validateTvlCareAllowances(raw)!;
    raw.nursing = true;
    expect(result.nursing).toBeNull();
    expect(Object.isFrozen(result)).toBe(true);
  });
});
