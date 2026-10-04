import { describe, expect, it } from "vitest";
import { remunerationDataFromLegacy } from "@/domain/remuneration-profile";
import type { UserProfile } from "@/domain/types";
import { bundledRuleResolver } from "@/rules/rule-resolver";
import krValue from "../../../rules/packages/reviewed/tvl-kr-tdl/2026-04.json";
import tvalValue from "../../../rules/packages/reviewed/tval-pflege-tdl/2026-04.json";
import type { RuleTariffPackage } from "@/rules/contracts.generated";
import { resolver } from "@/engine/remuneration-test-fixtures";
import {
  formatRemunerationDate,
  parseRemunerationDateInput,
  remunerationDataFromForm,
  remunerationFormValues,
} from "./remuneration-editor-values";

const base: UserProfile = {
  federalState: "NW",
  holidayRegion: "NONE",
  weeklyMinutes: 2310,
  timeZone: "Europe/Berlin",
  regularRotatingNightWork: null,
  sundayHolidayWorkEligible: null,
  allEmploymentWorkRecorded: null,
  tariff: {
    payGroup: "P5",
    payLevel: 1,
    sector: "BT_K",
    tariffRegion: "OTHER",
    fullTimeWeeklyMinutes: 2310,
  },
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
};

describe("dated remuneration form conversion", () => {
  it("roundtrips v8 training activity facts without inventing or leaking employee claims", () => {
    const input = {
      version: 8 as const,
      weeklyMinutes: 1155,
      selection: {
        kind: "tariff" as const,
        packageId: "tval-pflege-tdl",
        variant: "CARE",
        region: "WEST_38_5",
        group: "regular",
        level: "1",
        fullTimeWeeklyMinutes: 2310,
        tvalEmployerScope: null,
        tvlEmploymentCategory: null,
        tvalCareAllowances: { paidEntitlement: true, clinical: "HIGHER" as const, burnCare: false },
      },
    };
    const catalog = resolver([tvalValue as RuleTariffPackage]);
    const values = remunerationFormValues(input);
    expect(remunerationDataFromForm(values, "2026-09-01", catalog)).toEqual(input);
    expect(
      remunerationDataFromForm(
        {
          ...values,
          salaryMode: "MANUAL",
          manualMonthlyGross: "2000",
        },
        "2026-09-01",
        catalog,
      ).selection,
    ).not.toHaveProperty("tvalCareAllowances");
    const { tvalCareAllowances: _, ...selection } = input.selection;
    const legacy = { ...input, version: 7 as const, selection };
    expect(remunerationFormValues(legacy).tvalCareAllowances).toBeNull();
    expect(remunerationDataFromForm(remunerationFormValues(legacy), "2026-09-01", catalog)).toEqual(
      legacy,
    );
  });
  it.each([null, "GENERAL", "SECTION_43"] as const)(
    "roundtrips TVA-L employer scope %s without passing it to own remuneration",
    (tvalEmployerScope) => {
      const input = {
        version: 6 as const,
        weeklyMinutes: 1155,
        selection: {
          kind: "tariff" as const,
          packageId: "tval-pflege-tdl",
          variant: "CARE",
          region: "WEST_38_5",
          group: "regular",
          level: "1",
          fullTimeWeeklyMinutes: 2310,
          tvalEmployerScope,
        },
      };
      const values = remunerationFormValues(input);
      expect(values.tvalEmployerScope).toBe(tvalEmployerScope);
      const catalog = resolver([tvalValue as RuleTariffPackage]);
      expect(remunerationDataFromForm(values, "2026-09-01", catalog)).toEqual({
        ...input,
        version: 7,
        selection: { ...input.selection, tvlEmploymentCategory: null },
      });
      const own = remunerationDataFromForm(
        { ...values, salaryMode: "MANUAL", manualMonthlyGross: "2000" },
        "2026-09-01",
        catalog,
      );
      expect(own.selection).not.toHaveProperty("tvalEmployerScope");
      const { tvalEmployerScope: _, ...selection } = input.selection;
      expect(
        remunerationFormValues({ ...input, version: 1, selection }).tvalEmployerScope,
      ).toBeNull();
    },
  );
  it("roundtrips v5 care confirmations and discards them for another salary model", () => {
    const input = {
      version: 5 as const,
      weeklyMinutes: 2310,
      selection: {
        kind: "tariff" as const,
        packageId: "tvl-kr-tdl",
        variant: "SECTION_43",
        region: "WEST_38_5",
        group: "KR7",
        level: "2",
        fullTimeWeeklyMinutes: 2310,
        tvlEmploymentCategory: null,
        tvlCareAllowances: {
          paidEntitlement: true,
          nursing: true,
          instructor: false,
          clinical: "DIRECT_HIGHER" as const,
          leadershipAnnexFNumber: "NONE" as const,
          burnCare: false,
        },
      },
    };
    const values = remunerationFormValues(input);
    expect(
      remunerationDataFromForm(values, "2026-10-01", resolver([krValue as RuleTariffPackage])),
    ).toEqual(input);
    const own = remunerationDataFromForm(
      { ...values, salaryMode: "MANUAL", manualMonthlyGross: "2000" },
      "2026-10-01",
      resolver([]),
    );
    expect(own.selection).not.toHaveProperty("tvlCareAllowances");
  });
  it.each([null, "SALARIED_SECTION_38_5_1", "OTHER"] as const)(
    "roundtrips the v4 TV-L category %s and drops it when saving own remuneration",
    (tvlEmploymentCategory) => {
      const input = {
        version: 4 as const,
        weeklyMinutes: 1155,
        selection: {
          kind: "tariff" as const,
          packageId: "tvl-kr-tdl",
          variant: "SECTION_43",
          region: "WEST_38_5",
          group: "KR5",
          level: "1",
          fullTimeWeeklyMinutes: 2310,
          tvlEmploymentCategory,
        },
      };
      const values = remunerationFormValues(input);
      expect(values.tvlEmploymentCategory).toBe(tvlEmploymentCategory);
      const output = remunerationDataFromForm(
        values,
        "2026-10-01",
        resolver([krValue as RuleTariffPackage]),
      );
      expect(output).toEqual(input);
      const own = remunerationDataFromForm(
        {
          ...values,
          salaryMode: "MANUAL",
          manualMonthlyGross: "2000",
        },
        "2026-10-01",
        resolver([]),
      );
      expect(own.version).toBe(2);
      expect(own.selection).not.toHaveProperty("tvlEmploymentCategory");
      const tariff = remunerationDataFromForm(
        {
          ...remunerationFormValues(remunerationDataFromLegacy(base)),
          tvlEmploymentCategory,
        },
        "2026-10-01",
        bundledRuleResolver,
      );
      expect(tariff.version).toBe(1);
      expect(tariff.selection).not.toHaveProperty("tvlEmploymentCategory");
    },
  );
  it.each([
    ["29.02.2024", "2024-02-29"],
    [" 01.10.2026 ", "2026-10-01"],
    ["2026-10-01", "2026-10-01"],
  ])("accepts an explicit real date %s", (input, iso) => {
    expect(parseRemunerationDateInput(input)).toBe(iso);
    expect(parseRemunerationDateInput(formatRemunerationDate(iso))).toBe(iso);
  });
  it.each(["", "heute", "31.04.2026", "29.02.2026", "1.10.2026", "01.01.1899", "2026-13-01"])(
    "rejects missing or invalid dates %s",
    (input) => {
      expect(() => parseRemunerationDateInput(input)).toThrow();
    },
  );
  it.each(["P5", "P6"] as const)(
    "roundtrips %s stage 1 without changing the base profile",
    (payGroup) => {
      const snapshot = structuredClone(base);
      const values = { ...remunerationFormValues(remunerationDataFromLegacy(base)), payGroup };
      const data = remunerationDataFromForm(values, "2026-10-01", bundledRuleResolver);
      expect(data.selection).toMatchObject({ kind: "tariff", group: payGroup, level: "1" });
      expect(remunerationFormValues(data)).toMatchObject({
        payGroup,
        payLevel: "1",
      });
      expect(base).toEqual(snapshot);
    },
  );
  it("keeps the personal monthly amount unchanged for part-time", () => {
    const data = remunerationDataFromForm(
      {
        ...remunerationFormValues(remunerationDataFromLegacy(base)),
        salaryMode: "MANUAL",
        manualMonthlyGross: "1800,50",
        weeklyHours: "19,25",
      },
      "2026-10-01",
      bundledRuleResolver,
    );
    expect(data).toMatchObject({
      version: 2,
      weeklyMinutes: 1155,
      selection: {
        kind: "own-configured",
        configuration: { base: { kind: "monthly", personalCents: 180050 } },
      },
    });
    expect(remunerationFormValues(data)).toMatchObject({
      salaryMode: "MANUAL",
      manualMonthlyGross: "1800,50",
      weeklyHours: "19,25",
    });
  });
  it.each([
    { salaryMode: "UNSET" as const },
    { salaryMode: "MANUAL" as const, manualMonthlyGross: "" },
    { weeklyHours: "20 hours" },
    { weeklyHours: "0" },
    { payGroup: "P7" as const, payLevel: "1" },
    { payLevel: "UNSET" as const },
  ])("does not save incomplete or incompatible form values %j", (change) => {
    expect(() =>
      remunerationDataFromForm(
        { ...remunerationFormValues(remunerationDataFromLegacy(base)), ...change },
        "2026-10-01",
        bundledRuleResolver,
      ),
    ).toThrow();
  });
  it.each([
    { packageId: "future-tariff" },
    { region: "FUTURE" },
    { variant: "FUTURE" },
    { group: "P99" },
    { level: "01" },
    { level: "7" },
    { group: "P7", level: "1" },
  ])("keeps unknown or incompatible selections read-only %j", (change) => {
    const data = remunerationDataFromLegacy(base);
    if (data.selection.kind !== "tariff") throw new Error("fixture");
    const raw = { ...data, selection: { ...data.selection, ...change } };
    const values = remunerationFormValues(raw);
    expect(values).toMatchObject({
      packageId: raw.selection.packageId,
      tariffRegion: raw.selection.region,
      sector: raw.selection.variant,
      payGroup: raw.selection.group,
      payLevel: raw.selection.level,
    });
    expect(() => remunerationDataFromForm(values, "2026-10-01", bundledRuleResolver)).toThrow();
  });
  it("keeps missing remuneration unconfigured", () => {
    expect(
      remunerationFormValues({
        version: 1,
        weeklyMinutes: 1200,
        selection: { kind: "unconfigured" },
      }),
    ).toMatchObject({ salaryMode: "UNSET", manualMonthlyGross: "", weeklyHours: "20" });
  });
});
