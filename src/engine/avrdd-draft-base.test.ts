import { describe, expect, it } from "vitest";
import oldCandidate from "../../rules/packages/reviewed/avr-dd-anlage-1/2025-03-01-draft1.json";
import currentCandidate from "../../rules/packages/reviewed/avr-dd-anlage-1/2026-09-01-draft1.json";
import type { RuleTariffPackage } from "@/rules/contracts.generated";
import { calculateAvrddDraftTableBase, type AvrddDraftBaseInput } from "./avrdd-draft-base";

const old = oldCandidate as RuleTariffPackage;
const current = currentCandidate as RuleTariffPackage;

function input(overrides: Partial<AvrddDraftBaseInput> = {}): AvrddDraftBaseInput {
  return {
    pkg: current,
    date: "2026-09-01",
    groupId: "eg1",
    stepId: "base",
    contractedWeeklyMinutes: 2340,
    contractTimeMode: "STANDARD_39",
    avrddApplicabilityConfirmed: true,
    fullMonthBaseEntitlementConfirmed: true,
    ...overrides,
  };
}

describe("AVR.DD draft personal table base", () => {
  it("uses the dated full-time table value without claiming total gross", () => {
    expect(calculateAvrddDraftTableBase(input())).toMatchObject({
      kind: "draft-personal-table-base",
      completeGross: false,
      fullTimeTableCents: 250_119,
      personalTableBaseCents: 250_119,
      standardFullTimeWeeklyMinutes: 2340,
      excludedComponents: [
        "TIME_PREMIUMS",
        "ALLOWANCES",
        "OVERTIME",
        "ANNUAL_PAYMENT",
        "OTHER_LOCAL_TERMS",
      ],
    });
  });

  it("prorates standard part-time exactly once with HALF_UP at half a cent", () => {
    expect(
      calculateAvrddDraftTableBase(
        input({
          pkg: old,
          date: "2026-08-31",
          contractedWeeklyMinutes: 1170,
        }),
      ),
    ).toMatchObject({
      kind: "draft-personal-table-base",
      fullTimeTableCents: 237_405,
      personalTableBaseCents: 118_703,
    });
  });

  it("switches to the September 2026 table only on its effective day", () => {
    expect(calculateAvrddDraftTableBase(input({ pkg: old, date: "2026-08-31" }))).toMatchObject({
      kind: "draft-personal-table-base",
      personalTableBaseCents: 237_405,
    });
    expect(calculateAvrddDraftTableBase(input({ pkg: old }))).toEqual({
      kind: "unavailable",
      reason: "OUTSIDE_VALIDITY",
    });
    expect(calculateAvrddDraftTableBase(input({ pkg: current, date: "2026-08-31" }))).toEqual({
      kind: "unavailable",
      reason: "OUTSIDE_VALIDITY",
    });
  });

  it("never invents stages absent from the EG-specific table", () => {
    expect(calculateAvrddDraftTableBase(input({ stepId: "entry" }))).toEqual({
      kind: "unavailable",
      reason: "MISSING_TABLE_VALUE",
    });
    expect(calculateAvrddDraftTableBase(input({ groupId: "eg3", stepId: "exp3" }))).toEqual({
      kind: "unavailable",
      reason: "MISSING_TABLE_VALUE",
    });
  });

  it.each([
    [{ avrddApplicabilityConfirmed: false }, "AVRDD_APPLICABILITY_UNCONFIRMED"],
    [{ fullMonthBaseEntitlementConfirmed: false }, "FULL_MONTH_ENTITLEMENT_UNCONFIRMED"],
    [{ contractTimeMode: "UNKNOWN" }, "CONTRACT_TIME_UNKNOWN"],
    [
      { contractTimeMode: "INDIVIDUAL_FULL_TIME_CORRIDOR", contractedWeeklyMinutes: 2520 },
      "CORRIDOR_SEPARATE_CALCULATION_REQUIRED",
    ],
    [{ contractedWeeklyMinutes: 2400 }, "INVALID_WEEKLY_TIME"],
    [{ contractedWeeklyMinutes: 0 }, "INVALID_WEEKLY_TIME"],
    [{ date: "2026-02-30" }, "INVALID_DATE"],
  ] as const)("fails closed for %j", (change, reason) => {
    expect(calculateAvrddDraftTableBase(input(change))).toEqual({ kind: "unavailable", reason });
  });

  it("rejects a mutated/unreviewed rule package and carries both dated sources", () => {
    const invalid = structuredClone(current);
    invalid.rules.payTables[0].entries[0].monthlyCents = 0;
    expect(calculateAvrddDraftTableBase(input({ pkg: invalid as RuleTariffPackage }))).toEqual({
      kind: "unavailable",
      reason: "INVALID_PACKAGE",
    });
    const result = calculateAvrddDraftTableBase(input());
    expect(result.kind).toBe("draft-personal-table-base");
    if (result.kind === "draft-personal-table-base")
      expect(result.sourceIds).toEqual(["arkdd-rundschreiben-2025-07", "arkdd-avrdd-2026-01"]);
  });
});
