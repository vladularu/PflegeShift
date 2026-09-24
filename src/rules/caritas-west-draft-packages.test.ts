import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { RuleTariffPackage } from "./contracts.generated";
import { validateRulePackage } from "./validation";

const regions = ["bw", "bayern", "mitte", "nord", "nrw"] as const;
const periods = [
  { start: "2025-07-01", end: "2026-01-31" },
  { start: "2026-02-01", end: "2026-12-31" },
] as const;
const rows = readFileSync(
  new URL("../../docs/caritas-p-mittelwerte-2025-2026.csv", import.meta.url),
  "utf8",
)
  .trim()
  .split(/\r?\n/u)
  .slice(1)
  .map((line) => line.split(","));

function sourceValues(date: string): Map<string, number> {
  return new Map(
    rows
      .filter((row) => row[0] === date)
      .flatMap((row) =>
        row
          .slice(2)
          .flatMap((amount, index) =>
            amount === ""
              ? []
              : [[`${row[1].toLowerCase()}:${index + 1}`, Number(amount)] as const],
          ),
      ),
  );
}

describe("West Caritas P-table DRAFT candidates", () => {
  it.each(regions.flatMap((region) => periods.map((period) => ({ region, ...period }))))(
    "binds every printed P value for $region at $start",
    ({ region, start, end }) => {
      const pkg = JSON.parse(
        readFileSync(
          new URL(
            `../../rules/packages/reviewed/avr-caritas-p-${region}/${start}-draft1.json`,
            import.meta.url,
          ),
          "utf8",
        ),
      ) as RuleTariffPackage;
      expect(validateRulePackage(pkg)).toEqual({ ok: true, value: pkg });
      expect(pkg.packageId).toBe(`avr-caritas-p-${region}`);
      expect(pkg.engineContractVersion).toBe(14);
      expect(pkg.status).toBe("DRAFT");
      expect([pkg.validFrom, pkg.validTo]).toEqual([start, end]);
      expect(pkg.sources.map((source) => source.id).sort()).toEqual(
        [
          "caritas-bk-2025-02-corrected",
          `caritas-rk-${region}-2025`,
          "pflegeshift-tariff-assessment-v1",
        ].sort(),
      );
      expect(pkg.rules.selection?.variants.map((variant) => variant.id)).toEqual([
        "ANLAGE_31",
        "ANLAGE_32",
      ]);
      for (const variant of pkg.rules.selection?.variants ?? []) {
        expect(variant.regions.map((item) => item.id)).toEqual([region.toUpperCase()]);
        expect(variant.regions[0].payTableId).toBe(pkg.rules.payTables[0].id);
      }
      expect(
        Object.values(pkg.rules.selection?.capabilities ?? {}).every(
          (value) => value === "UNSUPPORTED",
        ),
      ).toBe(true);
      expect(pkg.rules.workPatternPolicy.sourceIds).toEqual(["pflegeshift-tariff-assessment-v1"]);
      const printed = sourceValues(start);
      expect(printed.size).toBe(62);
      const actual = new Map(
        pkg.rules.payTables[0].entries.map((entry) => [
          `${entry.groupId}:${entry.stepId}`,
          entry.monthlyCents,
        ]),
      );
      expect(actual).toEqual(printed);
      expect(actual.has("p5:1")).toBe(false);
    },
  );
});
