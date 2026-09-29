import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { RuleTariffPackage } from "@/rules/contracts.generated";
import { lookupCaritasTimePremiumReference } from "./caritas-time-premium-reference";

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

describe("Caritas sourced time premium reference", () => {
  it("combines table step 3, weekly time, rate and separate sources for every West selection", () => {
    for (const [region, annex31Minutes] of [
      ["bw", 2340],
      ["bayern", 2310],
      ["mitte", 2340],
      ["nord", 2310],
      ["nrw", 2310],
    ] as const) {
      for (const [version, dates] of [
        ["2025-07-01", ["2025-07-01", "2026-01-01"]],
        ["2026-02-01", ["2026-02-01", "2026-12-31"]],
      ] as const) {
        const pkg = load(region, version);
        for (const date of dates) {
          for (const annex of [31, 32] as const) {
            const result = lookupCaritasTimePremiumReference(
              pkg,
              date,
              "ANLAGE_" + annex,
              region.toUpperCase(),
              "P6",
            );
            expect(result).toMatchObject({
              kind: "source-time-premium-reference",
              packageId: pkg.packageId,
              versionId: pkg.versionId,
              variantId: "ANLAGE_" + annex,
              regionId: region.toUpperCase(),
              groupId: "p6",
              referenceStepId: "3",
              fullTimeWeeklyMinutes: annex === 31 ? annex31Minutes : 2340,
              nightBasisPoints: 2000,
              sundayBasisPoints: 2500,
              holidayWithTimeOffBasisPoints: 3500,
              holidayWithoutTimeOffBasisPoints: 13500,
              preHolidayBasisPoints: 3500,
              saturdayBasisPoints: 2000,
              rateSourceIds: [
                date.startsWith("2025") ? "caritas-dcv-premiums-2025" : "caritas-dcv-premiums-2026",
              ],
            });
            if (result.kind === "source-time-premium-reference") {
              expect(result.fullTimeMonthlyCents).toBeGreaterThan(0);
              expect(result.tableSourceIds).toContain("caritas-rk-" + region + "-2025");
              expect(result.workingTimeSourceIds.length).toBeGreaterThan(0);
              expect(result.tableId).toBeTruthy();
              expect(result.workingTimeRuleId).toBeTruthy();
              expect(result.rateId).toBeTruthy();
              expect(result).not.toHaveProperty("hourlyCents");
              expect(result).not.toHaveProperty("personalAmountCents");
            }
          }
        }
      }
    }
  });

  it("preserves the 2025 Ost table distinction and Berlin working-time boundary", () => {
    const pkg = load("ost", "2025-01");
    const lookup = (date: string, variant: string, region: string) =>
      lookupCaritasTimePremiumReference(pkg, date, variant, region, "P6");
    const east = lookup("2025-06-30", "ANLAGE_32", "OST_TARIF_OST");
    const berlin = lookup("2025-06-30", "ANLAGE_32", "OST_TARIF_WEST_BERLIN");
    expect(east).toMatchObject({ kind: "source-time-premium-reference", referenceStepId: "3" });
    expect(berlin).toMatchObject({ kind: "source-time-premium-reference", referenceStepId: "3" });
    if (
      east.kind === "source-time-premium-reference" &&
      berlin.kind === "source-time-premium-reference"
    ) {
      expect(east.tableId).not.toBe(berlin.tableId);
      expect(east.fullTimeMonthlyCents).toBeLessThan(berlin.fullTimeMonthlyCents);
    }
    expect(lookup("2025-06-30", "ANLAGE_31", "OST_TARIF_WEST_BERLIN")).toMatchObject({
      kind: "source-time-premium-reference",
      fullTimeWeeklyMinutes: 2340,
    });
    expect(lookup("2025-07-01", "ANLAGE_31", "OST_TARIF_WEST_BERLIN")).toMatchObject({
      kind: "source-time-premium-reference",
      fullTimeWeeklyMinutes: 2310,
    });
  });

  it("combines both annexes and all Ost territories at both annual source dates", () => {
    for (const [pkg, date, sourceId] of [
      [load("ost", "2025-01"), "2025-01-01", "caritas-dcv-premiums-2025"],
      [load("ost", "2026-01"), "2026-12-31", "caritas-dcv-premiums-2026"],
    ] as const) {
      for (const region of [
        "OST_TARIF_OST",
        "OST_TARIF_WEST_BERLIN",
        "OST_TARIF_WEST_HAMBURG",
      ] as const) {
        for (const annex of [31, 32] as const) {
          expect(
            lookupCaritasTimePremiumReference(pkg, date, "ANLAGE_" + annex, region, "P6"),
          ).toMatchObject({
            kind: "source-time-premium-reference",
            fullTimeWeeklyMinutes:
              annex === 31 && !(date === "2025-01-01" && region === "OST_TARIF_WEST_BERLIN")
                ? 2310
                : 2340,
            rateSourceIds: [sourceId],
          });
        }
      }
    }
  });

  it("fails closed for missing inputs, invalid selection, dates and non-DRAFT status", () => {
    const pkg = load("ost", "2025-01");
    const lookup = (item: RuleTariffPackage, date: string, region: string, group = "P6") =>
      lookupCaritasTimePremiumReference(item, date, "ANLAGE_31", region, group);
    expect(lookup(pkg, "2025-02-30", "OST_TARIF_OST")).toEqual({
      kind: "unavailable",
      reason: "OUTSIDE_VALIDITY",
    });
    expect(lookup(pkg, "2026-01-01", "OST_TARIF_OST")).toEqual({
      kind: "unavailable",
      reason: "OUTSIDE_VALIDITY",
    });
    expect(lookup(pkg, "2025-07-01", "OST")).toEqual({
      kind: "unavailable",
      reason: "UNKNOWN_SELECTION",
    });
    expect(lookup(pkg, "2025-07-01", "OST_TARIF_OST", "P5")).toEqual({
      kind: "unavailable",
      reason: "MISSING_TABLE_VALUE",
    });

    const noTime = load("ost", "2025-01");
    delete noTime.rules.employmentWorkingTimeRules;
    expect(lookup(noTime, "2025-07-01", "OST_TARIF_OST")).toEqual({
      kind: "unavailable",
      reason: "MISSING_WORKING_TIME_RULE",
    });
    const noRate = load("ost", "2025-01");
    delete noRate.rules.caritasTimePremiumRates;
    expect(lookup(noRate, "2025-07-01", "OST_TARIF_OST")).toEqual({
      kind: "unavailable",
      reason: "MISSING_TIME_PREMIUM_RATE",
    });
    const altered = load("ost", "2025-01");
    altered.rules.caritasTimePremiumRates![0].nightBasisPoints = 0;
    expect(lookup(altered, "2025-07-01", "OST_TARIF_OST")).toEqual({
      kind: "unavailable",
      reason: "INVALID_PACKAGE",
    });
    const published = load("ost", "2025-01");
    published.status = "PUBLISHED";
    expect(lookup(published, "2025-07-01", "OST_TARIF_OST")).toEqual({
      kind: "unavailable",
      reason: "INVALID_PACKAGE",
    });
  });
});
