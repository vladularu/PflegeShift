import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { RuleTariffPackage } from "@/rules/contracts.generated";
import {
  calculateCaritasCareDraftMonthlyWithTimePremiums,
  type CaritasCareDraftMonthlyWithTimePremiumsInput,
  type CaritasConfirmedTimePremiumLine,
} from "./caritas-care-draft-monthly-with-time-premiums";

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

function premium(
  lineId: string,
  serviceDate: string,
  premiumType: CaritasConfirmedTimePremiumLine["premiumType"],
  payableWholeHours: number,
  overrides: Partial<CaritasConfirmedTimePremiumLine> = {},
): CaritasConfirmedTimePremiumLine {
  return {
    lineId,
    serviceDate,
    premiumType,
    payableWholeHours,
    entitlement: "CONFIRMED_CASH",
    hoursConfirmed: true,
    categoryAndOverlapConfirmed: true,
    ...overrides,
  };
}

function input(
  overrides: Partial<CaritasCareDraftMonthlyWithTimePremiumsInput> = {},
): CaritasCareDraftMonthlyWithTimePremiumsInput {
  return {
    pkg: load("bw", "2025-07-01"),
    month: "2025-10",
    variantId: "ANLAGE_31",
    regionId: "BW",
    groupId: "P6",
    stepId: "1",
    weeklyMinutes: 2340,
    fullMonthEmploymentConfirmed: true,
    fullMonthlyBaseEntitlementConfirmed: true,
    fixedAllowanceEntitlement: "NOT_ENTITLED",
    careAllowanceEntitlement: "NOT_ENTITLED",
    confirmedPremiums: [
      premium("night-02", "2025-10-02", "NIGHT", 8),
      premium("holiday-03", "2025-10-03", "HOLIDAY_WITHOUT_TIME_OFF", 4),
    ],
    ...overrides,
  };
}

describe("Caritas DRAFT monthly subtotal with confirmed time premium lines", () => {
  it("adds two independently sourced October 2025 P6 lines to the monthly base", () => {
    const result = calculateCaritasCareDraftMonthlyWithTimePremiums(input());
    expect(result).toMatchObject({
      kind: "draft-known-monthly-components-with-time-premiums",
      completeGross: false,
      packageId: "avr-caritas-p-bw",
      month: "2025-10",
      knownTimePremiumSubtotalCents: 13504,
      knownSubtotalCents: 306548,
      excludedComponents: [
        "SHIFT_ALLOWANCES",
        "OTHER_TIME_PREMIUMS",
        "OVERTIME",
        "ANNUAL_PAYMENT",
        "OTHER_LOCAL_TERMS",
      ],
      positions: [
        { component: "table-base", amountCents: 293044 },
        {
          component: "confirmed-time-premium",
          lineId: "night-02",
          premiumType: "NIGHT",
          rateCentsPerHour: 386,
          payableWholeHours: 8,
          amountCents: 3088,
          rateSourceIds: ["caritas-dcv-premiums-2025"],
        },
        {
          component: "confirmed-time-premium",
          lineId: "holiday-03",
          premiumType: "HOLIDAY_WITHOUT_TIME_OFF",
          rateCentsPerHour: 2604,
          payableWholeHours: 4,
          amountCents: 10416,
        },
      ],
    });
    if (result.kind === "draft-known-monthly-components-with-time-premiums") {
      for (const position of result.positions) expect(position.sourceIds.length).toBeGreaterThan(0);
      const line = result.positions[1];
      if (line.component !== "confirmed-time-premium") throw new Error("Missing premium line");
      expect(line.tableSourceIds.length).toBeGreaterThan(0);
      expect(line.workingTimeSourceIds.length).toBeGreaterThan(0);
    }
  });

  it("permits separately identified services on one date and rejects duplicate identities", () => {
    const separate = calculateCaritasCareDraftMonthlyWithTimePremiums(
      input({
        confirmedPremiums: [
          premium("shift-a", "2025-10-03", "NIGHT", 2),
          premium("shift-b", "2025-10-03", "NIGHT", 3),
        ],
      }),
    );
    expect(separate).toMatchObject({
      kind: "draft-known-monthly-components-with-time-premiums",
      knownTimePremiumSubtotalCents: 1930,
    });
    expect(
      calculateCaritasCareDraftMonthlyWithTimePremiums(
        input({
          confirmedPremiums: [
            premium("same", "2025-10-02", "NIGHT", 2),
            premium("same", "2025-10-03", "NIGHT", 3),
          ],
        }),
      ),
    ).toEqual({
      kind: "unavailable",
      reason: "DUPLICATE_PREMIUM_LINE",
      component: "confirmed-time-premium",
      lineId: "same",
    });
  });

  it("rejects empty, unidentified and out-of-month premium ledgers", () => {
    expect(
      calculateCaritasCareDraftMonthlyWithTimePremiums(input({ confirmedPremiums: [] })),
    ).toEqual({
      kind: "unavailable",
      reason: "NO_CONFIRMED_PREMIUM_LINES",
      component: "confirmed-time-premium",
    });
    expect(
      calculateCaritasCareDraftMonthlyWithTimePremiums(
        input({ confirmedPremiums: [premium(" ", "2025-10-02", "NIGHT", 2)] }),
      ),
    ).toEqual({
      kind: "unavailable",
      reason: "INVALID_PREMIUM_LINE_ID",
      component: "confirmed-time-premium",
    });
    expect(
      calculateCaritasCareDraftMonthlyWithTimePremiums(
        input({ confirmedPremiums: [premium("late", "2025-11-02", "NIGHT", 2)] }),
      ),
    ).toEqual({
      kind: "unavailable",
      reason: "PREMIUM_OUTSIDE_MONTH",
      component: "confirmed-time-premium",
      lineId: "late",
    });
  });

  it("preserves unresolved line and base reasons without a subtotal", () => {
    expect(
      calculateCaritasCareDraftMonthlyWithTimePremiums(
        input({
          confirmedPremiums: [
            premium("unresolved", "2025-10-02", "NIGHT", 8, {
              categoryAndOverlapConfirmed: false,
            }),
          ],
        }),
      ),
    ).toEqual({
      kind: "unavailable",
      reason: "CATEGORY_OR_OVERLAP_UNCONFIRMED",
      component: "confirmed-time-premium",
      lineId: "unresolved",
    });
    expect(
      calculateCaritasCareDraftMonthlyWithTimePremiums(
        input({ fullMonthEmploymentConfirmed: false }),
      ),
    ).toEqual({ kind: "unavailable", reason: "PARTIAL_EMPLOYMENT" });
    expect(
      calculateCaritasCareDraftMonthlyWithTimePremiums(
        input({ confirmedPremiums: [premium("bad-date", "2025-10-32", "NIGHT", 8)] }),
      ),
    ).toEqual({
      kind: "unavailable",
      reason: "OUTSIDE_VALIDITY",
      component: "confirmed-time-premium",
      lineId: "bad-date",
    });
  });
});
