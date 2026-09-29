import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { RuleTariffPackage } from "@/rules/contracts.generated";
import {
  calculateCaritasPersonalHourlyShiftAllowance,
  type CaritasHourlyShiftAllowanceType,
  type CaritasPersonalHourlyShiftInput,
} from "./caritas-care-draft-personal-hourly-shift";

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
  pkg: RuleTariffPackage,
  serviceDate: string,
  variantId: string,
  regionId: string,
  allowanceType: CaritasHourlyShiftAllowanceType,
  overrides: Partial<CaritasPersonalHourlyShiftInput> = {},
): CaritasPersonalHourlyShiftInput {
  return {
    pkg,
    serviceDate,
    variantId,
    regionId,
    allowanceType,
    entitlement: "CONFIRMED_NONPERMANENT",
    payableWholeHours: 8,
    hoursConfirmed: true,
    ...overrides,
  };
}

describe("Caritas DRAFT personal hourly shift allowance", () => {
  it("uses both hourly rates across all West regions, annexes and periods", () => {
    for (const region of ["bw", "bayern", "mitte", "nord", "nrw"] as const) {
      for (const [version, date] of [
        ["2025-07-01", "2025-08-12"],
        ["2026-02-01", "2026-03-12"],
      ] as const) {
        const pkg = load(region, version);
        for (const [variantId, alternatingRate] of [
          ["ANLAGE_31", 149],
          ["ANLAGE_32", 147],
        ] as const) {
          for (const [allowanceType, rateCentsPerHour] of [
            ["ALTERNATING_HOURLY", alternatingRate],
            ["SHIFT_HOURLY", 59],
          ] as const) {
            expect(
              calculateCaritasPersonalHourlyShiftAllowance(
                input(pkg, date, variantId, region.toUpperCase(), allowanceType),
              ),
            ).toMatchObject({
              kind: "personal-hourly-shift-allowance",
              completeGross: false,
              nonPermanentEntitlementConfirmed: true,
              hoursConfirmed: true,
              rateCentsPerHour,
              payableWholeHours: 8,
              personalAmountCents: rateCentsPerHour * 8,
              sourceIds: ["caritas-bk-2025-02-corrected", "caritas-rk-" + region + "-2025"],
            });
          }
        }
      }
    }
  });

  it("uses RK Ost territory sources and keeps the pre-July 2025 gap", () => {
    for (const [version, date] of [
      ["2025-01", "2025-07-12"],
      ["2026-01", "2026-01-12"],
    ] as const) {
      const pkg = load("ost", version);
      for (const regionId of [
        "OST_TARIF_OST",
        "OST_TARIF_WEST_BERLIN",
        "OST_TARIF_WEST_HAMBURG",
      ] as const) {
        expect(
          calculateCaritasPersonalHourlyShiftAllowance(
            input(pkg, date, "ANLAGE_32", regionId, "ALTERNATING_HOURLY"),
          ),
        ).toMatchObject({
          kind: "personal-hourly-shift-allowance",
          rateCentsPerHour: 147,
          personalAmountCents: 1176,
          sourceIds: ["caritas-bk-2025-02-corrected", "caritas-rk-ost-2025-allowances"],
        });
      }
    }
    const first = load("ost", "2025-01");
    expect(
      calculateCaritasPersonalHourlyShiftAllowance(
        input(first, "2025-06-12", "ANLAGE_32", "OST_TARIF_OST", "SHIFT_HOURLY"),
      ),
    ).toEqual({ kind: "unavailable", reason: "MISSING_SHIFT_ALLOWANCE_RATE" });
  });

  it("requires nonpermanent entitlement and externally confirmed full hours", () => {
    const pkg = load("bw", "2025-07-01");
    const base = input(pkg, "2025-08-12", "ANLAGE_31", "BW", "ALTERNATING_HOURLY");
    expect(
      calculateCaritasPersonalHourlyShiftAllowance({ ...base, entitlement: "UNKNOWN" }),
    ).toEqual({ kind: "unavailable", reason: "ENTITLEMENT_UNCONFIRMED" });
    expect(
      calculateCaritasPersonalHourlyShiftAllowance({ ...base, entitlement: "NOT_ENTITLED" }),
    ).toEqual({ kind: "unavailable", reason: "NOT_ENTITLED" });
    expect(
      calculateCaritasPersonalHourlyShiftAllowance({ ...base, hoursConfirmed: false }),
    ).toEqual({ kind: "unavailable", reason: "HOURS_UNCONFIRMED" });
    for (const hours of [0, -1, 1.5, 25, Number.NaN]) {
      expect(
        calculateCaritasPersonalHourlyShiftAllowance({ ...base, payableWholeHours: hours }),
      ).toEqual({ kind: "unavailable", reason: "INVALID_WHOLE_HOURS" });
    }
    expect(
      calculateCaritasPersonalHourlyShiftAllowance({
        ...base,
        allowanceType: "ALTERNATING_MONTHLY" as CaritasHourlyShiftAllowanceType,
      }),
    ).toEqual({ kind: "unavailable", reason: "UNKNOWN_ALLOWANCE_TYPE" });
  });

  it("rejects invalid dates, package limits and tampered rates", () => {
    const pkg = load("bw", "2025-07-01");
    const base = input(pkg, "2025-08-12", "ANLAGE_31", "BW", "SHIFT_HOURLY");
    expect(
      calculateCaritasPersonalHourlyShiftAllowance({ ...base, serviceDate: "2025-02-30" }),
    ).toEqual({ kind: "unavailable", reason: "OUTSIDE_VALIDITY" });
    expect(
      calculateCaritasPersonalHourlyShiftAllowance({ ...base, serviceDate: "2025-06-30" }),
    ).toEqual({ kind: "unavailable", reason: "OUTSIDE_VALIDITY" });
    const tampered = load("bw", "2025-07-01");
    tampered.rules.caritasShiftAllowanceRates![0].shiftHourlyCents = 0;
    expect(calculateCaritasPersonalHourlyShiftAllowance({ ...base, pkg: tampered })).toEqual({
      kind: "unavailable",
      reason: "INVALID_PACKAGE",
    });
  });
});
