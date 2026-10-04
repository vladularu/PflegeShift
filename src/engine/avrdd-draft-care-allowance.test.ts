import { describe, expect, it } from "vitest";
import oldCandidate from "../../rules/packages/reviewed/avr-dd-anlage-1/2025-03-01-draft1.json";
import currentCandidate from "../../rules/packages/reviewed/avr-dd-anlage-1/2026-09-01-draft1.json";
import type { RuleTariffPackage } from "@/rules/contracts.generated";
import {
  calculateAvrddDraftCareAllowance,
  type AvrddDraftCareAllowanceInput,
} from "./avrdd-draft-care-allowance";

function input(
  overrides: Partial<AvrddDraftCareAllowanceInput> = {},
): AvrddDraftCareAllowanceInput {
  return {
    pkg: oldCandidate as RuleTariffPackage,
    workMonth: "2026-06",
    variantId: "ANLAGE_1",
    regionId: "AVR_DD",
    groupId: "eg3",
    avrddApplicabilityConfirmed: true,
    contractTimeMode: "STANDARD_39",
    contractedWeeklyMinutes: 2340,
    careAndSupportWorkConfirmed: true,
    relevantEmploymentStartDate: "2012-09-30",
    recognizedEmploymentMonthsAtMonthStart: null,
    fullMonthEntitlementConfirmed: true,
    ...overrides,
  };
}

describe("AVR.DD candidate § 14(2)(c) care/support allowance", () => {
  it.each([
    [oldCandidate, "2026-06", 8000],
    [oldCandidate, "2026-07", 10000],
    [oldCandidate, "2026-08", 10000],
    [currentCandidate, "2026-09", 10000],
  ] as const)("uses sourced monthly value for %s in %s", (pkg, workMonth, amountCents) => {
    expect(
      calculateAvrddDraftCareAllowance(input({ pkg: pkg as RuleTariffPackage, workMonth })),
    ).toMatchObject({
      kind: "draft-confirmed-care-allowance",
      amountCents,
      completeGross: false,
    });
  });

  it("accepts a confirmed later hire at 96 recognized months, not 95", () => {
    const facts = { relevantEmploymentStartDate: "2015-01-01", workMonth: "2025-03" };
    expect(
      calculateAvrddDraftCareAllowance(
        input({ ...facts, recognizedEmploymentMonthsAtMonthStart: 95 }),
      ),
    ).toEqual({ kind: "unavailable", reason: "SERVICE_THRESHOLD_NOT_MET" });
    expect(
      calculateAvrddDraftCareAllowance(
        input({ ...facts, recognizedEmploymentMonthsAtMonthStart: 96 }),
      ),
    ).toMatchObject({ kind: "draft-confirmed-care-allowance", amountCents: 8000 });
  });

  it("pro-rates a confirmed half-time EG 4 amount", () => {
    expect(
      calculateAvrddDraftCareAllowance(
        input({ workMonth: "2026-07", groupId: "eg4", contractedWeeklyMinutes: 1170 }),
      ),
    ).toMatchObject({ kind: "draft-confirmed-care-allowance", amountCents: 5000 });
  });

  it.each([
    [{ groupId: "eg5" }, "GROUP_NOT_ELIGIBLE"],
    [{ careAndSupportWorkConfirmed: null }, "CARE_WORK_UNCONFIRMED"],
    [{ careAndSupportWorkConfirmed: false }, "CARE_WORK_NOT_CONFIRMED"],
    [{ relevantEmploymentStartDate: null }, "EMPLOYMENT_START_UNKNOWN"],
    [{ relevantEmploymentStartDate: "2026-07-31" }, "INVALID_EMPLOYMENT_START"],
    [
      { relevantEmploymentStartDate: "2015-01-01", recognizedEmploymentMonthsAtMonthStart: null },
      "RECOGNIZED_SERVICE_UNKNOWN",
    ],
    [{ fullMonthEntitlementConfirmed: false }, "PARTIAL_MONTH_UNSUPPORTED"],
    [
      { contractTimeMode: "INDIVIDUAL_FULL_TIME_CORRIDOR" },
      "CORRIDOR_SEPARATE_CALCULATION_REQUIRED",
    ],
    [{ workMonth: "2026-09" }, "OUTSIDE_VALIDITY"],
  ] as const)("fails closed for %s", (overrides, reason) => {
    expect(calculateAvrddDraftCareAllowance(input(overrides))).toEqual({
      kind: "unavailable",
      reason,
    });
  });
});
