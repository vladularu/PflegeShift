import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { RuleTariffPackage } from "@/rules/contracts.generated";
import { lookupCaritasTimePremiumHourlyValues } from "./caritas-time-premium-hourly-values";

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

describe("Caritas sourced hourly time premium values", () => {
  it("matches the printed 2025 P6 row for 39 weekly hours after two cent rounding steps", () => {
    const result = lookupCaritasTimePremiumHourlyValues(
      load("bw", "2025-07-01"),
      "2025-07-01",
      "ANLAGE_31",
      "BW",
      "P6",
    );
    expect(result).toMatchObject({
      kind: "source-hourly-premium-values",
      hourlyTableCents: 1929,
      nightCentsPerHour: 386,
      sundayCentsPerHour: 482,
      holidayWithTimeOffCentsPerHour: 675,
      holidayWithoutTimeOffCentsPerHour: 2604,
      preHolidayCentsPerHour: 675,
      saturdayCentsPerHour: 386,
      roundingProvision: "AVR_ANLAGE_1_X_E",
      roundingOrder: "HOURLY_TABLE_CENTS_THEN_PERCENTAGE",
      ratio: {
        reference: {
          fullTimeMonthlyCents: 327186,
          fullTimeWeeklyMinutes: 2340,
          tableSourceIds: ["caritas-bk-2025-02-corrected", "caritas-rk-bw-2025"],
          rateSourceIds: ["caritas-dcv-premiums-2025"],
        },
      },
    });
    // Applying 135% to the unrounded quotient would give 26.05 instead of the printed 26.04.
    expect(result).not.toHaveProperty("personalAmountCents");
  });

  it("also matches the printed P4 row without using a person's development step", () => {
    const result = lookupCaritasTimePremiumHourlyValues(
      load("bw", "2025-07-01"),
      "2025-07-01",
      "ANLAGE_32",
      "BW",
      "P4",
    );
    expect(result).toMatchObject({
      kind: "source-hourly-premium-values",
      hourlyTableCents: 1749,
      nightCentsPerHour: 350,
      sundayCentsPerHour: 437,
      holidayWithTimeOffCentsPerHour: 612,
      holidayWithoutTimeOffCentsPerHour: 2361,
    });
  });

  it("uses the separately sourced eastern table and Berlin working-time change", () => {
    const pkg = load("ost", "2025-01");
    const eastern = lookupCaritasTimePremiumHourlyValues(
      pkg,
      "2025-06-30",
      "ANLAGE_32",
      "OST_TARIF_OST",
      "P6",
    );
    const berlinBefore = lookupCaritasTimePremiumHourlyValues(
      pkg,
      "2025-06-30",
      "ANLAGE_31",
      "OST_TARIF_WEST_BERLIN",
      "P6",
    );
    const berlinAfter = lookupCaritasTimePremiumHourlyValues(
      pkg,
      "2025-07-01",
      "ANLAGE_31",
      "OST_TARIF_WEST_BERLIN",
      "P6",
    );
    expect(eastern).toMatchObject({
      kind: "source-hourly-premium-values",
      ratio: { reference: { fullTimeMonthlyCents: 322510, fullTimeWeeklyMinutes: 2340 } },
    });
    expect(berlinBefore).toMatchObject({
      kind: "source-hourly-premium-values",
      ratio: { reference: { fullTimeWeeklyMinutes: 2340 } },
    });
    expect(berlinAfter).toMatchObject({
      kind: "source-hourly-premium-values",
      ratio: { reference: { fullTimeWeeklyMinutes: 2310 } },
    });
    if (berlinBefore.kind === "source-hourly-premium-values") {
      expect(berlinAfter.kind).toBe("source-hourly-premium-values");
      if (berlinAfter.kind === "source-hourly-premium-values") {
        expect(berlinAfter.hourlyTableCents).toBeGreaterThan(berlinBefore.hourlyTableCents);
      }
    }
  });

  it("preserves unavailable source cases", () => {
    const pkg = load("ost", "2025-01");
    expect(
      lookupCaritasTimePremiumHourlyValues(pkg, "2026-01-01", "ANLAGE_31", "OST_TARIF_OST", "P6"),
    ).toEqual({ kind: "unavailable", reason: "OUTSIDE_VALIDITY" });
    expect(
      lookupCaritasTimePremiumHourlyValues(pkg, "2025-07-01", "ANLAGE_31", "OST_TARIF_OST", "P5"),
    ).toEqual({ kind: "unavailable", reason: "MISSING_TABLE_VALUE" });
  });
});
