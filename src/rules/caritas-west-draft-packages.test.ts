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
          ...(start === "2025-07-01"
            ? ["caritas-dgs-west-factsheets-2025"]
            : ["caritas-dgs-west-hospital-time-2026", "caritas-dgs-west-care-time-2026"]),
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
      const workingTimes = pkg.rules.employmentWorkingTimeRules ?? [];
      expect(workingTimes).toHaveLength(2);
      for (const annex of [31, 32] as const) {
        const rule = workingTimes.find((item) => item.variantId === `ANLAGE_${annex}`);
        expect(rule).toEqual({
          id: `caritas-${region}-${annex}-${start}`,
          variantId: `ANLAGE_${annex}`,
          regionId: region.toUpperCase(),
          validFrom: start,
          validTo: end,
          fullTimeWeeklyMinutes:
            annex === 32 || region === "bw" || region === "mitte" ? 2340 : 2310,
          sourceIds: [
            start === "2025-07-01"
              ? "caritas-dgs-west-factsheets-2025"
              : annex === 31
                ? "caritas-dgs-west-hospital-time-2026"
                : "caritas-dgs-west-care-time-2026",
          ],
        });
        for (const sourceId of rule?.sourceIds ?? []) {
          expect(pkg.sources.find((source) => source.id === sourceId)?.sha256).toBe(
            start === "2025-07-01"
              ? "01a2a4e6681bb94e6fd85042f012d9582a6805b12ccfd1283a82ce1371a6045a"
              : annex === 31
                ? "6ed4d632987966d783dd4f9128bd24ca9fd911f7c084545fe748fdc1da020f49"
                : "76f9728de35bd5b50ac68ee34866c13f13f97d2337438b2b48858ca35b65ebfd",
          );
        }
      }
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
