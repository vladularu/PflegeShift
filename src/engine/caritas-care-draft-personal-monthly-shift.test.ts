import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { RuleTariffPackage } from "@/rules/contracts.generated";
import { lookupCaritasFullTimeWeeklyMinutes } from "./caritas-working-time";
import {
  calculateCaritasPersonalMonthlyShiftAllowance,
  type CaritasMonthlyShiftAllowanceType,
  type CaritasPersonalMonthlyShiftInput,
} from "./caritas-care-draft-personal-monthly-shift";

function load(region: string, version: string): RuleTariffPackage {
  return JSON.parse(
    readFileSync(
      new URL(
        "../../rules/packages/reviewed/avr-caritas-p-" + region + "/" + version + "-draft1.json",
        import.meta.url,
      ),
      "utf8",
    ),
  ) as RuleTariffPackage;
}

function request(
  pkg: RuleTariffPackage,
  month: string,
  variantId: string,
  regionId: string,
  weeklyMinutes: number,
  allowanceType: CaritasMonthlyShiftAllowanceType = "ALTERNATING_MONTHLY",
): CaritasPersonalMonthlyShiftInput {
  return {
    pkg,
    month,
    variantId,
    regionId,
    weeklyMinutes,
    allowanceType,
    entitlement: "CONFIRMED_FULL_MONTH",
    fullMonthEmploymentConfirmed: true,
    fullMonthWeeklyTimeConfirmed: true,
  };
}

function fullTimeMinutes(
  pkg: RuleTariffPackage,
  date: string,
  variantId: string,
  regionId: string,
): number {
  const result = lookupCaritasFullTimeWeeklyMinutes(pkg, date, variantId, regionId);
  if (result.kind !== "source-working-time") throw new Error("Missing reference working time");
  return result.fullTimeWeeklyMinutes;
}

describe("Caritas DRAFT personal monthly shift allowance", () => {
  it("prorates both monthly types across West regions, annexes and periods", () => {
    for (const region of ["bw", "bayern", "mitte", "nord", "nrw"] as const) {
      for (const [version, month] of [
        ["2025-07-01", "2025-07"],
        ["2026-02-01", "2026-02"],
      ] as const) {
        const pkg = load(region, version);
        for (const annex of [31, 32] as const) {
          const variant = "ANLAGE_" + annex;
          const territory = region.toUpperCase();
          const fullTime = fullTimeMinutes(pkg, month + "-01", variant, territory);
          for (const [allowanceType, fullCents] of [
            ["ALTERNATING_MONTHLY", 25000],
            ["SHIFT_MONTHLY", 10000],
          ] as const) {
            for (const [weeklyMinutes, expectedCents] of [
              [fullTime, fullCents],
              [fullTime / 2, fullCents / 2],
            ] as const) {
              expect(
                calculateCaritasPersonalMonthlyShiftAllowance(
                  request(pkg, month, variant, territory, weeklyMinutes, allowanceType),
                ),
              ).toMatchObject({
                kind: "personal-monthly-shift-allowance",
                completeGross: false,
                fullMonthEntitlementConfirmed: true,
                fullTimeMonthlyCents: fullCents,
                personalMonthlyCents: expectedCents,
                fullTimeWeeklyMinutes: fullTime,
                rateSourceIds: ["caritas-bk-2025-02-corrected", "caritas-rk-" + region + "-2025"],
                prorationProvision: "AVR_ANLAGE_31_32_12A",
              });
            }
          }
        }
      }
    }
  });

  it("uses Ost territorial working time and keeps the pre-July 2025 gap", () => {
    for (const [version, month] of [
      ["2025-01", "2025-07"],
      ["2026-01", "2026-01"],
    ] as const) {
      const pkg = load("ost", version);
      for (const territory of [
        "OST_TARIF_OST",
        "OST_TARIF_WEST_BERLIN",
        "OST_TARIF_WEST_HAMBURG",
      ] as const) {
        for (const annex of [31, 32] as const) {
          const variant = "ANLAGE_" + annex;
          const fullTime = fullTimeMinutes(pkg, month + "-01", variant, territory);
          expect(
            calculateCaritasPersonalMonthlyShiftAllowance(
              request(pkg, month, variant, territory, fullTime / 2),
            ),
          ).toMatchObject({
            kind: "personal-monthly-shift-allowance",
            personalMonthlyCents: 12500,
            fullTimeWeeklyMinutes: fullTime,
            rateSourceIds: ["caritas-bk-2025-02-corrected", "caritas-rk-ost-2025-allowances"],
          });
        }
      }
    }
    const first = load("ost", "2025-01");
    expect(
      calculateCaritasPersonalMonthlyShiftAllowance(
        request(first, "2025-06", "ANLAGE_31", "OST_TARIF_OST", 2310),
      ),
    ).toEqual({ kind: "unavailable", reason: "MISSING_SHIFT_ALLOWANCE_RATE" });
  });

  it("requires externally confirmed full-month entitlement and employment", () => {
    const pkg = load("bw", "2025-07-01");
    const base = request(pkg, "2025-08", "ANLAGE_31", "BW", 2340);
    expect(
      calculateCaritasPersonalMonthlyShiftAllowance({ ...base, entitlement: "UNKNOWN" }),
    ).toEqual({ kind: "unavailable", reason: "ENTITLEMENT_UNCONFIRMED" });
    expect(
      calculateCaritasPersonalMonthlyShiftAllowance({ ...base, entitlement: "NOT_ENTITLED" }),
    ).toEqual({ kind: "unavailable", reason: "NOT_ENTITLED" });
    expect(
      calculateCaritasPersonalMonthlyShiftAllowance({
        ...base,
        fullMonthEmploymentConfirmed: false,
      }),
    ).toEqual({ kind: "unavailable", reason: "PARTIAL_EMPLOYMENT" });
    expect(
      calculateCaritasPersonalMonthlyShiftAllowance({
        ...base,
        fullMonthWeeklyTimeConfirmed: false,
      }),
    ).toEqual({ kind: "unavailable", reason: "WEEKLY_TIME_UNCONFIRMED" });
    expect(
      calculateCaritasPersonalMonthlyShiftAllowance({
        ...base,
        allowanceType: "ALTERNATING_HOURLY" as CaritasMonthlyShiftAllowanceType,
      }),
    ).toEqual({ kind: "unavailable", reason: "UNKNOWN_ALLOWANCE_TYPE" });
  });

  it("rejects invalid months, weekly hours, package boundaries and tampering", () => {
    const pkg = load("bw", "2025-07-01");
    const read = (month: string, weeklyMinutes: number) =>
      calculateCaritasPersonalMonthlyShiftAllowance(
        request(pkg, month, "ANLAGE_31", "BW", weeklyMinutes),
      );
    expect(read("2025-13", 2340)).toEqual({ kind: "unavailable", reason: "INVALID_MONTH" });
    expect(read("2025-06", 2340)).toEqual({ kind: "unavailable", reason: "OUTSIDE_VALIDITY" });
    expect(read("2026-02", 2340)).toEqual({ kind: "unavailable", reason: "OUTSIDE_VALIDITY" });
    for (const minutes of [0, -1, 2341, 1000.5, Number.NaN]) {
      expect(read("2025-08", minutes)).toEqual({
        kind: "unavailable",
        reason: "INVALID_WEEKLY_TIME",
      });
    }
    const tampered = load("bw", "2025-07-01");
    tampered.rules.caritasShiftAllowanceRates![0].alternatingMonthlyCents = 0;
    expect(
      calculateCaritasPersonalMonthlyShiftAllowance(
        request(tampered, "2025-08", "ANLAGE_31", "BW", 2340),
      ),
    ).toEqual({ kind: "unavailable", reason: "INVALID_PACKAGE" });
  });

  it("rejects a rate or working-time change within the requested month", () => {
    const rateChanged = load("bw", "2025-07-01");
    const rate = rateChanged.rules.caritasShiftAllowanceRates![0];
    rate.validTo = "2025-08-15";
    rateChanged.rules.caritasShiftAllowanceRates!.push({
      ...rate,
      id: "caritas-bw-shift-31-2025-second-half-august",
      validFrom: "2025-08-16",
      validTo: "2026-01-31",
    });
    expect(
      calculateCaritasPersonalMonthlyShiftAllowance(
        request(rateChanged, "2025-08", "ANLAGE_31", "BW", 2340),
      ),
    ).toEqual({ kind: "unavailable", reason: "MID_MONTH_RATE_CHANGE" });

    const timeChanged = load("bw", "2025-07-01");
    const time = timeChanged.rules.employmentWorkingTimeRules![0];
    time.validTo = "2025-08-15";
    timeChanged.rules.employmentWorkingTimeRules!.push({
      ...time,
      id: "caritas-bw-time-31-2025-second-half-august",
      validFrom: "2025-08-16",
      validTo: "2026-01-31",
    });
    expect(
      calculateCaritasPersonalMonthlyShiftAllowance(
        request(timeChanged, "2025-08", "ANLAGE_31", "BW", 2340),
      ),
    ).toEqual({ kind: "unavailable", reason: "MID_MONTH_WORKING_TIME_CHANGE" });
  });
});
