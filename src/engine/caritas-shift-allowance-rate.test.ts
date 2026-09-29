import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { RuleTariffPackage } from "@/rules/contracts.generated";
import { lookupCaritasShiftAllowanceRate } from "./caritas-shift-allowance-rate";

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

describe("Caritas sourced shift allowance rate lookup", () => {
  it("returns all four sourced rates for five West regions, both annexes and both periods", () => {
    for (const region of ["bw", "bayern", "mitte", "nord", "nrw"] as const) {
      for (const [version, date] of [
        ["2025-07-01", "2025-07-01"],
        ["2026-02-01", "2026-02-01"],
      ] as const) {
        const pkg = load(region, version);
        for (const annex of [31, 32] as const) {
          const result = lookupCaritasShiftAllowanceRate(
            pkg,
            date,
            "ANLAGE_" + annex,
            region.toUpperCase(),
          );
          expect(result).toMatchObject({
            kind: "source-shift-allowance-rate",
            packageId: pkg.packageId,
            versionId: pkg.versionId,
            variantId: "ANLAGE_" + annex,
            regionId: region.toUpperCase(),
            alternatingMonthlyCents: 25000,
            alternatingHourlyCents: annex === 31 ? 149 : 147,
            shiftMonthlyCents: 10000,
            shiftHourlyCents: 59,
            sourceIds: ["caritas-bk-2025-02-corrected", "caritas-rk-" + region + "-2025"],
          });
          expect(result).not.toHaveProperty("personalMonthlyCents");
          expect(result).not.toHaveProperty("completeGross");
        }
      }
    }
  });

  it("keeps the Ost gap before July 2025 and returns all territorial rates afterward", () => {
    const first = load("ost", "2025-01");
    const second = load("ost", "2026-01");
    for (const territory of [
      "OST_TARIF_OST",
      "OST_TARIF_WEST_BERLIN",
      "OST_TARIF_WEST_HAMBURG",
    ] as const) {
      for (const annex of [31, 32] as const) {
        const variant = "ANLAGE_" + annex;
        expect(lookupCaritasShiftAllowanceRate(first, "2025-06-30", variant, territory)).toEqual({
          kind: "unavailable",
          reason: "MISSING_SHIFT_ALLOWANCE_RATE",
        });
        for (const [pkg, date] of [
          [first, "2025-07-01"],
          [first, "2025-12-31"],
          [second, "2026-01-01"],
          [second, "2026-12-31"],
        ] as const) {
          expect(lookupCaritasShiftAllowanceRate(pkg, date, variant, territory)).toMatchObject({
            kind: "source-shift-allowance-rate",
            alternatingMonthlyCents: 25000,
            alternatingHourlyCents: annex === 31 ? 149 : 147,
            shiftMonthlyCents: 10000,
            shiftHourlyCents: 59,
            sourceIds: ["caritas-bk-2025-02-corrected", "caritas-rk-ost-2025-allowances"],
          });
        }
      }
    }
  });

  it("fails closed for invalid dates, package boundaries and unknown selections", () => {
    const west = load("bw", "2025-07-01");
    const read = (date: string, variant: string, region: string) =>
      lookupCaritasShiftAllowanceRate(west, date, variant, region);
    expect(read("2025-02-30", "ANLAGE_31", "BW")).toEqual({
      kind: "unavailable",
      reason: "OUTSIDE_VALIDITY",
    });
    expect(read("2025-06-30", "ANLAGE_31", "BW")).toEqual({
      kind: "unavailable",
      reason: "OUTSIDE_VALIDITY",
    });
    expect(read("2026-01-31", "ANLAGE_31", "BW")).toMatchObject({
      kind: "source-shift-allowance-rate",
    });
    expect(read("2026-02-01", "ANLAGE_31", "BW")).toEqual({
      kind: "unavailable",
      reason: "OUTSIDE_VALIDITY",
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
    delete missing.rules.caritasShiftAllowanceRates;
    expect(
      lookupCaritasShiftAllowanceRate(missing, "2025-07-01", "ANLAGE_31", "OST_TARIF_OST"),
    ).toEqual({ kind: "unavailable", reason: "MISSING_SHIFT_ALLOWANCE_RATE" });

    const tampered = load("ost", "2025-01");
    tampered.rules.caritasShiftAllowanceRates![0].alternatingHourlyCents = 0;
    expect(
      lookupCaritasShiftAllowanceRate(tampered, "2025-07-01", "ANLAGE_31", "OST_TARIF_OST"),
    ).toEqual({ kind: "unavailable", reason: "INVALID_PACKAGE" });
  });
});
