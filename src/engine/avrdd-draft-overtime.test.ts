import { describe, expect, it } from "vitest";
import oldCandidate from "../../rules/packages/reviewed/avr-dd-anlage-1/2025-03-01-draft1.json";
import currentCandidate from "../../rules/packages/reviewed/avr-dd-anlage-1/2026-09-01-draft1.json";
import type { RuleTariffPackage } from "@/rules/contracts.generated";
import { calculateAvrddDraftOvertime, type AvrddDraftOvertimeInput } from "./avrdd-draft-overtime";

const old = oldCandidate as RuleTariffPackage;
const current = currentCandidate as RuleTariffPackage;

function input(changes: Partial<AvrddDraftOvertimeInput> = {}): AvrddDraftOvertimeInput {
  return {
    pkg: current,
    workMonth: "2026-09",
    variantId: "ANLAGE_1",
    regionId: "AVR_DD",
    groupId: "eg10",
    avrddApplicabilityConfirmed: true,
    contractTimeMode: "STANDARD_39",
    contractedWeeklyMinutes: 2340,
    partTimePlusHoursAgreementConfirmed: null,
    monthlyAccountComplete: true,
    monthlyPlusMinutes: 1860,
    confirmedOvertimeMinutes: 60,
    classification: "ORDERED_OR_APPROVED_CONFIRMED",
    monthlyEntgelt14Cents: 553_654,
    monthlyFixedAllowancesCents: 0,
    completeUniformPersonalBasisConfirmed: true,
    basisExcludesOvertimeConfirmed: true,
    premiumArrangement: "NONE_CONFIRMED",
    workSettlement: "CASH_CONFIRMED",
    premiumSettlement: "CASH_CONFIRMED",
    ...changes,
  };
}

describe("AVR.DD § 9c/§ 20a DRAFT confirmed overtime", () => {
  it("uses personal § 9b(8) hourly pay plus the printed § 20a supplement, never Anlage 8 total", () => {
    const result = calculateAvrddDraftOvertime(input());
    expect(result).toMatchObject({
      kind: "draft-confirmed-cash-overtime",
      status: "estimated",
      completeGross: false,
      payoutMonth: null,
      thresholdNumerator: 4_212_000,
      thresholdDenominator: 2340,
      personalHourlyBasisCents: 3265,
      cashClaimCents: 3774,
      positions: [
        { component: "WORK_HOURS", minutes: 60, rateCentsPerHour: 3265, amountCents: 3265 },
        {
          component: "OVERTIME_PREMIUM",
          minutes: 60,
          rateCentsPerHour: 509,
          amountCents: 509,
        },
      ],
    });
    expect(current.rules.avrddHourlyRates?.[9].anlage8OvertimeTotalCents).toBe(3905);
    if (result.kind !== "draft-confirmed-cash-overtime") throw new Error(result.reason);
    expect(result.cashClaimCents).not.toBe(
      current.rules.avrddHourlyRates![9].anlage8OvertimeTotalCents,
    );
    expect(result.sourceIds).toContain("arkdd-avrdd-2026-01");
    expect(result.sourceIds).toContain("arkdd-rundschreiben-2025-07");
  });

  it("requires a confirmed part-time agreement and uses a proportional monthly threshold", () => {
    const halfTime = input({
      contractedWeeklyMinutes: 1170,
      monthlyPlusMinutes: 960,
      monthlyEntgelt14Cents: 276_827,
    });
    expect(calculateAvrddDraftOvertime(halfTime)).toEqual({
      kind: "unavailable",
      reason: "PART_TIME_AGREEMENT_UNCONFIRMED",
    });
    expect(
      calculateAvrddDraftOvertime({ ...halfTime, partTimePlusHoursAgreementConfirmed: true }),
    ).toMatchObject({
      kind: "draft-confirmed-cash-overtime",
      thresholdNumerator: 2_106_000,
      thresholdDenominator: 2340,
      cashClaimCents: 3774,
    });
  });

  it("compares a fractional part-time threshold without prematurely rounding it down", () => {
    const fractional = input({
      contractedWeeklyMinutes: 2000,
      partTimePlusHoursAgreementConfirmed: true,
      monthlyPlusMinutes: 1539,
      confirmedOvertimeMinutes: 1,
    });
    expect(calculateAvrddDraftOvertime(fractional)).toEqual({
      kind: "unavailable",
      reason: "BELOW_MONTHLY_THRESHOLD",
    });
    expect(calculateAvrddDraftOvertime({ ...fractional, monthlyPlusMinutes: 1540 })).toMatchObject({
      kind: "draft-confirmed-cash-overtime",
      confirmedOvertimeMinutes: 1,
    });
  });

  it("does not infer an overtime claim from a shift flag or a monthly surplus alone", () => {
    expect(calculateAvrddDraftOvertime(input({ monthlyAccountComplete: false }))).toEqual({
      kind: "unavailable",
      reason: "MONTH_ACCOUNT_INCOMPLETE",
    });
    expect(calculateAvrddDraftOvertime(input({ classification: "UNKNOWN" }))).toEqual({
      kind: "unavailable",
      reason: "CLASSIFICATION_UNCONFIRMED",
    });
    expect(calculateAvrddDraftOvertime(input({ monthlyPlusMinutes: 1800 }))).toEqual({
      kind: "unavailable",
      reason: "BELOW_MONTHLY_THRESHOLD",
    });
    expect(
      calculateAvrddDraftOvertime(
        input({ monthlyPlusMinutes: 1830, confirmedOvertimeMinutes: 60 }),
      ),
    ).toEqual({ kind: "unavailable", reason: "BELOW_MONTHLY_THRESHOLD" });
  });

  it("requires complete personal amounts, no lump sum and confirmed cash settlement", () => {
    expect(
      calculateAvrddDraftOvertime(input({ completeUniformPersonalBasisConfirmed: false })),
    ).toEqual({ kind: "unavailable", reason: "PERSONAL_BASIS_UNCONFIRMED" });
    expect(calculateAvrddDraftOvertime(input({ basisExcludesOvertimeConfirmed: false }))).toEqual({
      kind: "unavailable",
      reason: "PERSONAL_BASIS_UNCONFIRMED",
    });
    expect(calculateAvrddDraftOvertime(input({ monthlyFixedAllowancesCents: -1 }))).toEqual({
      kind: "unavailable",
      reason: "INVALID_PERSONAL_BASIS",
    });
    expect(calculateAvrddDraftOvertime(input({ premiumArrangement: "UNKNOWN" }))).toEqual({
      kind: "unavailable",
      reason: "LOCAL_AGREEMENT_UNKNOWN",
    });
    expect(calculateAvrddDraftOvertime(input({ premiumArrangement: "LUMP_SUM" }))).toEqual({
      kind: "unavailable",
      reason: "LOCAL_AGREEMENT_UNSUPPORTED",
    });
    expect(calculateAvrddDraftOvertime(input({ premiumSettlement: "TIME_OR_OTHER" }))).toEqual({
      kind: "unavailable",
      reason: "SETTLEMENT_UNSUPPORTED",
    });
  });

  it("keeps older and newer printed supplements separate by version", () => {
    expect(calculateAvrddDraftOvertime(input({ pkg: old, workMonth: "2026-08" }))).toMatchObject({
      kind: "draft-confirmed-cash-overtime",
      positions: [
        { component: "WORK_HOURS", amountCents: 3265 },
        { component: "OVERTIME_PREMIUM", amountCents: 495 },
      ],
      cashClaimCents: 3760,
    });
    expect(calculateAvrddDraftOvertime(input({ pkg: old }))).toEqual({
      kind: "unavailable",
      reason: "OUTSIDE_VALIDITY",
    });
  });

  it("rejects missing policy, unsupported corridor and unknown selection", () => {
    const noPolicy = structuredClone(current);
    delete noPolicy.rules.avrddOvertimePolicy;
    expect(calculateAvrddDraftOvertime(input({ pkg: noPolicy }))).toEqual({
      kind: "unavailable",
      reason: "MISSING_POLICY",
    });
    expect(
      calculateAvrddDraftOvertime(input({ contractTimeMode: "INDIVIDUAL_FULL_TIME_CORRIDOR" })),
    ).toEqual({ kind: "unavailable", reason: "CORRIDOR_SEPARATE_CALCULATION_REQUIRED" });
    expect(calculateAvrddDraftOvertime(input({ variantId: "OTHER" }))).toEqual({
      kind: "unavailable",
      reason: "UNKNOWN_SELECTION",
    });
  });
});
