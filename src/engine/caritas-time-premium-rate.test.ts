import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { RuleTariffPackage } from "@/rules/contracts.generated";
import { lookupCaritasTimePremiumRate } from "./caritas-time-premium-rate";

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

function expectSourcedRate(
  pkg: RuleTariffPackage,
  date: string,
  variantId: string,
  regionId: string,
  sourceId: string,
): void {
  const result = lookupCaritasTimePremiumRate(pkg, date, variantId, regionId);
  expect(result).toMatchObject({
    kind: "source-time-premium-rate",
    packageId: pkg.packageId,
    versionId: pkg.versionId,
    variantId,
    regionId,
    referenceStepId: "3",
    nightBasisPoints: 2000,
    sundayBasisPoints: 2500,
    holidayWithTimeOffBasisPoints: 3500,
    holidayWithoutTimeOffBasisPoints: 13500,
    preHolidayBasisPoints: 3500,
    saturdayBasisPoints: 2000,
    sourceIds: [sourceId],
  });
  expect(result).not.toHaveProperty("personalMonthlyCents");
  expect(result).not.toHaveProperty("completeGross");
}

describe("Caritas sourced time premium rate lookup", () => {
  it("reads all 30 West rates across five regions, both annexes and three yearly windows", () => {
    for (const region of ["bw", "bayern", "mitte", "nord", "nrw"] as const) {
      for (const annex of [31, 32] as const) {
        const variant = "ANLAGE_" + annex;
        const territory = region.toUpperCase();
        const first = load(region, "2025-07-01");
        expectSourcedRate(first, "2025-07-01", variant, territory, "caritas-dcv-premiums-2025");
        expectSourcedRate(first, "2025-12-31", variant, territory, "caritas-dcv-premiums-2025");
        expectSourcedRate(first, "2026-01-01", variant, territory, "caritas-dcv-premiums-2026");
        expectSourcedRate(first, "2026-01-31", variant, territory, "caritas-dcv-premiums-2026");
        const second = load(region, "2026-02-01");
        expectSourcedRate(second, "2026-02-01", variant, territory, "caritas-dcv-premiums-2026");
        expectSourcedRate(second, "2026-12-31", variant, territory, "caritas-dcv-premiums-2026");
      }
    }
  });

  it("reads all 12 Ost rates, including January through June 2025", () => {
    const first = load("ost", "2025-01");
    const second = load("ost", "2026-01");
    for (const territory of [
      "OST_TARIF_OST",
      "OST_TARIF_WEST_BERLIN",
      "OST_TARIF_WEST_HAMBURG",
    ] as const) {
      for (const annex of [31, 32] as const) {
        const variant = "ANLAGE_" + annex;
        expectSourcedRate(first, "2025-01-01", variant, territory, "caritas-dcv-premiums-2025");
        expectSourcedRate(first, "2025-06-30", variant, territory, "caritas-dcv-premiums-2025");
        expectSourcedRate(first, "2025-12-31", variant, territory, "caritas-dcv-premiums-2025");
        expectSourcedRate(second, "2026-01-01", variant, territory, "caritas-dcv-premiums-2026");
        expectSourcedRate(second, "2026-12-31", variant, territory, "caritas-dcv-premiums-2026");
      }
    }
  });

  it("fails closed for invalid dates, package boundaries and unknown selections", () => {
    const west = load("bw", "2025-07-01");
    const read = (date: string, variant: string, region: string) =>
      lookupCaritasTimePremiumRate(west, date, variant, region);
    for (const date of ["2025-02-30", "2025-7-01", "2025-06-30", "2026-02-01"]) {
      expect(read(date, "ANLAGE_31", "BW")).toEqual({
        kind: "unavailable",
        reason: "OUTSIDE_VALIDITY",
      });
    }
    expect(read("2026-01-31", "ANLAGE_31", "BW")).toMatchObject({
      kind: "source-time-premium-rate",
    });
    expect(read("2025-07-01", "ANLAGE_33", "BW")).toEqual({
      kind: "unavailable",
      reason: "UNKNOWN_SELECTION",
    });
    expect(read("2025-07-01", "ANLAGE_31", "OST")).toEqual({
      kind: "unavailable",
      reason: "UNKNOWN_SELECTION",
    });
  });

  it("does not invent missing rates or read a tampered package", () => {
    const missing = load("ost", "2025-01");
    delete missing.rules.caritasTimePremiumRates;
    expect(
      lookupCaritasTimePremiumRate(missing, "2025-01-01", "ANLAGE_31", "OST_TARIF_OST"),
    ).toEqual({
      kind: "unavailable",
      reason: "MISSING_TIME_PREMIUM_RATE",
    });

    const tampered = load("ost", "2025-01");
    tampered.rules.caritasTimePremiumRates![0].nightBasisPoints = 0;
    expect(
      lookupCaritasTimePremiumRate(tampered, "2025-01-01", "ANLAGE_31", "OST_TARIF_OST"),
    ).toEqual({ kind: "unavailable", reason: "INVALID_PACKAGE" });
  });
});
