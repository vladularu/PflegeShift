import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { RuleTariffPackage } from "@/rules/contracts.generated";
import { lookupCaritasFullTimeWeeklyMinutes } from "./caritas-working-time";

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

describe("Caritas sourced full-time working-time lookup", () => {
  it("keeps each West region and both annexes distinct at both source dates", () => {
    const regions = [
      { packageRegion: "bw", selectionRegion: "BW", annex31Minutes: 2340 },
      { packageRegion: "bayern", selectionRegion: "BAYERN", annex31Minutes: 2310 },
      { packageRegion: "mitte", selectionRegion: "MITTE", annex31Minutes: 2340 },
      { packageRegion: "nord", selectionRegion: "NORD", annex31Minutes: 2310 },
      { packageRegion: "nrw", selectionRegion: "NRW", annex31Minutes: 2310 },
    ] as const;
    for (const version of ["2025-07-01", "2026-02-01"]) {
      for (const region of regions) {
        const pkg = load(region.packageRegion, version);
        for (const annex of [31, 32]) {
          const result = lookupCaritasFullTimeWeeklyMinutes(
            pkg,
            version,
            "ANLAGE_" + annex,
            region.selectionRegion,
          );
          expect(result).toMatchObject({
            kind: "source-working-time",
            fullTimeWeeklyMinutes: annex === 31 ? region.annex31Minutes : 2340,
          });
          if (result.kind === "source-working-time") {
            expect(result.sourceIds.length).toBeGreaterThan(0);
            expect(result.ruleId).toBeTruthy();
            expect(result).not.toHaveProperty("monthlyCents");
          }
        }
      }
    }
  });

  it("uses the 2025 Berlin boundary without changing Ost or Hamburg", () => {
    const pkg = load("ost", "2025-01");
    const time = (date: string, annex: number, region: string) =>
      lookupCaritasFullTimeWeeklyMinutes(pkg, date, "ANLAGE_" + annex, region);

    expect(time("2025-06-30", 31, "OST_TARIF_WEST_BERLIN")).toMatchObject({
      kind: "source-working-time",
      fullTimeWeeklyMinutes: 2340,
    });
    expect(time("2025-07-01", 31, "OST_TARIF_WEST_BERLIN")).toMatchObject({
      kind: "source-working-time",
      fullTimeWeeklyMinutes: 2310,
    });
    expect(time("2025-07-01", 31, "OST_TARIF_OST")).toMatchObject({
      kind: "source-working-time",
      fullTimeWeeklyMinutes: 2310,
    });
    expect(time("2025-07-01", 31, "OST_TARIF_WEST_HAMBURG")).toMatchObject({
      kind: "source-working-time",
      fullTimeWeeklyMinutes: 2310,
    });
    for (const region of ["OST_TARIF_OST", "OST_TARIF_WEST_BERLIN", "OST_TARIF_WEST_HAMBURG"])
      expect(time("2025-07-01", 32, region)).toMatchObject({
        kind: "source-working-time",
        fullTimeWeeklyMinutes: 2340,
      });
  });

  it("reads the 2026 Ost rules for every declared pair", () => {
    const pkg = load("ost", "2026-01");
    for (const annex of [31, 32])
      for (const region of ["OST_TARIF_OST", "OST_TARIF_WEST_BERLIN", "OST_TARIF_WEST_HAMBURG"])
        expect(
          lookupCaritasFullTimeWeeklyMinutes(pkg, "2026-09-01", "ANLAGE_" + annex, region),
        ).toMatchObject({
          kind: "source-working-time",
          fullTimeWeeklyMinutes: annex === 31 ? 2310 : 2340,
        });
  });

  it("rejects invalid dates, package boundaries, and unknown territories", () => {
    const pkg = load("ost", "2025-01");
    const lookup = (date: string, region: string) =>
      lookupCaritasFullTimeWeeklyMinutes(pkg, date, "ANLAGE_31", region);
    expect(lookup("2025-02-30", "OST_TARIF_OST")).toEqual({
      kind: "unavailable",
      reason: "OUTSIDE_VALIDITY",
    });
    expect(lookup("2026-01-01", "OST_TARIF_OST")).toEqual({
      kind: "unavailable",
      reason: "OUTSIDE_VALIDITY",
    });
    expect(lookup("2025-07-01", "OST")).toEqual({
      kind: "unavailable",
      reason: "UNKNOWN_SELECTION",
    });
  });

  it("does not fill absent working time from another rule or package", () => {
    const pkg = load("ost", "2025-01");
    delete pkg.rules.employmentWorkingTimeRules;
    expect(
      lookupCaritasFullTimeWeeklyMinutes(pkg, "2025-07-01", "ANLAGE_31", "OST_TARIF_OST"),
    ).toEqual({ kind: "unavailable", reason: "MISSING_WORKING_TIME_RULE" });
  });

  it("rejects altered rule values before reading them", () => {
    const pkg = load("ost", "2025-01");
    pkg.rules.employmentWorkingTimeRules![0].fullTimeWeeklyMinutes = 0;
    expect(
      lookupCaritasFullTimeWeeklyMinutes(pkg, "2025-07-01", "ANLAGE_31", "OST_TARIF_OST"),
    ).toEqual({ kind: "unavailable", reason: "INVALID_PACKAGE" });
  });
});
