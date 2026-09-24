import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { RuleTariffPackage } from "@/rules/contracts.generated";
import { lookupCaritasCareTable } from "./caritas-care-table";
import { calculateCaritasCareDraftBase } from "./caritas-care-draft-base";

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

describe("Caritas DRAFT personal table base under Anlagen 31/32 § 12a", () => {
  const references = [
    {
      region: "bw",
      version: "2025-07-01",
      date: "2025-07-01",
      annex: "ANLAGE_31",
      territory: "BW",
      weeklyMinutes: 1800,
      fullTimeCents: 293044,
      fullTimeWeeklyMinutes: 2340,
      expectedCents: 225418,
    },
    {
      region: "bw",
      version: "2026-02-01",
      date: "2026-02-01",
      annex: "ANLAGE_31",
      territory: "BW",
      weeklyMinutes: 1800,
      fullTimeCents: 301249,
      fullTimeWeeklyMinutes: 2340,
      expectedCents: 231730,
    },
    {
      region: "bw",
      version: "2026-02-01",
      date: "2026-02-01",
      annex: "ANLAGE_31",
      territory: "BW",
      weeklyMinutes: 1170,
      fullTimeCents: 301249,
      fullTimeWeeklyMinutes: 2340,
      expectedCents: 150625,
    },
    {
      region: "bayern",
      version: "2025-07-01",
      date: "2025-07-01",
      annex: "ANLAGE_31",
      territory: "BAYERN",
      weeklyMinutes: 1800,
      fullTimeCents: 293044,
      fullTimeWeeklyMinutes: 2310,
      expectedCents: 228346,
    },
    {
      region: "ost",
      version: "2025-01",
      date: "2025-06-30",
      annex: "ANLAGE_31",
      territory: "OST_TARIF_WEST_BERLIN",
      weeklyMinutes: 1800,
      fullTimeCents: 289095,
      fullTimeWeeklyMinutes: 2340,
      expectedCents: 222381,
    },
    {
      region: "ost",
      version: "2025-01",
      date: "2025-07-01",
      annex: "ANLAGE_31",
      territory: "OST_TARIF_WEST_BERLIN",
      weeklyMinutes: 1800,
      fullTimeCents: 289095,
      fullTimeWeeklyMinutes: 2310,
      expectedCents: 225269,
    },
    {
      region: "ost",
      version: "2025-01",
      date: "2025-07-01",
      annex: "ANLAGE_32",
      territory: "OST_TARIF_OST",
      weeklyMinutes: 1800,
      fullTimeCents: 287685,
      fullTimeWeeklyMinutes: 2340,
      expectedCents: 221296,
    },
    {
      region: "ost",
      version: "2026-01",
      date: "2026-09-01",
      annex: "ANLAGE_31",
      territory: "OST_TARIF_WEST_BERLIN",
      weeklyMinutes: 1800,
      fullTimeCents: 300370,
      fullTimeWeeklyMinutes: 2310,
      expectedCents: 234055,
    },
  ] as const;

  it.each(references)(
    "returns the checked cent amount for $region $date $annex $territory at $weeklyMinutes minutes",
    (reference) => {
      const result = calculateCaritasCareDraftBase(
        load(reference.region, reference.version),
        reference.date,
        reference.annex,
        reference.territory,
        "P6",
        "1",
        reference.weeklyMinutes,
      );
      expect(result).toMatchObject({
        kind: "personal-table-base",
        completeGross: false,
        fullTimeMonthlyCents: reference.fullTimeCents,
        personalMonthlyCents: reference.expectedCents,
        weeklyMinutes: reference.weeklyMinutes,
        fullTimeWeeklyMinutes: reference.fullTimeWeeklyMinutes,
        prorationProvision: "AVR_ANLAGE_31_32_12A",
      });
      if (result.kind === "personal-table-base") {
        expect(result.tableId).toBeTruthy();
        expect(result.workingTimeRuleId).toBeTruthy();
        expect(result.sourceIds.length).toBeGreaterThan(0);
        if (reference.region === "ost")
          expect(result.sourceIds).toEqual(
            expect.arrayContaining([
              reference.version === "2025-01" ? "caritas-rk-ost-2025-p" : "caritas-rk-ost-2026-p",
              "caritas-rk-ost-time-2022",
            ]),
          );
      }
    },
  );

  it("keeps full-time values exact across five West regions, two periods, and both annexes", () => {
    const regions = [
      { id: "bw", territory: "BW", annex31Minutes: 2340 },
      { id: "bayern", territory: "BAYERN", annex31Minutes: 2310 },
      { id: "mitte", territory: "MITTE", annex31Minutes: 2340 },
      { id: "nord", territory: "NORD", annex31Minutes: 2310 },
      { id: "nrw", territory: "NRW", annex31Minutes: 2310 },
    ] as const;
    for (const version of ["2025-07-01", "2026-02-01"]) {
      for (const region of regions) {
        const pkg = load(region.id, version);
        for (const annex of [31, 32]) {
          const variant = "ANLAGE_" + annex;
          const fullTimeWeeklyMinutes = annex === 31 ? region.annex31Minutes : 2340;
          const table = lookupCaritasCareTable(pkg, version, variant, region.territory, "P6", "1");
          const result = calculateCaritasCareDraftBase(
            pkg,
            version,
            variant,
            region.territory,
            "P6",
            "1",
            fullTimeWeeklyMinutes,
          );
          expect(table.kind).toBe("source-table");
          if (table.kind !== "source-table") throw new Error("Missing checked source table");
          expect(result).toMatchObject({
            kind: "personal-table-base",
            personalMonthlyCents: table.monthlyCents,
            fullTimeWeeklyMinutes,
          });
        }
      }
    }
  });

  it("rejects invalid weekly time without guessing a percentage", () => {
    const pkg = load("bw", "2026-02-01");
    const calculate = (weeklyMinutes: number) =>
      calculateCaritasCareDraftBase(pkg, "2026-02-01", "ANLAGE_31", "BW", "P6", "1", weeklyMinutes);
    for (const value of [0, -1, 2341, 1800.5, Number.NaN, Number.POSITIVE_INFINITY])
      expect(calculate(value)).toEqual({ kind: "unavailable", reason: "INVALID_WEEKLY_TIME" });
  });

  it("does not replace missing facts with another territory or tariff", () => {
    const pkg = load("ost", "2025-01");
    const calculate = (date: string, territory: string, step: string) =>
      calculateCaritasCareDraftBase(pkg, date, "ANLAGE_31", territory, "P6", step, 1800);
    expect(calculate("2025-02-30", "OST_TARIF_OST", "1")).toEqual({
      kind: "unavailable",
      reason: "OUTSIDE_VALIDITY",
    });
    expect(calculate("2027-01-01", "OST_TARIF_OST", "1")).toEqual({
      kind: "unavailable",
      reason: "OUTSIDE_VALIDITY",
    });
    expect(calculate("2025-07-01", "OST_TARIF_WEST", "1")).toEqual({
      kind: "unavailable",
      reason: "UNKNOWN_SELECTION",
    });
    expect(calculate("2025-07-01", "OST_TARIF_OST", "9")).toEqual({
      kind: "unavailable",
      reason: "MISSING_TABLE_VALUE",
    });
    delete pkg.rules.employmentWorkingTimeRules;
    expect(calculate("2025-07-01", "OST_TARIF_OST", "1")).toEqual({
      kind: "unavailable",
      reason: "MISSING_WORKING_TIME_RULE",
    });
  });

  it("rejects changed source data before calculating a personal amount", () => {
    const pkg = load("bw", "2026-02-01");
    pkg.rules.payTables[0].entries[0].monthlyCents = 0;
    expect(
      calculateCaritasCareDraftBase(pkg, "2026-02-01", "ANLAGE_31", "BW", "P6", "1", 1800),
    ).toEqual({ kind: "unavailable", reason: "INVALID_PACKAGE" });
  });
});
