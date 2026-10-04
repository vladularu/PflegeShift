import { describe, expect, it } from "vitest";
import oldCandidate from "../../rules/packages/reviewed/avr-dd-anlage-1/2025-03-01-draft1.json";
import currentCandidate from "../../rules/packages/reviewed/avr-dd-anlage-1/2026-09-01-draft1.json";
import type { RuleTariffPackage } from "@/rules/contracts.generated";
import {
  calculateAvrddDraftAdvancedAllowances,
  type AvrddDraftAdvancedAllowancesInput,
} from "./avrdd-draft-advanced-allowances";

const no = { status: "INELIGIBLE_CONFIRMED", priorIndividualMonthlyCents: null } as const;
const yes = { status: "ELIGIBLE_CONFIRMED", priorIndividualMonthlyCents: 0 } as const;

function input(
  overrides: Partial<AvrddDraftAdvancedAllowancesInput> = {},
): AvrddDraftAdvancedAllowancesInput {
  return {
    pkg: oldCandidate as RuleTariffPackage,
    workMonth: "2026-06",
    variantId: "ANLAGE_1",
    regionId: "AVR_DD",
    groupId: "eg7",
    stepId: "base",
    avrddApplicabilityConfirmed: true,
    contractTimeMode: "STANDARD_39",
    contractedWeeklyMinutes: 2340,
    fullMonthEntitlementConfirmed: true,
    claims: { practice: yes, palliativeOrWound: no, intensive: no, specialist: no },
    specialistContext: "UNKNOWN",
    ...overrides,
  };
}

function positions(overrides: Partial<AvrddDraftAdvancedAllowancesInput> = {}) {
  const result = calculateAvrddDraftAdvancedAllowances(input(overrides));
  expect(result.kind).toBe("draft-confirmed-advanced-allowances");
  if (result.kind !== "draft-confirmed-advanced-allowances") throw new Error(result.reason);
  expect(result.completeGross).toBe(false);
  return result.positions;
}

describe("AVR.DD candidate § 14(2) advanced allowances", () => {
  it("uses the old EG 7/8 half-difference for practice and applies a confirmed offset", () => {
    expect(
      positions({
        claims: {
          practice: { ...yes, priorIndividualMonthlyCents: 1000 },
          palliativeOrWound: no,
          intensive: no,
          specialist: no,
        },
      }),
    ).toMatchObject([
      {
        component: "PRACTICE",
        legalLetter: "e",
        fullTimeMonthlyCents: 19331,
        personalMonthlyCents: 19331,
        tariffTopUpCents: 18331,
      },
    ]);
  });
  it("switches to fixed practice allowance in July within the old salary-table package", () => {
    expect(positions({ workMonth: "2026-07" })).toMatchObject([
      { component: "PRACTICE", legalLetter: "e", fullTimeMonthlyCents: 20000 },
    ]);
    expect(positions({ workMonth: "2026-07", contractedWeeklyMinutes: 1170 })).toMatchObject([
      { personalMonthlyCents: 10000, tariffTopUpCents: 10000 },
    ]);
  });
  it("pays the legacy combined EG 7 activity only once", () => {
    expect(
      positions({
        claims: { practice: yes, palliativeOrWound: yes, intensive: no, specialist: no },
      }),
    ).toMatchObject([
      { component: "LEGACY_EG7_COMBINED", legalLetter: "e", fullTimeMonthlyCents: 19331 },
    ]);
  });
  it("keeps only the higher new e/f allowance before individual offsets", () => {
    expect(
      positions({
        workMonth: "2026-07",
        claims: { practice: yes, palliativeOrWound: yes, intensive: no, specialist: no },
      }),
    ).toMatchObject([{ component: "PRACTICE", legalLetter: "e", fullTimeMonthlyCents: 20000 }]);
    expect(
      positions({
        workMonth: "2026-07",
        stepId: "exp2",
        claims: { practice: yes, palliativeOrWound: yes, intensive: no, specialist: no },
      }),
    ).toMatchObject([
      { component: "PALLIATIVE_OR_WOUND", legalLetter: "f", fullTimeMonthlyCents: 21760 },
    ]);
  });
  it("uses the separately sourced September table for the new palliative half-difference", () => {
    expect(
      positions({
        pkg: currentCandidate as RuleTariffPackage,
        workMonth: "2026-09",
        claims: { practice: no, palliativeOrWound: yes, intensive: no, specialist: no },
      }),
    ).toMatchObject([
      { component: "PALLIATIVE_OR_WOUND", legalLetter: "f", fullTimeMonthlyCents: 19911 },
    ]);
  });
  it("returns intensive and specialist as separate positions without claiming a gross total", () => {
    expect(
      positions({
        workMonth: "2026-07",
        groupId: "eg8",
        claims: { practice: no, palliativeOrWound: no, intensive: yes, specialist: yes },
        specialistContext: "NEW_NON_HOSPICE_SCOPE_CONFIRMED",
      }),
    ).toMatchObject([
      { component: "INTENSIVE", legalLetter: "g", fullTimeMonthlyCents: 15000 },
      { component: "SPECIALIST", legalLetter: "h", fullTimeMonthlyCents: 10000 },
    ]);
  });
  it.each([
    [
      {
        claims: {
          practice: { status: "UNKNOWN", priorIndividualMonthlyCents: null },
          palliativeOrWound: no,
          intensive: no,
          specialist: no,
        },
      },
      "ALLOWANCE_FACTS_UNCONFIRMED",
    ],
    [
      {
        claims: {
          practice: { status: "ELIGIBLE_CONFIRMED", priorIndividualMonthlyCents: null },
          palliativeOrWound: no,
          intensive: no,
          specialist: no,
        },
      },
      "INDIVIDUAL_OFFSET_UNKNOWN",
    ],
    [{ groupId: "eg8" }, "GROUP_NOT_ELIGIBLE"],
    [{ fullMonthEntitlementConfirmed: false }, "FULL_MONTH_ENTITLEMENT_UNCONFIRMED"],
    [
      {
        claims: {
          practice: yes,
          palliativeOrWound: { ...yes, priorIndividualMonthlyCents: 100 },
          intensive: no,
          specialist: no,
        },
      },
      "LEGACY_COMBINATION_AMBIGUOUS",
    ],
    [
      {
        workMonth: "2026-07",
        claims: { practice: no, palliativeOrWound: yes, intensive: no, specialist: yes },
        specialistContext: "HOSPICE_PALLIATIVE_CONFIRMED",
      },
      "HOSPICE_PALLIATIVE_COMBINATION_UNRESOLVED",
    ],
    [
      {
        claims: { practice: no, palliativeOrWound: no, intensive: no, specialist: yes },
        specialistContext: "NEW_NON_HOSPICE_SCOPE_CONFIRMED",
      },
      "SPECIALIST_SCOPE_UNSUPPORTED",
    ],
    [{ workMonth: "2026-09" }, "OUTSIDE_VALIDITY"],
  ] as const)("fails closed for %s", (overrides, reason) => {
    expect(calculateAvrddDraftAdvancedAllowances(input(overrides))).toEqual({
      kind: "unavailable",
      reason,
    });
  });
});
