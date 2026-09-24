import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { RuleTariffPackage } from "./contracts.generated";
import { validateRulePackage } from "./validation";

function pkg(year: 2025 | 2026): RuleTariffPackage {
  return JSON.parse(
    readFileSync(
      new URL(
        `../../rules/packages/reviewed/avr-caritas-p-ost/${year}-01-draft1.json`,
        import.meta.url,
      ),
      "utf8",
    ),
  ) as RuleTariffPackage;
}

function sourceValues(year: 2025 | 2026, table: string | null): Map<string, number> {
  const name = `../../docs/caritas-p-ost-${year}.csv`;
  const rows = readFileSync(new URL(name, import.meta.url), "utf8")
    .trim()
    .split(/\r?\n/u)
    .slice(1)
    .map((line) => line.split(","));
  return new Map(
    rows
      .filter((row) => year === 2026 || row[1] === table)
      .flatMap((row) => {
        const group = row[year === 2025 ? 2 : 1].toLowerCase();
        return row
          .slice(year === 2025 ? 3 : 2)
          .flatMap((amount, index) =>
            amount === "" ? [] : [[`${group}:${index + 1}`, Number(amount)] as const],
          );
      }),
  );
}

function packageValues(pkg: RuleTariffPackage, tableId: string): Map<string, number> {
  const table = pkg.rules.payTables.find((entry) => entry.id === tableId);
  expect(table).toBeDefined();
  return new Map(
    table?.entries.map((entry) => [`${entry.groupId}:${entry.stepId}`, entry.monthlyCents]) ?? [],
  );
}

describe("RK Ost Caritas P-table DRAFT candidates", () => {
  it.each([2025, 2026] as const)("validates the %s package and printed P values", (year) => {
    const candidate = pkg(year);
    expect(validateRulePackage(candidate)).toEqual({ ok: true, value: candidate });
    expect(candidate.packageId).toBe("avr-caritas-p-ost");
    expect(candidate.engineContractVersion).toBe(14);
    expect(candidate.status).toBe("DRAFT");
    expect([candidate.validFrom, candidate.validTo]).toEqual([`${year}-01-01`, `${year}-12-31`]);
    expect(candidate.sources.map((source) => source.id).sort()).toEqual(
      [
        `caritas-rk-ost-${year}-p`,
        "pflegeshift-tariff-assessment-v1",
        "caritas-rk-ost-time-2022",
        ...(year === 2026 ? ["caritas-dgs-ost-hospital-time-2026"] : []),
      ].sort(),
    );
    expect(candidate.rules.selection?.variants.map((variant) => variant.id)).toEqual([
      "ANLAGE_31",
      "ANLAGE_32",
    ]);
    expect(
      Object.values(candidate.rules.selection?.capabilities ?? {}).every(
        (value) => value === "UNSUPPORTED",
      ),
    ).toBe(true);
    expect(candidate.rules.workPatternPolicy.sourceIds).toEqual([
      "pflegeshift-tariff-assessment-v1",
    ]);
    const common = sourceValues(year, year === 2025 ? "COMMON" : null);
    expect(common.size).toBe(62);
    expect(packageValues(candidate, `caritas-ost-p-${year}-common`)).toEqual(common);
    if (year === 2025) {
      const special = sourceValues(2025, "ANLAGE_32_TARIF_OST");
      expect(special.size).toBe(62);
      expect(packageValues(candidate, "caritas-ost-p-2025-annex32-east")).toEqual(special);
      expect(special.get("p6:1")).not.toBe(common.get("p6:1"));
    }
  });

  it.each([2025, 2026] as const)("binds dated working time and sources for %s", (year) => {
    const candidate = pkg(year);
    const workingTimes = candidate.rules.employmentWorkingTimeRules ?? [];
    expect(workingTimes).toHaveLength(year === 2025 ? 7 : 6);
    expect(
      candidate.sources.find((source) => source.id === "caritas-rk-ost-time-2022")?.sha256,
    ).toBe("b8b3eff8f6c35445db0fc3e766bf1791b60989331d65ac4c7c37a01aefea0fcb");
    if (year === 2026) {
      expect(
        candidate.sources.find((source) => source.id === "caritas-dgs-ost-hospital-time-2026")
          ?.sha256,
      ).toBe("a5616c3563657de77c4dad24c8f14861ad70a3537a5c5194d773848e8ba22c9b");
    }
    for (const variant of candidate.rules.selection?.variants ?? []) {
      for (const region of variant.regions) {
        const rules = workingTimes.filter(
          (rule) => rule.variantId === variant.id && rule.regionId === region.id,
        );
        const berlinTransition =
          year === 2025 && variant.id === "ANLAGE_31" && region.id === "OST_TARIF_WEST_BERLIN";
        expect(
          rules.map((rule) => [rule.validFrom, rule.validTo, rule.fullTimeWeeklyMinutes]),
        ).toEqual(
          berlinTransition
            ? [
                ["2025-01-01", "2025-06-30", 2340],
                ["2025-07-01", "2025-12-31", 2310],
              ]
            : [[`${year}-01-01`, `${year}-12-31`, variant.id === "ANLAGE_32" ? 2340 : 2310]],
        );
        for (const rule of rules) {
          expect(rule.sourceIds).toEqual(
            year === 2026 && variant.id === "ANLAGE_31" && region.id === "OST_TARIF_OST"
              ? ["caritas-rk-ost-time-2022", "caritas-dgs-ost-hospital-time-2026"]
              : ["caritas-rk-ost-time-2022"],
          );
        }
      }
    }
  });

  it("maps the 2025 Anlage 32 eastern territory to its separate printed table", () => {
    const candidate = pkg(2025);
    for (const variant of candidate.rules.selection?.variants ?? []) {
      expect(variant.regions.map((region) => region.id)).toEqual([
        "OST_TARIF_OST",
        "OST_TARIF_WEST_BERLIN",
        "OST_TARIF_WEST_HAMBURG",
      ]);
      for (const region of variant.regions) {
        const special = variant.id === "ANLAGE_32" && region.id === "OST_TARIF_OST";
        expect(region.payTableId).toBe(
          special ? "caritas-ost-p-2025-annex32-east" : "caritas-ost-p-2025-common",
        );
      }
    }
  });

  it("maps every 2026 annex and territory to the common printed table", () => {
    const candidate = pkg(2026);
    expect(candidate.rules.payTables).toHaveLength(1);
    for (const variant of candidate.rules.selection?.variants ?? []) {
      expect(variant.regions).toHaveLength(3);
      expect(
        variant.regions.every((region) => region.payTableId === "caritas-ost-p-2026-common"),
      ).toBe(true);
    }
  });
});
