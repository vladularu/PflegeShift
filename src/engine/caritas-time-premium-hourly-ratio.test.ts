import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { RuleTariffPackage } from "@/rules/contracts.generated";
import { lookupCaritasTimePremiumHourlyRatio } from "./caritas-time-premium-hourly-ratio";

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

describe("Caritas exact hourly Stufe-3 table ratio", () => {
  it("uses the printed West P6 step-3 value and the full-time 39-hour divisor", () => {
    const result = lookupCaritasTimePremiumHourlyRatio(
      load("bw", "2025-07-01"),
      "2025-07-01",
      "ANLAGE_31",
      "BW",
      "P6",
    );
    expect(result).toMatchObject({
      kind: "source-hourly-table-ratio",
      monthlyFactorThousandths: 4348,
      hourlyCentsNumerator: 19631160000,
      hourlyCentsDenominator: 10174320,
      divisorProvision: "AVR_ANLAGE_1_IIA_A_SATZ_4",
      reference: {
        groupId: "p6",
        referenceStepId: "3",
        fullTimeMonthlyCents: 327186,
        fullTimeWeeklyMinutes: 2340,
        rateSourceIds: ["caritas-dcv-premiums-2025"],
      },
    });
    expect(result).not.toHaveProperty("hourlyCents");
    expect(result).not.toHaveProperty("personalAmountCents");
  });

  it("keeps the Ost special table and Berlin working-time transition separate", () => {
    const pkg = load("ost", "2025-01");
    const east32 = lookupCaritasTimePremiumHourlyRatio(
      pkg,
      "2025-06-30",
      "ANLAGE_32",
      "OST_TARIF_OST",
      "P6",
    );
    expect(east32).toMatchObject({
      kind: "source-hourly-table-ratio",
      hourlyCentsNumerator: 19350600000,
      hourlyCentsDenominator: 10174320,
      reference: { fullTimeMonthlyCents: 322510, fullTimeWeeklyMinutes: 2340 },
    });
    const berlinBefore = lookupCaritasTimePremiumHourlyRatio(
      pkg,
      "2025-06-30",
      "ANLAGE_31",
      "OST_TARIF_WEST_BERLIN",
      "P6",
    );
    const berlinAfter = lookupCaritasTimePremiumHourlyRatio(
      pkg,
      "2025-07-01",
      "ANLAGE_31",
      "OST_TARIF_WEST_BERLIN",
      "P6",
    );
    expect(berlinBefore).toMatchObject({
      kind: "source-hourly-table-ratio",
      hourlyCentsNumerator: 19445460000,
      hourlyCentsDenominator: 10174320,
      reference: { fullTimeMonthlyCents: 324091, fullTimeWeeklyMinutes: 2340 },
    });
    expect(berlinAfter).toMatchObject({
      kind: "source-hourly-table-ratio",
      hourlyCentsNumerator: 19445460000,
      hourlyCentsDenominator: 10043880,
      reference: { fullTimeMonthlyCents: 324091, fullTimeWeeklyMinutes: 2310 },
    });
  });

  it("stays sourced and unrounded for all West and Ost annual periods", () => {
    for (const [region, versions] of [
      ["bw", ["2025-07-01", "2026-02-01"]],
      ["bayern", ["2025-07-01", "2026-02-01"]],
      ["mitte", ["2025-07-01", "2026-02-01"]],
      ["nord", ["2025-07-01", "2026-02-01"]],
      ["nrw", ["2025-07-01", "2026-02-01"]],
      ["ost", ["2025-01", "2026-01"]],
    ] as const) {
      for (const version of versions) {
        const pkg = load(region, version);
        const dates =
          region === "ost"
            ? [version === "2025-01" ? "2025-01-01" : "2026-01-01"]
            : version === "2025-07-01"
              ? ["2025-07-01", "2026-01-01"]
              : ["2026-02-01"];
        const regions =
          region === "ost"
            ? ["OST_TARIF_OST", "OST_TARIF_WEST_BERLIN", "OST_TARIF_WEST_HAMBURG"]
            : [region.toUpperCase()];
        for (const date of dates) {
          for (const territory of regions) {
            for (const annex of [31, 32] as const) {
              const result = lookupCaritasTimePremiumHourlyRatio(
                pkg,
                date,
                "ANLAGE_" + annex,
                territory,
                "P6",
              );
              expect(result).toMatchObject({
                kind: "source-hourly-table-ratio",
                reference: {
                  referenceStepId: "3",
                  rateSourceIds: [
                    date.startsWith("2025")
                      ? "caritas-dcv-premiums-2025"
                      : "caritas-dcv-premiums-2026",
                  ],
                },
              });
              if (result.kind === "source-hourly-table-ratio") {
                expect(Number.isSafeInteger(result.hourlyCentsNumerator)).toBe(true);
                expect(Number.isSafeInteger(result.hourlyCentsDenominator)).toBe(true);
                expect(result.hourlyCentsDenominator).toBeGreaterThan(0);
              }
            }
          }
        }
      }
    }
  });

  it("passes through unavailable reference cases without a ratio", () => {
    const pkg = load("ost", "2025-01");
    expect(
      lookupCaritasTimePremiumHourlyRatio(pkg, "2026-01-01", "ANLAGE_31", "OST_TARIF_OST", "P6"),
    ).toEqual({ kind: "unavailable", reason: "OUTSIDE_VALIDITY" });
    expect(
      lookupCaritasTimePremiumHourlyRatio(pkg, "2025-07-01", "ANLAGE_31", "OST_TARIF_OST", "P5"),
    ).toEqual({ kind: "unavailable", reason: "MISSING_TABLE_VALUE" });
    const missingRate = load("ost", "2025-01");
    delete missingRate.rules.caritasTimePremiumRates;
    expect(
      lookupCaritasTimePremiumHourlyRatio(
        missingRate,
        "2025-07-01",
        "ANLAGE_31",
        "OST_TARIF_OST",
        "P6",
      ),
    ).toEqual({ kind: "unavailable", reason: "MISSING_TIME_PREMIUM_RATE" });
  });
});
