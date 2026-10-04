import { describe, expect, it } from "vitest";
import oldRaw from "../../rules/packages/reviewed/tvoed-vka-sue-bt-b/2025-04-01-draft1.json";
import currentRaw from "../../rules/packages/reviewed/tvoed-vka-sue-bt-b/2026-05-01-draft1.json";
import type { RuleTariffPackage } from "../rules/contracts.generated";
import { calculateTvoedSueDraftBase, type TvoedSueDraftBaseInput } from "./tvoed-sue-draft-base";

const old = oldRaw as RuleTariffPackage;
const current = currentRaw as RuleTariffPackage;
const input: TvoedSueDraftBaseInput = {
  pkg: current,
  month: "2026-05",
  groupId: "S8A",
  stepId: "s3",
  contractedWeeklyMinutes: 2310,
  tariffApplicabilityConfirmed: true,
  sueClassificationConfirmed: true,
  standardFullTimeConfirmed: true,
  fullMonthBaseEntitlementConfirmed: true,
  fullMonthSameContractConfirmed: true,
};

describe("confirmed TVöD-VKA SuE BT-B table base", () => {
  it("calculates the confirmed May 2026 part-time base with separate missing components", () => {
    expect(calculateTvoedSueDraftBase(input)).toEqual({
      kind: "draft-table-base",
      completeGross: false,
      fullTimeTableCents: 397682,
      personalTableBaseCents: 392584,
      contractedWeeklyMinutes: 2310,
      standardFullTimeWeeklyMinutes: 2340,
      packageId: "tvoed-vka-sue-bt-b",
      versionId: "2026-05-01-draft1",
      variantId: "BT_B",
      groupId: "s8a",
      stepId: "s3",
      sourceIds: ["vka-tvoed-sue-bt-b-2025-2026"],
      excludedComponents: [
        "TIME_PREMIUMS",
        "ALLOWANCES",
        "OVERTIME",
        "ANNUAL_PAYMENT",
        "OTHER_INDIVIDUAL_TERMS",
      ],
    });
  });

  it("selects the old table in April and rejects either table outside its full-month range", () => {
    expect(
      calculateTvoedSueDraftBase({
        ...input,
        pkg: old,
        month: "2026-04",
        groupId: "s18",
        stepId: "s1",
        contractedWeeklyMinutes: 2340,
      }),
    ).toMatchObject({ fullTimeTableCents: 459195, personalTableBaseCents: 459195 });
    expect(calculateTvoedSueDraftBase({ ...input, pkg: old })).toEqual({
      kind: "unavailable",
      reason: "OUTSIDE_VALIDITY",
    });
    expect(calculateTvoedSueDraftBase({ ...input, month: "2026-04" })).toEqual({
      kind: "unavailable",
      reason: "OUTSIDE_VALIDITY",
    });
    expect(calculateTvoedSueDraftBase({ ...input, month: "2027-04" })).toEqual({
      kind: "unavailable",
      reason: "OUTSIDE_VALIDITY",
    });
  });

  it("rounds a confirmed 19.5-hour half-time base without a second deduction", () => {
    expect(
      calculateTvoedSueDraftBase({
        ...input,
        groupId: "s2",
        stepId: "s1",
        contractedWeeklyMinutes: 1170,
      }),
    ).toMatchObject({ fullTimeTableCents: 290836, personalTableBaseCents: 145418 });
  });

  it.each([
    ["tariffApplicabilityConfirmed", "TARIFF_APPLICABILITY_UNCONFIRMED"],
    ["sueClassificationConfirmed", "SUE_CLASSIFICATION_UNCONFIRMED"],
    ["standardFullTimeConfirmed", "STANDARD_FULL_TIME_UNCONFIRMED"],
    ["fullMonthBaseEntitlementConfirmed", "MONTH_ENTITLEMENT_UNCONFIRMED"],
    ["fullMonthSameContractConfirmed", "MONTH_ENTITLEMENT_UNCONFIRMED"],
  ] as const)("requires confirmed %s", (flag, reason) => {
    expect(calculateTvoedSueDraftBase({ ...input, [flag]: false })).toEqual({
      kind: "unavailable",
      reason,
    });
  });

  it.each(["2026-5", "2026-13", "not-a-month"])("rejects malformed month %s", (month) => {
    expect(calculateTvoedSueDraftBase({ ...input, month })).toEqual({
      kind: "unavailable",
      reason: "INVALID_MONTH",
    });
  });

  it.each([0, -1, 2341, 1.5, Number.NaN])("rejects invalid weekly minutes %s", (minutes) => {
    expect(calculateTvoedSueDraftBase({ ...input, contractedWeeklyMinutes: minutes })).toEqual({
      kind: "unavailable",
      reason: "INVALID_WEEKLY_TIME",
    });
  });

  it("does not invent a vacant group or stage", () => {
    expect(calculateTvoedSueDraftBase({ ...input, groupId: "s10" })).toEqual({
      kind: "unavailable",
      reason: "MISSING_TABLE_VALUE",
    });
    expect(calculateTvoedSueDraftBase({ ...input, stepId: "s7" })).toEqual({
      kind: "unavailable",
      reason: "MISSING_TABLE_VALUE",
    });
  });

  it("rejects an invalid table cell rather than returning a plausible salary", () => {
    const tampered = structuredClone(current);
    tampered.rules.payTables[0].entries[0].monthlyCents = 0;
    expect(calculateTvoedSueDraftBase({ ...input, pkg: tampered })).toEqual({
      kind: "unavailable",
      reason: "INVALID_PACKAGE",
    });
  });
});
