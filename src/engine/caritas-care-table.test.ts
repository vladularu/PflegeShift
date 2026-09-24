import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { RuleTariffPackage } from "@/rules/contracts.generated";
import { lookupCaritasCareTable } from "./caritas-care-table";

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

describe("Caritas care source-table lookup, not a salary calculation", () => {
  it("keeps the two West table dates distinct", () => {
    const first = lookupCaritasCareTable(
      load("bw", "2025-07-01"),
      "2025-07-01",
      "ANLAGE_31",
      "BW",
      "P6",
      "1",
    );
    const second = lookupCaritasCareTable(
      load("bw", "2026-02-01"),
      "2026-02-01",
      "ANLAGE_32",
      "BW",
      "P6",
      "1",
    );
    expect(first).toMatchObject({ kind: "source-table", monthlyCents: 293044, stepId: "1" });
    expect(second).toMatchObject({ kind: "source-table", monthlyCents: 301249, stepId: "1" });
    expect(first.kind === "source-table" && first.sourceIds).toContain("caritas-rk-bw-2025");
  });

  it("does not collapse the 2025 Ost Anlage-32 tariff territories", () => {
    const pkg = load("ost", "2025-01");
    const amount = (annex: number, territory: string) =>
      lookupCaritasCareTable(pkg, "2025-08-01", `ANLAGE_${annex}`, territory, "P6", "1");
    expect(amount(31, "OST_TARIF_OST")).toMatchObject({
      kind: "source-table",
      monthlyCents: 289095,
    });
    expect(amount(31, "OST_TARIF_WEST_BERLIN")).toMatchObject({
      kind: "source-table",
      monthlyCents: 289095,
    });
    expect(amount(31, "OST_TARIF_WEST_HAMBURG")).toMatchObject({
      kind: "source-table",
      monthlyCents: 289095,
    });
    expect(amount(32, "OST_TARIF_WEST_BERLIN")).toMatchObject({
      kind: "source-table",
      monthlyCents: 289095,
    });
    expect(amount(32, "OST_TARIF_OST")).toMatchObject({
      kind: "source-table",
      monthlyCents: 287685,
    });
    expect(amount(32, "OST")).toEqual({ kind: "unavailable", reason: "UNKNOWN_SELECTION" });
    expect(amount(32, "OST_TARIF_WEST")).toEqual({
      kind: "unavailable",
      reason: "UNKNOWN_SELECTION",
    });
  });

  it("uses the printed 2026 Ost value for both annexes", () => {
    const pkg = load("ost", "2026-01");
    for (const annex of [31, 32])
      for (const territory of ["OST_TARIF_OST", "OST_TARIF_WEST_BERLIN", "OST_TARIF_WEST_HAMBURG"])
        expect(
          lookupCaritasCareTable(pkg, "2026-09-01", `ANLAGE_${annex}`, territory, "P6", "1"),
        ).toMatchObject({ kind: "source-table", monthlyCents: 300370 });
  });

  it("rejects missing stages, invalid dates and out-of-range package use", () => {
    const pkg = load("ost", "2025-01");
    const lookup = (date: string, group: string, step: string) =>
      lookupCaritasCareTable(pkg, date, "ANLAGE_31", "OST_TARIF_OST", group, step);
    expect(lookup("2025-07-01", "P5", "1")).toEqual({
      kind: "unavailable",
      reason: "MISSING_TABLE_VALUE",
    });
    expect(lookup("2025-07-01", "P7", "1")).toEqual({
      kind: "unavailable",
      reason: "MISSING_TABLE_VALUE",
    });
    expect(lookup("2025-02-30", "P6", "1")).toEqual({
      kind: "unavailable",
      reason: "OUTSIDE_VALIDITY",
    });
    expect(lookup("2026-01-01", "P6", "1")).toEqual({
      kind: "unavailable",
      reason: "OUTSIDE_VALIDITY",
    });
  });

  it("rejects a tampered table without falling back to TVöD or another region", () => {
    const pkg = load("ost", "2025-01");
    pkg.rules.payTables[0].entries[0].monthlyCents = 0;
    expect(
      lookupCaritasCareTable(pkg, "2025-07-01", "ANLAGE_31", "OST_TARIF_OST", "P6", "1"),
    ).toEqual({ kind: "unavailable", reason: "INVALID_PACKAGE" });
  });
});
