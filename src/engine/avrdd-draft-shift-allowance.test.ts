import { describe, expect, it } from "vitest";
import oldCandidate from "../../rules/packages/reviewed/avr-dd-anlage-1/2025-03-01-draft1.json";
import currentCandidate from "../../rules/packages/reviewed/avr-dd-anlage-1/2026-09-01-draft1.json";
import type { RuleTariffPackage } from "@/rules/contracts.generated";
import {
  calculateAvrddDraftShiftAllowance,
  type AvrddDraftShiftAllowanceInput,
} from "./avrdd-draft-shift-allowance";

function input(
  overrides: Partial<AvrddDraftShiftAllowanceInput> = {},
): AvrddDraftShiftAllowanceInput {
  return {
    pkg: currentCandidate as RuleTariffPackage,
    workMonth: "2026-09",
    variantId: "ANLAGE_1",
    regionId: "AVR_DD",
    avrddApplicabilityConfirmed: true,
    contractTimeMode: "STANDARD_39",
    contractedWeeklyMinutes: 2340,
    entitlement: "ALTERNATING_CONFIRMED",
    fullMonthEntitlementConfirmed: true,
    readinessExclusion: "ABSENT_CONFIRMED",
    ...overrides,
  };
}

describe("AVR.DD candidate § 20 monthly shift allowance", () => {
  it.each([
    [oldCandidate, "2026-08", 15000, 6000],
    [currentCandidate, "2026-09", 20000, 8000],
    [currentCandidate, "2027-06", 20000, 8000],
    [currentCandidate, "2027-07", 25000, 10000],
  ] as const)("uses the sourced rate for %s in %s", (pkg, workMonth, alternating, shift) => {
    expect(
      calculateAvrddDraftShiftAllowance(input({ pkg: pkg as RuleTariffPackage, workMonth })),
    ).toMatchObject({ kind: "draft-confirmed-shift-allowance", amountCents: alternating });
    expect(
      calculateAvrddDraftShiftAllowance(
        input({ pkg: pkg as RuleTariffPackage, workMonth, entitlement: "SHIFT_CONFIRMED" }),
      ),
    ).toMatchObject({ kind: "draft-confirmed-shift-allowance", amountCents: shift });
  });
  it("pro-rates confirmed part-time allowance without inventing a shift claim", () => {
    expect(
      calculateAvrddDraftShiftAllowance(input({ contractedWeeklyMinutes: 1170 })),
    ).toMatchObject({
      kind: "draft-confirmed-shift-allowance",
      amountCents: 10000,
      status: "estimated",
      completeGross: false,
    });
  });
  it.each([
    [{ entitlement: "UNKNOWN" }, "ENTITLEMENT_UNCONFIRMED"],
    [{ entitlement: "NONE_CONFIRMED" }, "NO_ENTITLEMENT_CONFIRMED"],
    [{ fullMonthEntitlementConfirmed: false }, "PARTIAL_MONTH_UNSUPPORTED"],
    [{ readinessExclusion: "UNKNOWN" }, "READINESS_EXCLUSION_UNKNOWN"],
    [{ readinessExclusion: "PRESENT" }, "READINESS_EXCLUSION_PRESENT"],
    [
      { contractTimeMode: "INDIVIDUAL_FULL_TIME_CORRIDOR" },
      "CORRIDOR_SEPARATE_CALCULATION_REQUIRED",
    ],
    [{ contractedWeeklyMinutes: 2400 }, "INVALID_WEEKLY_TIME"],
    [{ workMonth: "2026-08" }, "OUTSIDE_VALIDITY"],
  ] as const)("fails closed for %s", (overrides, reason) => {
    expect(calculateAvrddDraftShiftAllowance(input(overrides))).toEqual({
      kind: "unavailable",
      reason,
    });
  });
});
