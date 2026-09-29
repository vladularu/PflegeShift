import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { RuleTariffPackage } from "@/rules/contracts.generated";
import {
  calculateCaritasCareDraftMonthlyComponentsWithShift,
  type CaritasCareDraftMonthlyWithShiftInput,
} from "./caritas-care-draft-monthly-components-with-shift";

function load(region: string, version: string): RuleTariffPackage {
  return JSON.parse(
    readFileSync(
      new URL(
        `../../rules/packages/reviewed/avr-caritas-p-${region}/${version}-draft1.json`,
        import.meta.url,
      ),
      "utf8",
    ),
  ) as RuleTariffPackage;
}

function input(
  pkg = load("bw", "2026-02-01"),
  overrides: Partial<CaritasCareDraftMonthlyWithShiftInput> = {},
): CaritasCareDraftMonthlyWithShiftInput {
  return {
    pkg,
    month: "2026-02",
    variantId: "ANLAGE_31",
    regionId: "BW",
    groupId: "P6",
    stepId: "1",
    weeklyMinutes: 2340,
    fullMonthEmploymentConfirmed: true,
    fullMonthlyBaseEntitlementConfirmed: true,
    fixedAllowanceEntitlement: "CONFIRMED",
    careAllowanceEntitlement: "CONFIRMED",
    shiftAllowanceType: "ALTERNATING_MONTHLY",
    shiftEntitlement: "CONFIRMED_FULL_MONTH",
    fullMonthWeeklyTimeConfirmed: true,
    ...overrides,
  };
}

describe("Caritas DRAFT known monthly components with shift", () => {
  it("keeps all four sourced positions and marks the subtotal incomplete", () => {
    const result = calculateCaritasCareDraftMonthlyComponentsWithShift(input());
    expect(result).toMatchObject({
      kind: "draft-known-monthly-components-with-shift",
      completeGross: false,
      knownSubtotalCents: 343931,
      packageId: "avr-caritas-p-bw",
      month: "2026-02",
      excludedComponents: [
        "OTHER_SHIFT_ALLOWANCES",
        "TIME_PREMIUMS",
        "OVERTIME",
        "ANNUAL_PAYMENT",
        "OTHER_LOCAL_TERMS",
      ],
      positions: [
        { component: "table-base", amountCents: 301249 },
        { component: "care-allowance-12-3", amountCents: 3500 },
        { component: "care-allowance-12-4", amountCents: 14182 },
        {
          component: "monthly-shift-allowance",
          allowanceType: "ALTERNATING_MONTHLY",
          amountCents: 25000,
        },
      ],
    });
    if (result.kind === "draft-known-monthly-components-with-shift") {
      expect(result.positions).toHaveLength(4);
      for (const position of result.positions) expect(position.sourceIds.length).toBeGreaterThan(0);
      const shift = result.positions[3];
      if (shift.component !== "monthly-shift-allowance") throw new Error("Missing shift position");
      expect(shift.rateSourceIds.length).toBeGreaterThan(0);
      expect(shift.workingTimeSourceIds.length).toBeGreaterThan(0);
    }
  });

  it("adds either confirmed monthly type after personal half-time rounding", () => {
    expect(
      calculateCaritasCareDraftMonthlyComponentsWithShift(
        input(undefined, { weeklyMinutes: 1170 }),
      ),
    ).toMatchObject({
      kind: "draft-known-monthly-components-with-shift",
      knownSubtotalCents: 171966,
      positions: [
        { amountCents: 150625 },
        { amountCents: 1750 },
        { amountCents: 7091 },
        { amountCents: 12500 },
      ],
    });
    expect(
      calculateCaritasCareDraftMonthlyComponentsWithShift(
        input(undefined, { weeklyMinutes: 1170, shiftAllowanceType: "SHIFT_MONTHLY" }),
      ),
    ).toMatchObject({
      kind: "draft-known-monthly-components-with-shift",
      knownSubtotalCents: 164466,
      positions: [
        {},
        {},
        {},
        { component: "monthly-shift-allowance", allowanceType: "SHIFT_MONTHLY", amountCents: 5000 },
      ],
    });
  });

  it("uses Ost Berlin's July 2025 weekly-time basis for the separate shift position", () => {
    const pkg = load("ost", "2025-01");
    expect(
      calculateCaritasCareDraftMonthlyComponentsWithShift(
        input(pkg, {
          month: "2025-07",
          variantId: "ANLAGE_31",
          regionId: "OST_TARIF_WEST_BERLIN",
          weeklyMinutes: 1800,
        }),
      ),
    ).toMatchObject({
      kind: "draft-known-monthly-components-with-shift",
      knownSubtotalCents: 257448,
      positions: [
        { component: "table-base", amountCents: 225269 },
        { component: "care-allowance-12-3", amountCents: 1948 },
        { component: "care-allowance-12-4", amountCents: 10750 },
        { component: "monthly-shift-allowance", amountCents: 19481 },
      ],
    });
  });

  it("requires confirmed full-month shift eligibility and stable weekly time", () => {
    expect(
      calculateCaritasCareDraftMonthlyComponentsWithShift(
        input(undefined, { shiftEntitlement: "UNKNOWN" }),
      ),
    ).toEqual({
      kind: "unavailable",
      reason: "ENTITLEMENT_UNCONFIRMED",
      component: "monthly-shift-allowance",
    });
    expect(
      calculateCaritasCareDraftMonthlyComponentsWithShift(
        input(undefined, { shiftEntitlement: "NOT_ENTITLED" }),
      ),
    ).toEqual({
      kind: "unavailable",
      reason: "NOT_ENTITLED",
      component: "monthly-shift-allowance",
    });
    expect(
      calculateCaritasCareDraftMonthlyComponentsWithShift(
        input(undefined, { fullMonthWeeklyTimeConfirmed: false }),
      ),
    ).toEqual({
      kind: "unavailable",
      reason: "WEEKLY_TIME_UNCONFIRMED",
      component: "monthly-shift-allowance",
    });
    expect(
      calculateCaritasCareDraftMonthlyComponentsWithShift(
        input(undefined, { fullMonthEmploymentConfirmed: false }),
      ),
    ).toEqual({ kind: "unavailable", reason: "PARTIAL_EMPLOYMENT" });
  });

  it("keeps the pre-July Ost shift gap and package tampering unavailable", () => {
    const pkg = load("ost", "2025-01");
    expect(
      calculateCaritasCareDraftMonthlyComponentsWithShift(
        input(pkg, {
          month: "2025-06",
          variantId: "ANLAGE_31",
          regionId: "OST_TARIF_WEST_BERLIN",
          weeklyMinutes: 1800,
          careAllowanceEntitlement: "NOT_ENTITLED",
        }),
      ),
    ).toEqual({
      kind: "unavailable",
      reason: "MISSING_SHIFT_ALLOWANCE_RATE",
      component: "monthly-shift-allowance",
    });
    const tampered = load("bw", "2026-02-01");
    tampered.rules.caritasShiftAllowanceRates![0].alternatingMonthlyCents = 0;
    expect(calculateCaritasCareDraftMonthlyComponentsWithShift(input(tampered))).toEqual({
      kind: "unavailable",
      reason: "INVALID_PACKAGE",
    });
  });
});
