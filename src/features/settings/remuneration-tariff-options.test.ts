import { describe, expect, it } from "vitest";
import krValue from "../../../rules/packages/reviewed/tvl-kr-tdl/2026-04.json";
import tvalValue from "../../../rules/packages/reviewed/tval-pflege-tdl/2027-01.json";
import type { RuleTariffPackage } from "@/rules/contracts.generated";
import { bundledRuleResolver } from "@/rules/rule-resolver";
import { candidate, history, resolver } from "@/engine/remuneration-test-fixtures";
import { selectionCandidate } from "@/rules/tariff-selection-test-fixtures";
import { remunerationTariffOptions } from "./remuneration-tariff-options";
import { remunerationFormValues, remunerationDataFromForm } from "./remuneration-editor-values";

describe("catalog driven remuneration options", () => {
  it("roundtrips TVA-L categories and distinct paid-period labels without VKA defaults", () => {
    const rules = resolver([tvalValue as RuleTariffPackage]);
    const option = remunerationTariffOptions("2027-01-01", rules).available[0]!;
    expect(option.employmentKind).toBe("APPRENTICE");
    expect(option.groups.map((g) => g.id)).toEqual(["regular", "assistant"]);
    const assistant = option.groups.find((g) => g.id === "assistant")!;
    expect(assistant.levels).toEqual(["1", "2"]);
    expect(assistant.periodKind).toBe("TRAINING_MONTH_BRACKET");
    expect(assistant.levelLabels?.["2"]).toBe("Ab dem 13. Ausbildungsmonat");
    const data = {
      version: 1 as const,
      weeklyMinutes: 2310,
      selection: {
        kind: "tariff" as const,
        packageId: "tval-pflege-tdl",
        variant: "CARE",
        region: "WEST_38_5",
        group: "assistant",
        level: "2",
        fullTimeWeeklyMinutes: 2310,
      },
    };
    expect(remunerationDataFromForm(remunerationFormValues(data), "2027-01-01", rules)).toEqual({
      ...data,
      version: 7,
      selection: { ...data.selection, tvalEmployerScope: null, tvlEmploymentCategory: null },
    });
    expect(data.version).toBe(1);
    expect(data.selection).not.toHaveProperty("tvalEmployerScope");
    expect(() =>
      remunerationDataFromForm(remunerationFormValues(data), "2026-12-31", rules),
    ).toThrow();
    expect(option.supportNote).toContain("kein vollständiges Gesamtbrutto");
  });
  const kr = krValue as RuleTariffPackage;
  it("keeps KR and P tracks distinct with their own valid groups and stages", () => {
    const options = remunerationTariffOptions("2026-10-01", resolver([candidate, kr]));
    expect(options.available.map((item) => item.id)).toContain(kr.packageId);
    const option = options.available.find((item) => item.id === kr.packageId)!;
    expect(option.groups.map((group) => group.id)).toEqual(
      Array.from({ length: 13 }, (_, index) => "KR" + (index + 5)),
    );
    expect(option.groups[0].levels).toEqual(["1", "2", "3", "4", "5", "6"]);
    expect(option.groups[1].levels).toEqual(["1", "2", "3", "4", "5", "6"]);
    expect(option.groups[2].levels).toEqual(["2", "3", "4", "5", "6"]);
    expect(option.variants.map((item) => item.id)).toEqual(["SECTION_43"]);
    expect(option.variants[0].regions.map((item) => item.id)).toEqual([
      "WEST_38_5",
      "EAST",
      "EAST_UNIVERSITY_HOSPITAL",
    ]);
    expect(option.supportNote).toContain("kein vollständiges Gesamtbrutto");
    expect(options.available.find((item) => item.id === candidate.packageId)!.groups[0].id).toBe(
      "P5",
    );
  });
  it.each([
    ["2026-12-01", 2400],
    ["2027-01-01", 2370],
  ])("roundtrips explicit KR selection with dated full-time basis at %s", (date, fullTime) => {
    const data = {
      version: 1 as const,
      weeklyMinutes: 1155,
      selection: {
        kind: "tariff" as const,
        packageId: kr.packageId,
        variant: "SECTION_43",
        region: "EAST_UNIVERSITY_HOSPITAL",
        group: "KR5",
        level: "1",
        fullTimeWeeklyMinutes: 2400,
      },
    };
    expect(remunerationDataFromForm(remunerationFormValues(data), date, resolver([kr]))).toEqual({
      ...data,
      version: 4,
      selection: {
        ...data.selection,
        fullTimeWeeklyMinutes: fullTime,
        tvlEmploymentCategory: null,
      },
    });
    expect(() =>
      remunerationDataFromForm(
        remunerationFormValues({ ...data, selection: { ...data.selection, group: "KR7" } }),
        date,
        resolver([kr]),
      ),
    ).toThrow();
  });
  it("rejects an incomplete KR contract instead of supplying TVöD defaults", () => {
    const incomplete = {
      ...kr,
      rules: { ...kr.rules, employmentWorkingTimeRules: [] },
    };
    expect(
      remunerationTariffOptions(
        "2026-10-01",
        resolver([incomplete as unknown as RuleTariffPackage]),
      ).available,
    ).toEqual([]);
    expect(remunerationTariffOptions("2025-10-01", resolver([kr])).available).toEqual([]);
  });
  it("enumerates immutable unique tracks and never aliases a remote selection to embedded data", () => {
    const remote = resolver([
      candidate,
      { ...candidate, versionId: "next", validFrom: "2027-04-01", validTo: "2028-01-01" },
    ]);
    expect(remote.tariffPackageIds).toEqual([candidate.packageId]);
    expect(Object.isFrozen(remote.tariffPackageIds)).toBe(true);
    const incomplete = structuredClone(candidate);
    incomplete.rules.payTables[0].entries = incomplete.rules.payTables[0].entries.filter(
      (row) => !["p5", "p6"].includes(row.groupId),
    ) as (typeof incomplete.rules.payTables)[number]["entries"];
    // Contract 11 requires annual rules to agree with the supplied table groups.
    expect(remunerationTariffOptions("2026-10-01", resolver([incomplete])).available).toEqual([]);
    incomplete.rules.annualPaymentRules = incomplete.rules.annualPaymentRules?.map((rule) => ({
      ...rule,
      payGroups: rule.payGroups.filter((group) => !["p5", "p6"].includes(group)),
    })) as typeof incomplete.rules.annualPaymentRules;
    expect(
      remunerationTariffOptions("2026-10-01", resolver([incomplete])).available[0].groups.some(
        (group) => group.id === "P5",
      ),
    ).toBe(false);
    expect(() =>
      remunerationDataFromForm(
        remunerationFormValues(history().data),
        "2026-10-01",
        resolver([incomplete]),
      ),
    ).toThrow();
    expect(
      remunerationTariffOptions("2026-10-01", bundledRuleResolver).available[0].groups.some(
        (group) => group.id === "P5",
      ),
    ).toBe(true);
  });
  it("uses metadata variants/regions and table-dependent levels without invented combinations", () => {
    const rule = selectionCandidate();
    const options = remunerationTariffOptions("2026-10-01", resolver([rule]));
    expect(options.available[0].label).toBe(rule.label);
    expect(
      options.available[0].variants.find((v) => v.id === "BT_B")!.regions.map((r) => r.id),
    ).toEqual(["OTHER", "KAV_BW"]);
    expect(options.available[0].groups.find((group) => group.id === "P5")!.levels).toEqual([
      "1",
      "2",
      "3",
      "4",
      "5",
      "6",
    ]);
    expect(options.available[0].groups.find((group) => group.id === "P7")!.levels).toEqual([
      "2",
      "3",
      "4",
      "5",
      "6",
    ]);
  });
  it.each(["2026-04-30", "2027-04-01"])("does not extrapolate missing tables at %s", (date) => {
    expect(remunerationTariffOptions(date, resolver()).available).toEqual([]);
    expect(() =>
      remunerationDataFromForm(remunerationFormValues(history().data), date, resolver()),
    ).toThrow();
  });
  it("takes full-time hours from dated rules instead of the old fixed UI value", () => {
    const rule = structuredClone(candidate);
    rule.rules.weeklyWorkingTimeRules!.forEach((item) => {
      item.fullTimeWeeklyMinutes = 2400;
    });
    const data = remunerationDataFromForm(
      remunerationFormValues(history().data),
      "2026-10-01",
      resolver([rule]),
    );
    expect(data.selection).toMatchObject({ fullTimeWeeklyMinutes: 2400 });
    expect(data.weeklyMinutes).toBe(history().data.weeklyMinutes);
  });
  it("reports unknown families without enabling the TVöD adapter", () => {
    const future = { ...candidate, packageId: "future-tariff", label: "Zukünftiger Tarif" };
    const options = remunerationTariffOptions("2026-10-01", resolver([candidate, future]));
    expect(options.available.map((item) => item.id)).toEqual([candidate.packageId]);
    expect(options.unavailable).toEqual([
      expect.objectContaining({ id: "future-tariff", label: "Zukünftiger Tarif" }),
    ]);
  });
  it("does not choose between ambiguous versions or discover tariffs from an opaque adapter", () => {
    expect(
      remunerationTariffOptions(
        "2026-10-01",
        resolver([candidate, { ...candidate, versionId: "conflict" }]),
      ).available,
    ).toEqual([]);
    const { tariffPackageIds: _, ...opaque } = resolver();
    expect(remunerationTariffOptions("2026-10-01", opaque).available).toEqual([]);
  });
  it("preserves personal monthly pay regardless of missing tariff catalog", () => {
    expect(
      remunerationDataFromForm(
        {
          ...remunerationFormValues(history().data),
          salaryMode: "MANUAL",
          manualMonthlyGross: "2000",
          weeklyHours: "19,25",
        },
        "2026-10-01",
        resolver([]),
      ),
    ).toMatchObject({
      version: 2,
      weeklyMinutes: 1155,
      selection: {
        kind: "own-configured",
        configuration: { base: { kind: "monthly", personalCents: 200000 } },
      },
    });
  });
});
