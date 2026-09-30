import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { RuleTariffPackage } from "@/rules/contracts.generated";
import {
  calculateCaritasCareDraftMonthlyWithOvertime,
  type CaritasCareDraftMonthlyWithOvertimeInput,
  type CaritasConfirmedOvertimeLine,
} from "./caritas-care-draft-monthly-with-overtime";

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

function overtime(
  lineId: string,
  serviceDate: string,
  payableWholeHours: number,
  overrides: Partial<CaritasConfirmedOvertimeLine> = {},
): CaritasConfirmedOvertimeLine {
  return {
    lineId,
    serviceDate,
    payableWholeHours,
    overtimeConfirmed: true,
    baseEntitlement: "CONFIRMED_CASH",
    premiumEntitlement: "CONFIRMED_CASH",
    hoursConfirmed: true,
    monthlyAllocationConfirmed: true,
    ...overrides,
  };
}

function input(
  overrides: Partial<CaritasCareDraftMonthlyWithOvertimeInput> = {},
): CaritasCareDraftMonthlyWithOvertimeInput {
  return {
    pkg: load("bw", "2025-07-01"),
    month: "2025-10",
    variantId: "ANLAGE_32",
    regionId: "BW",
    groupId: "P6",
    stepId: "3",
    weeklyMinutes: 2340,
    fullMonthEmploymentConfirmed: true,
    fullMonthlyBaseEntitlementConfirmed: true,
    fixedAllowanceEntitlement: "CONFIRMED",
    careAllowanceEntitlement: "CONFIRMED",
    confirmedOvertime: [
      overtime("service-02", "2025-10-02", 3),
      overtime("service-03", "2025-10-03", 2),
    ],
    ...overrides,
  };
}

function run(overrides: Partial<CaritasCareDraftMonthlyWithOvertimeInput> = {}) {
  return calculateCaritasCareDraftMonthlyWithOvertime(input(overrides));
}

describe("Caritas DRAFT known monthly components with confirmed cash overtime", () => {
  it("adds printed P6/3 39h overtime to the independently sourced table and care allowances", () => {
    const result = run();
    expect(result).toMatchObject({
      kind: "draft-known-monthly-components-with-overtime",
      completeGross: false,
      month: "2025-10",
      knownOvertimeBaseSubtotalCents: 9645,
      knownOvertimePremiumSubtotalCents: 2895,
      knownOvertimeSubtotalCents: 12540,
      knownSubtotalCents: 357022,
    });
    if (result.kind === "unavailable") throw new Error(result.reason);
    expect(result.positions.map(({ component, amountCents }) => [component, amountCents])).toEqual([
      ["table-base", 327186],
      ["care-allowance-12-3", 3500],
      ["care-allowance-12-4", 13796],
      ["confirmed-overtime-base", 5787],
      ["confirmed-overtime-premium", 1737],
      ["confirmed-overtime-base", 3858],
      ["confirmed-overtime-premium", 1158],
    ]);
    expect(result.excludedComponents).toEqual([
      "SHIFT_ALLOWANCES",
      "TIME_PREMIUMS",
      "OTHER_OVERTIME",
      "ANNUAL_PAYMENT",
      "OTHER_LOCAL_TERMS",
    ]);
    for (const position of result.positions) {
      if (
        position.component !== "confirmed-overtime-base" &&
        position.component !== "confirmed-overtime-premium"
      )
        continue;
      expect(position.sourceIds).toEqual(
        expect.arrayContaining([
          "caritas-bk-2025-02-corrected",
          "caritas-rk-bw-2025",
          "caritas-dgs-west-factsheets-2025",
        ]),
      );
      expect(position.hourlyValues).toMatchObject({
        baseCentsPerHour: 1929,
        premiumCentsPerHour: 579,
        totalCentsPerHour: 2508,
      });
      expect(position.lineId).toMatch(/^service-0[23]$/);
    }
  });

  it("prorates monthly positions only, retaining full overtime cash hourly values for part-time", () => {
    expect(run({ weeklyMinutes: 1170 })).toMatchObject({
      knownSubtotalCents: 184781,
      knownOvertimeSubtotalCents: 12540,
    });
  });

  it("keeps the actual monthly P6 step while capping only overtime base at step 4", () => {
    const result = run({ stepId: "6" });
    expect(result).toMatchObject({
      knownOvertimeBaseSubtotalCents: 10720,
      knownOvertimePremiumSubtotalCents: 2895,
      knownSubtotalCents: 421321,
    });
    if (result.kind === "unavailable") throw new Error(result.reason);
    expect(result.positions[0]).toMatchObject({ component: "table-base", amountCents: 390410 });
  });

  it("binds Bavaria 38.5h and RK Ost dated rates to the monthly selection", () => {
    expect(
      run({
        pkg: load("bayern", "2025-07-01"),
        regionId: "BAYERN",
        variantId: "ANLAGE_31",
        weeklyMinutes: 2310,
        confirmedOvertime: [overtime("by-1", "2025-10-10", 2)],
      }),
    ).toMatchObject({
      knownOvertimeBaseSubtotalCents: 3910,
      knownOvertimePremiumSubtotalCents: 1174,
      knownOvertimeSubtotalCents: 5084,
    });
    expect(
      run({
        pkg: load("ost", "2025-01"),
        regionId: "OST_TARIF_OST",
        fixedAllowanceEntitlement: "NOT_ENTITLED",
        careAllowanceEntitlement: "NOT_ENTITLED",
        confirmedOvertime: [overtime("ost-1", "2025-10-10", 2)],
      }),
    ).toMatchObject({ knownOvertimeSubtotalCents: 4946, knownSubtotalCents: 327456 });
  });

  it("accepts the first and last valid service dates and rejects dates outside or invalid within the month", () => {
    expect(
      run({
        confirmedOvertime: [overtime("first", "2025-10-01", 1), overtime("last", "2025-10-31", 1)],
      }),
    ).toMatchObject({ knownOvertimeSubtotalCents: 5016 });
    for (const serviceDate of ["2025-09-30", "2025-11-01"]) {
      expect(run({ confirmedOvertime: [overtime("wrong-month", serviceDate, 1)] })).toMatchObject({
        kind: "unavailable",
        reason: "OVERTIME_OUTSIDE_MONTH",
        lineId: "wrong-month",
      });
    }
    expect(run({ confirmedOvertime: [overtime("bad-date", "2025-10-32", 1)] })).toMatchObject({
      kind: "unavailable",
      reason: "OUTSIDE_VALIDITY",
      lineId: "bad-date",
    });
  });

  it("rejects duplicate canonical IDs and empty, missing or malformed lines", () => {
    expect(
      run({
        confirmedOvertime: [overtime(" same ", "2025-10-02", 1), overtime("same", "2025-10-03", 1)],
      }),
    ).toMatchObject({ kind: "unavailable", reason: "DUPLICATE_OVERTIME_LINE", lineId: "same" });
    expect(run({ confirmedOvertime: [overtime("   ", "2025-10-02", 1)] })).toMatchObject({
      kind: "unavailable",
      reason: "INVALID_OVERTIME_LINE_ID",
    });
    expect(run({ confirmedOvertime: [] })).toMatchObject({
      kind: "unavailable",
      reason: "NO_CONFIRMED_OVERTIME_LINES",
    });
    for (const lines of [undefined, null, {}, [null], [2]]) {
      const reason = Array.isArray(lines) ? "INVALID_OVERTIME_LINE" : "INVALID_OVERTIME_LINES";
      expect(
        run({ confirmedOvertime: lines as unknown as CaritasConfirmedOvertimeLine[] }),
      ).toMatchObject({ kind: "unavailable", reason });
    }
  });

  it("requires exact monthly allocation confirmation on every line, with no partial subtotal", () => {
    for (const value of [false, null, undefined, "true"]) {
      const result = run({
        confirmedOvertime: [
          overtime("good", "2025-10-02", 1),
          overtime("bad", "2025-10-03", 1, { monthlyAllocationConfirmed: value as boolean }),
        ],
      });
      expect(result).toMatchObject({
        kind: "unavailable",
        reason: "MONTHLY_ALLOCATION_UNCONFIRMED",
        lineId: "bad",
      });
      expect(result).not.toHaveProperty("knownSubtotalCents");
    }
  });

  it("propagates unresolved separate cash claims, classification and hours with the offending line", () => {
    for (const [override, reason] of [
      [{ overtimeConfirmed: false }, "OVERTIME_UNCONFIRMED"],
      [{ baseEntitlement: "UNKNOWN" }, "BASE_ENTITLEMENT_UNCONFIRMED"],
      [{ baseEntitlement: "NOT_ENTITLED" }, "BASE_NOT_ENTITLED"],
      [{ premiumEntitlement: "UNKNOWN" }, "PREMIUM_ENTITLEMENT_UNCONFIRMED"],
      [{ premiumEntitlement: "NOT_ENTITLED" }, "PREMIUM_NOT_ENTITLED"],
      [{ hoursConfirmed: false }, "HOURS_UNCONFIRMED"],
      [{ payableWholeHours: 1.5 }, "INVALID_WHOLE_HOURS"],
    ] as const) {
      const result = run({ confirmedOvertime: [overtime("bad", "2025-10-02", 1, override)] });
      expect(result).toMatchObject({
        kind: "unavailable",
        component: "confirmed-overtime",
        lineId: "bad",
        reason,
      });
      expect(result).not.toHaveProperty("positions");
    }
  });

  it("allows separately reviewed same-day entries but blocks more than 24 payable hours on one work date", () => {
    expect(
      run({
        confirmedOvertime: [overtime("a", "2025-10-02", 10), overtime("b", "2025-10-02", 14)],
      }),
    ).toMatchObject({ knownOvertimeSubtotalCents: 60192 });
    expect(
      run({
        confirmedOvertime: [overtime("a", "2025-10-02", 12), overtime("b", "2025-10-02", 13)],
      }),
    ).toMatchObject({ kind: "unavailable", reason: "DAILY_HOURS_EXCEEDED", lineId: "b" });
  });

  it("retains the underlying monthly and DRAFT gates and does not mutate packages or reviewed lines", () => {
    const candidate = input();
    const snapshot = structuredClone(candidate);
    expect(calculateCaritasCareDraftMonthlyWithOvertime(candidate).kind).toBe(
      "draft-known-monthly-components-with-overtime",
    );
    expect(candidate).toEqual(snapshot);
    expect(run({ fullMonthEmploymentConfirmed: false })).toMatchObject({
      kind: "unavailable",
      reason: "PARTIAL_EMPLOYMENT",
    });
    expect(run({ fixedAllowanceEntitlement: "UNKNOWN" })).toMatchObject({
      kind: "unavailable",
      reason: "ENTITLEMENT_UNCONFIRMED",
    });
    expect(run({ month: "2025-13" })).toMatchObject({
      kind: "unavailable",
      reason: "INVALID_MONTH",
    });
    const published = load("bw", "2025-07-01");
    published.status = "RELEASED" as RuleTariffPackage["status"];
    expect(run({ pkg: published })).toMatchObject({
      kind: "unavailable",
      reason: "INVALID_PACKAGE",
    });
    expect(run({ groupId: "P5" }).kind).toBe("unavailable");
    expect(run({ month: "2026-02" })).toMatchObject({
      kind: "unavailable",
      reason: "OUTSIDE_VALIDITY",
    });
  });
});
