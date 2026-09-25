import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { RuleTariffPackage } from "@/rules/contracts.generated";
import {
  calculateCaritasCareDraftMonthlyComponents,
  type CaritasCareDraftMonthlyComponentsInput,
} from "./caritas-care-draft-monthly-components";

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
  overrides: Partial<CaritasCareDraftMonthlyComponentsInput> = {},
): CaritasCareDraftMonthlyComponentsInput {
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
    ...overrides,
  };
}

describe("Caritas DRAFT known monthly components", () => {
  it("lists three sourced components without claiming complete gross pay", () => {
    const result = calculateCaritasCareDraftMonthlyComponents(input());
    expect(result).toMatchObject({
      kind: "draft-known-monthly-components",
      completeGross: false,
      knownSubtotalCents: 318931,
      packageId: "avr-caritas-p-bw",
      month: "2026-02",
      excludedComponents: [
        "SHIFT_ALLOWANCES",
        "TIME_PREMIUMS",
        "OVERTIME",
        "ANNUAL_PAYMENT",
        "OTHER_LOCAL_TERMS",
      ],
      positions: [
        { component: "table-base", amountCents: 301249 },
        { component: "care-allowance-12-3", amountCents: 3500 },
        { component: "care-allowance-12-4", amountCents: 14182 },
      ],
    });
    if (result.kind === "draft-known-monthly-components")
      for (const position of result.positions) expect(position.sourceIds.length).toBeGreaterThan(0);
  });

  it("uses the personal half-time values of all three components", () => {
    expect(
      calculateCaritasCareDraftMonthlyComponents(input(undefined, { weeklyMinutes: 1170 })),
    ).toMatchObject({
      kind: "draft-known-monthly-components",
      completeGross: false,
      knownSubtotalCents: 159466,
      positions: [{ amountCents: 150625 }, { amountCents: 1750 }, { amountCents: 7091 }],
    });
  });

  it("uses the 2025 Ost Berlin weekly-time change in a full July month", () => {
    const pkg = load("ost", "2025-01");
    expect(
      calculateCaritasCareDraftMonthlyComponents(
        input(pkg, {
          month: "2025-07",
          variantId: "ANLAGE_31",
          regionId: "OST_TARIF_WEST_BERLIN",
          weeklyMinutes: 1800,
        }),
      ),
    ).toMatchObject({
      kind: "draft-known-monthly-components",
      completeGross: false,
      knownSubtotalCents: 237967,
      positions: [
        { component: "table-base", amountCents: 225269 },
        { component: "care-allowance-12-3", amountCents: 1948 },
        { component: "care-allowance-12-4", amountCents: 10750 },
      ],
    });
  });

  it("keeps RK Ost's June 2025 unproven § 12(4) amount unavailable", () => {
    const pkg = load("ost", "2025-01");
    const june = input(pkg, {
      month: "2025-06",
      variantId: "ANLAGE_31",
      regionId: "OST_TARIF_WEST_BERLIN",
      weeklyMinutes: 1800,
    });
    expect(calculateCaritasCareDraftMonthlyComponents(june)).toEqual({
      kind: "unavailable",
      reason: "MISSING_CARE_ALLOWANCE_RATE",
      component: "care-allowance-12-4",
    });
    expect(
      calculateCaritasCareDraftMonthlyComponents({
        ...june,
        careAllowanceEntitlement: "NOT_ENTITLED",
      }),
    ).toMatchObject({
      kind: "draft-known-monthly-components",
      knownSubtotalCents: 224304,
      positions: [
        { component: "table-base", amountCents: 222381 },
        { component: "care-allowance-12-3", amountCents: 1923 },
      ],
    });
  });

  it("requires full-month employment, base entitlement and separate allowance decisions", () => {
    expect(
      calculateCaritasCareDraftMonthlyComponents(
        input(undefined, { fullMonthEmploymentConfirmed: false }),
      ),
    ).toEqual({ kind: "unavailable", reason: "PARTIAL_EMPLOYMENT" });
    expect(
      calculateCaritasCareDraftMonthlyComponents(
        input(undefined, { fullMonthlyBaseEntitlementConfirmed: false }),
      ),
    ).toEqual({ kind: "unavailable", reason: "BASE_ENTITLEMENT_UNCONFIRMED" });
    expect(
      calculateCaritasCareDraftMonthlyComponents(
        input(undefined, { fixedAllowanceEntitlement: "UNKNOWN" }),
      ),
    ).toEqual({ kind: "unavailable", reason: "ENTITLEMENT_UNCONFIRMED" });
    expect(
      calculateCaritasCareDraftMonthlyComponents(
        input(undefined, { careAllowanceEntitlement: "UNKNOWN" }),
      ),
    ).toEqual({ kind: "unavailable", reason: "ENTITLEMENT_UNCONFIRMED" });
    expect(
      calculateCaritasCareDraftMonthlyComponents(
        input(undefined, {
          fixedAllowanceEntitlement: "NOT_ENTITLED",
          careAllowanceEntitlement: "NOT_ENTITLED",
        }),
      ),
    ).toMatchObject({
      kind: "draft-known-monthly-components",
      knownSubtotalCents: 301249,
      positions: [{ component: "table-base", amountCents: 301249 }],
    });
  });

  it("rejects invalid or out-of-package months and missing table stages", () => {
    expect(
      calculateCaritasCareDraftMonthlyComponents(input(undefined, { month: "2026-13" })),
    ).toEqual({
      kind: "unavailable",
      reason: "INVALID_MONTH",
    });
    expect(
      calculateCaritasCareDraftMonthlyComponents(input(undefined, { month: "2026-01" })),
    ).toEqual({
      kind: "unavailable",
      reason: "OUTSIDE_VALIDITY",
    });
    expect(
      calculateCaritasCareDraftMonthlyComponents(input(undefined, { groupId: "P5", stepId: "1" })),
    ).toEqual({ kind: "unavailable", reason: "MISSING_TABLE_VALUE", component: "table-base" });
    expect(
      calculateCaritasCareDraftMonthlyComponents(input(undefined, { weeklyMinutes: 2341 })),
    ).toEqual({ kind: "unavailable", reason: "INVALID_WEEKLY_TIME", component: "table-base" });
  });

  it("does not calculate from a tampered rate", () => {
    const pkg = load("bw", "2026-02-01");
    pkg.rules.caritasCareAllowanceRates![0].monthlyCents = 0;
    expect(calculateCaritasCareDraftMonthlyComponents(input(pkg))).toEqual({
      kind: "unavailable",
      reason: "INVALID_PACKAGE",
    });
  });
});
