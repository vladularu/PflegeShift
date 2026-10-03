import { describe, expect, it } from "vitest";
import { ownRemunerationFixture } from "./own-remuneration-test-fixtures";
import {
  type DatedRemunerationProfile,
  RemunerationProfileError,
  requireRemunerationDate,
  resolveRemunerationProfile,
  validateRemunerationProfileData,
} from "./remuneration-profile";

const own = {
  version: 1,
  weeklyMinutes: 1155,
  selection: { kind: "own-monthly", monthlyGrossCents: 200000 },
} as const;
function profile(effectiveFrom: string | null, cents = 200000): DatedRemunerationProfile {
  return {
    effectiveFrom,
    data: { ...own, selection: { kind: "own-monthly", monthlyGrossCents: cents } },
    revision: 1,
    createdAt: "2026-09-01T00:00:00Z",
    updatedAt: "2026-09-01T00:00:00Z",
  };
}

describe("temporal remuneration contract", () => {
  it.each([null, "SALARIED_SECTION_38_5_1", "OTHER"] as const)(
    "accepts the explicitly confirmed TVA-L category %s only in v7",
    (tvlEmploymentCategory) => {
      const value = {
        version: 7,
        weeklyMinutes: 2310,
        selection: {
          kind: "tariff",
          packageId: "tval-pflege-tdl",
          variant: "CARE",
          region: "WEST_38_5",
          group: "regular",
          level: "1",
          fullTimeWeeklyMinutes: 2310,
          tvalEmployerScope: "SECTION_43",
          tvlEmploymentCategory,
        },
      };
      expect(validateRemunerationProfileData(value)).toEqual(value);
      for (const bad of [undefined, true, "TRAINING"])
        expect(() =>
          validateRemunerationProfileData({
            ...value,
            selection: { ...value.selection, tvlEmploymentCategory: bad },
          }),
        ).toThrow();
      expect(() => validateRemunerationProfileData({ ...value, version: 6 })).toThrow();
      expect(() =>
        validateRemunerationProfileData({
          ...value,
          selection: { ...value.selection, packageId: "tvl-kr-tdl" },
        }),
      ).toThrow();
      const { tvlEmploymentCategory: _, ...selection } = value.selection;
      expect(
        validateRemunerationProfileData({ ...value, version: 6, selection }).selection,
      ).not.toHaveProperty("tvlEmploymentCategory");
    },
  );
  it.each([null, "GENERAL", "SECTION_43"] as const)(
    "accepts TVA-L employer scope %s only in the explicit v6 contract",
    (tvalEmployerScope) => {
      const input = {
        version: 6,
        weeklyMinutes: 1155,
        selection: {
          kind: "tariff",
          packageId: "tval-pflege-tdl",
          variant: "CARE",
          region: "WEST_38_5",
          group: "regular",
          level: "1",
          fullTimeWeeklyMinutes: 2310,
          tvalEmployerScope,
        },
      };
      expect(validateRemunerationProfileData(input)).toEqual(input);
      for (const version of [1, 2, 3, 4, 5])
        expect(() => validateRemunerationProfileData({ ...input, version })).toThrow();
      for (const bad of [undefined, true, 0, "", "HOSPITAL"])
        expect(() =>
          validateRemunerationProfileData({
            ...input,
            selection: { ...input.selection, tvalEmployerScope: bad },
          }),
        ).toThrow();
      for (const packageId of ["tvl-kr-tdl", "tvaoed-pflege-vka", "future-tariff"])
        expect(() =>
          validateRemunerationProfileData({
            ...input,
            selection: { ...input.selection, packageId },
          }),
        ).toThrow();
      const { tvalEmployerScope: _, ...selection } = input.selection;
      expect(() => validateRemunerationProfileData({ ...input, selection })).toThrow();
      const legacy = { ...input, version: 1, selection };
      expect(validateRemunerationProfileData(legacy)).toEqual(legacy);
      expect(validateRemunerationProfileData(legacy).selection).not.toHaveProperty(
        "tvalEmployerScope",
      );
      expect(() => validateRemunerationProfileData({ ...own, version: 6 })).toThrow();
    },
  );
  it.each([null, "SALARIED_SECTION_38_5_1", "OTHER"] as const)(
    "validates TV-L category %s only in its explicit v4 contract",
    (tvlEmploymentCategory) => {
      const input = {
        version: 4,
        weeklyMinutes: 1155,
        selection: {
          kind: "tariff",
          packageId: "tvl-kr-tdl",
          variant: "SECTION_43",
          region: "WEST_38_5",
          group: "KR5",
          level: "1",
          fullTimeWeeklyMinutes: 2310,
          tvlEmploymentCategory,
        },
      };
      expect(validateRemunerationProfileData(input)).toEqual(input);
      for (const version of [1, 2, 3, 5])
        expect(() => validateRemunerationProfileData({ ...input, version })).toThrow();
      for (const packageId of ["tvoed-vka-bt-k", "tvaoed-pflege-vka", "future-tariff"])
        expect(() =>
          validateRemunerationProfileData({
            ...input,
            selection: { ...input.selection, packageId },
          }),
        ).toThrow();
      for (const bad of [undefined, true, 0, "", "SALARIED", { category: "OTHER" }])
        expect(() =>
          validateRemunerationProfileData({
            ...input,
            selection: { ...input.selection, tvlEmploymentCategory: bad },
          }),
        ).toThrow();
      expect(() =>
        validateRemunerationProfileData({
          ...input,
          selection: { ...input.selection, specialDutyAllowance: "NONE" },
        }),
      ).toThrow();
      const { tvlEmploymentCategory: _, ...legacySelection } = input.selection;
      expect(() =>
        validateRemunerationProfileData({ ...input, selection: legacySelection }),
      ).toThrow();
      const legacy = { ...input, version: 1, selection: legacySelection };
      expect(validateRemunerationProfileData(legacy)).toEqual(legacy);
      expect(validateRemunerationProfileData(legacy).selection).not.toHaveProperty(
        "tvlEmploymentCategory",
      );
      expect(() => validateRemunerationProfileData({ ...own, version: 4 })).toThrow();
    },
  );
  it.each([null, "NONE", "PE1_ONLY", "OTHER_OR_MULTIPLE"] as const)(
    "retains explicit training eligibility %s only in profile v3",
    (specialDutyAllowance) => {
      const input = {
        version: 3,
        weeklyMinutes: 2310,
        selection: {
          kind: "tariff",
          packageId: "tvaoed-pflege-vka",
          variant: "BT_K",
          region: "OTHER",
          group: "b",
          level: "1",
          fullTimeWeeklyMinutes: 2310,
          specialDutyAllowance,
        },
      };
      expect(validateRemunerationProfileData(input)).toEqual(input);
      expect(() => validateRemunerationProfileData({ ...input, version: 1 })).toThrow();
      expect(() =>
        validateRemunerationProfileData({
          ...input,
          selection: { ...input.selection, packageId: "tvoed-vka-bt-k" },
        }),
      ).toThrow();
      for (const bad of [undefined, true, 2301, "PE1", { amountCents: 2301 }])
        expect(() =>
          validateRemunerationProfileData({
            ...input,
            selection: { ...input.selection, specialDutyAllowance: bad },
          }),
        ).toThrow();
    },
  );
  it("accepts v2 personal components only under their own versioned discriminator", () => {
    const input = {
      version: 2,
      weeklyMinutes: 1155,
      selection: {
        kind: "own-configured",
        configuration: ownRemunerationFixture(),
      },
    };
    const parsed = validateRemunerationProfileData(input);
    expect(parsed).toEqual(input);
    expect(() => validateRemunerationProfileData({ ...input, version: 1 })).toThrow();
    expect(() => validateRemunerationProfileData({ ...input, version: 3 })).toThrow();
    expect(() =>
      validateRemunerationProfileData({
        ...input,
        selection: { ...input.selection, packageId: "tvoed-vka-bt-k" },
      }),
    ).toThrow();
    expect(() => validateRemunerationProfileData({ ...own, version: 2 })).toThrow();
  });
  it("keeps a personal monthly amount and part-time minutes without reducing the amount", () => {
    const result = validateRemunerationProfileData(own);
    expect(result).toEqual(own);
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.selection)).toBe(true);
  });

  it("preserves an unknown tariff binding instead of substituting TVöD", () => {
    const candidate = {
      ...own,
      selection: {
        kind: "tariff",
        packageId: "future-tariff",
        variant: "region-variant",
        region: "NORD",
        group: "KR5",
        level: "1",
        fullTimeWeeklyMinutes: 2310,
      },
    };
    expect(validateRemunerationProfileData(candidate)).toEqual(candidate);
  });

  it.each([
    { ...own, version: 2 },
    { ...own, weeklyMinutes: 0 },
    { ...own, extra: true },
    { ...own, selection: { ...own.selection, monthlyGrossCents: 1.5 } },
    { ...own, selection: { ...own.selection, monthlyGrossCents: 0 } },
    { ...own, selection: { ...own.selection, monthlyGrossCents: 10000001 } },
    { ...own, selection: { ...own.selection, hourlyCents: 2000 } },
    {
      ...own,
      selection: {
        kind: "tariff",
        packageId: "../other",
        variant: "BT_K",
        region: "OTHER",
        group: "P5",
        level: "1",
        fullTimeWeeklyMinutes: 2310,
      },
    },
    { ...own, selection: { kind: "future" } },
    null,
  ])("rejects unsupported or malformed data %#", (candidate) => {
    expect(() => validateRemunerationProfileData(candidate)).toThrow(RemunerationProfileError);
  });

  it.each([
    "2026-02-29",
    "2026-02-30",
    "2026-13-01",
    "2026-9-01",
    "2026-09-01T00:00:00Z",
    "",
    null,
  ])("rejects invalid effective dates %s", (date) => {
    expect(() => requireRemunerationDate(date)).toThrow(RemunerationProfileError);
  });

  it("resolves exact boundaries including leap day independently of order", () => {
    const baseline = profile(null);
    const first = profile("2024-02-29", 210000);
    const next = profile("2024-03-15", 220000);
    const profiles = [next, baseline, first];
    expect(resolveRemunerationProfile(profiles, "2024-02-28")).toEqual({
      status: "unknown-effective-date",
      profile: baseline,
    });
    expect(resolveRemunerationProfile(profiles, "2024-02-29")).toEqual({
      status: "dated",
      profile: first,
    });
    expect(resolveRemunerationProfile(profiles, "2024-03-14")).toEqual({
      status: "dated",
      profile: first,
    });
    expect(resolveRemunerationProfile(profiles, "2024-03-15")).toEqual({
      status: "dated",
      profile: next,
    });
    expect(resolveRemunerationProfile(profiles, "2027-01-01")).toEqual({
      status: "dated",
      profile: next,
    });
    expect(resolveRemunerationProfile([first], "2024-02-28")).toEqual({
      status: "missing",
      profile: null,
    });
  });

  it("does not silently choose among duplicate dates or baselines", () => {
    expect(() => resolveRemunerationProfile([profile(null), profile(null)], "2026-09-01")).toThrow(
      "Mehrdeutige",
    );
    expect(() =>
      resolveRemunerationProfile([profile("2026-09-01"), profile("2026-09-01")], "2026-09-01"),
    ).toThrow("Mehrdeutige");
  });
});
