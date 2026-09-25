import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { RuleTariffPackage } from "@/rules/contracts.generated";
import { lookupCaritasCareAllowanceRate } from "./caritas-care-allowance-rate";

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

describe("Caritas sourced care allowance rate lookup", () => {
  it("returns both provisions and their sources for all five West regions and both annexes", () => {
    const regions = ["bw", "bayern", "mitte", "nord", "nrw"] as const;
    for (const region of regions) {
      for (const [version, date, dynamicCents] of [
        ["2025-07-01", "2025-07-01", 13796],
        ["2026-02-01", "2026-02-01", 14182],
      ] as const) {
        const pkg = load(region, version);
        for (const annex of [31, 32] as const) {
          const fixed = lookupCaritasCareAllowanceRate(
            pkg,
            date,
            `ANLAGE_${annex}`,
            region.toUpperCase(),
            "SECTION_12_3",
          );
          const dynamic = lookupCaritasCareAllowanceRate(
            pkg,
            date,
            `ANLAGE_${annex}`,
            region.toUpperCase(),
            "SECTION_12_4",
          );
          expect(fixed).toMatchObject({
            kind: "source-care-allowance-rate",
            monthlyCents: region === "bw" ? 3500 : 2500,
            sourceIds: ["caritas-dg-2024-care-allowances"],
          });
          expect(dynamic).toMatchObject({
            kind: "source-care-allowance-rate",
            monthlyCents: dynamicCents,
            sourceIds: ["caritas-bk-2025-02-corrected", `caritas-rk-${region}-2025`],
          });
          expect(dynamic).not.toHaveProperty("personalMonthlyCents");
        }
      }
    }
  });

  it("keeps the Ost 2025 gap and the January/February 2026 boundary for every territory", () => {
    const first = load("ost", "2025-01");
    const second = load("ost", "2026-01");
    const territories = [
      "OST_TARIF_OST",
      "OST_TARIF_WEST_BERLIN",
      "OST_TARIF_WEST_HAMBURG",
    ] as const;
    for (const annex of [31, 32] as const) {
      for (const territory of territories) {
        const read = (
          pkg: RuleTariffPackage,
          date: string,
          provisionId: "SECTION_12_3" | "SECTION_12_4",
        ) => lookupCaritasCareAllowanceRate(pkg, date, `ANLAGE_${annex}`, territory, provisionId);
        expect(read(first, "2025-01-01", "SECTION_12_3")).toMatchObject({
          kind: "source-care-allowance-rate",
          monthlyCents: 2500,
        });
        expect(read(first, "2025-06-30", "SECTION_12_4")).toEqual({
          kind: "unavailable",
          reason: "MISSING_CARE_ALLOWANCE_RATE",
        });
        for (const [pkg, date, cents] of [
          [first, "2025-07-01", 13796],
          [second, "2026-01-31", 13796],
          [second, "2026-02-01", 14182],
        ] as const) {
          expect(read(pkg, date, "SECTION_12_4")).toMatchObject({
            kind: "source-care-allowance-rate",
            monthlyCents: cents,
            sourceIds: ["caritas-bk-2025-02-corrected", "caritas-rk-ost-2025-allowances"],
          });
        }
      }
    }
  });

  it("fails closed for invalid dates, package boundaries, selections and provisions", () => {
    const pkg = load("ost", "2025-01");
    const read = (date: string, variant: string, region: string) =>
      lookupCaritasCareAllowanceRate(pkg, date, variant, region, "SECTION_12_4");
    expect(read("2025-02-30", "ANLAGE_31", "OST_TARIF_OST")).toEqual({
      kind: "unavailable",
      reason: "OUTSIDE_VALIDITY",
    });
    expect(read("2026-01-01", "ANLAGE_31", "OST_TARIF_OST")).toEqual({
      kind: "unavailable",
      reason: "OUTSIDE_VALIDITY",
    });
    expect(read("2025-07-01", "ANLAGE_31", "OST")).toEqual({
      kind: "unavailable",
      reason: "UNKNOWN_SELECTION",
    });
    expect(read("2025-07-01", "ANLAGE_33", "OST_TARIF_OST")).toEqual({
      kind: "unavailable",
      reason: "UNKNOWN_SELECTION",
    });
    expect(
      lookupCaritasCareAllowanceRate(
        pkg,
        "2025-07-01",
        "ANLAGE_31",
        "OST_TARIF_OST",
        "SECTION_12_9" as "SECTION_12_3",
      ),
    ).toEqual({ kind: "unavailable", reason: "UNKNOWN_PROVISION" });
  });

  it("does not invent a missing rate or read a tampered package", () => {
    const missing = load("ost", "2025-01");
    delete missing.rules.caritasCareAllowanceRates;
    expect(
      lookupCaritasCareAllowanceRate(
        missing,
        "2025-07-01",
        "ANLAGE_31",
        "OST_TARIF_OST",
        "SECTION_12_4",
      ),
    ).toEqual({ kind: "unavailable", reason: "MISSING_CARE_ALLOWANCE_RATE" });

    const tampered = load("ost", "2025-01");
    tampered.rules.caritasCareAllowanceRates![0].monthlyCents = 0;
    expect(
      lookupCaritasCareAllowanceRate(
        tampered,
        "2025-07-01",
        "ANLAGE_31",
        "OST_TARIF_OST",
        "SECTION_12_4",
      ),
    ).toEqual({ kind: "unavailable", reason: "INVALID_PACKAGE" });
  });
});
