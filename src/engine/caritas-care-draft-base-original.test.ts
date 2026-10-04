import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { RuleTariffPackage } from "@/rules/contracts.generated";
import { calculateCaritasCareDraftBase } from "./caritas-care-draft-original-base";
import { lookupCaritasCareTable } from "./caritas-care-table";
import { roundRemunerationCents } from "./remuneration-money";

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

describe("Caritas candidate personal table base (§ 12a), not complete remuneration", () => {
  it.each(["bw", "bayern", "mitte", "nord", "nrw"])(
    "keeps both dated West tables and both care annexes distinct in RK %s",
    (region) => {
      for (const [version, date] of [
        ["2025-07-01", "2025-07-01"],
        ["2026-02-01", "2026-02-01"],
      ]) {
        const pkg = load(region, version);
        for (const annex of [31, 32]) {
          const variant = `ANLAGE_${annex}`;
          const territory = region.toUpperCase();
          const table = lookupCaritasCareTable(pkg, date, variant, territory, "P6", "1");
          const fullTimeMinutes = annex === 32 || ["bw", "mitte"].includes(region) ? 2340 : 2310;
          const full = calculateCaritasCareDraftBase(
            pkg,
            date,
            variant,
            territory,
            "P6",
            "1",
            fullTimeMinutes,
          );
          const part = calculateCaritasCareDraftBase(
            pkg,
            date,
            variant,
            territory,
            "P6",
            "1",
            1800,
          );
          expect(table.kind).toBe("source-table");
          if (table.kind !== "source-table") throw new Error("Missing reference table");
          expect(full).toMatchObject({
            kind: "personal-table-base",
            fullTimeMonthlyCents: table.monthlyCents,
            personalMonthlyCents: table.monthlyCents,
            fullTimeWeeklyMinutes: fullTimeMinutes,
          });
          expect(part).toMatchObject({
            kind: "personal-table-base",
            personalMonthlyCents: roundRemunerationCents(
              table.monthlyCents * 1800,
              fullTimeMinutes,
            ),
          });
          if (part.kind === "personal-table-base")
            expect(part.sourceIds.length).toBeGreaterThan(table.sourceIds.length);
        }
      }
    },
  );

  it("uses distinct 2025 Berlin/Hamburg working times and the stable 2026 identities", () => {
    const territories = ["OST_TARIF_OST", "OST_TARIF_WEST_BERLIN", "OST_TARIF_WEST_HAMBURG"];
    for (const territory of territories) {
      for (const annex of [31, 32]) {
        for (const [date, expected] of [
          [
            "2025-06-01",
            annex === 31 && territory === "OST_TARIF_WEST_BERLIN"
              ? 2340
              : annex === 31
                ? 2310
                : 2340,
          ],
          ["2025-08-01", annex === 31 ? 2310 : 2340],
        ] as const)
          expect(
            calculateCaritasCareDraftBase(
              load("ost", "2025-01"),
              date,
              `ANLAGE_${annex}`,
              territory,
              "P6",
              "1",
              1800,
            ),
          ).toMatchObject({ kind: "personal-table-base", fullTimeWeeklyMinutes: expected });
        expect(
          calculateCaritasCareDraftBase(
            load("ost", "2026-01"),
            "2026-09-01",
            `ANLAGE_${annex}`,
            territory,
            "P6",
            "1",
            1800,
          ),
        ).toMatchObject({
          kind: "personal-table-base",
          fullTimeWeeklyMinutes: annex === 31 ? 2310 : 2340,
        });
      }
    }
    expect(
      calculateCaritasCareDraftBase(
        load("ost", "2025-01"),
        "2025-06-01",
        "ANLAGE_31",
        "OST_TARIF_WEST",
        "P6",
        "1",
        1800,
      ),
    ).toEqual({ kind: "unavailable", reason: "UNKNOWN_SELECTION" });
  });

  it("fails closed on over-full-time hours, missing stages and a tampered source", () => {
    const pkg = load("bw", "2026-02-01");
    const lookup = (step: string, minutes: number) =>
      calculateCaritasCareDraftBase(pkg, "2026-02-01", "ANLAGE_31", "BW", "P7", step, minutes);
    expect(lookup("2", 2341)).toEqual({ kind: "unavailable", reason: "INVALID_WEEKLY_TIME" });
    expect(lookup("2", 30)).toEqual({ kind: "unavailable", reason: "INVALID_WEEKLY_TIME" });
    expect(lookup("1", 1800)).toEqual({ kind: "unavailable", reason: "MISSING_TABLE_VALUE" });
    pkg.rules.payTables[0].entries[0].monthlyCents = 0;
    expect(lookup("2", 1800)).toEqual({ kind: "unavailable", reason: "INVALID_PACKAGE" });
  });
});
