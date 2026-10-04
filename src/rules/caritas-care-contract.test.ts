import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import prior from "../../rules/packages/reviewed/tvl-kr-tdl/2026-04.json";
import type { RuleTariffPackage } from "./contracts.generated";
import { validateRulePackage } from "./validation";
import { resolveTariffSelection } from "./tariff-selection";
import { RULE_CATALOG_SUPPORTED_ENGINE_CONTRACT_VERSIONS } from "./rule-catalog-engine-support";

const rows = readFileSync(
  new URL("../../docs/caritas-p-mittelwerte-2025-2026.csv", import.meta.url),
  "utf8",
)
  .trim()
  .split(/\r?\n/)
  .slice(1)
  .map((row) => row.split(","));

// Synthetic contract fixture, not a regional source/review claim or publishable tariff package.
function fixture(region = "bw"): RuleTariffPackage {
  const sourceIds: [string] = [prior.sources[0].id];
  const pkg = {
    ...structuredClone(prior),
    engineContractVersion: 14,
    packageId: `avr-caritas-p-${region}`,
    versionId: "2026-02-test",
    validFrom: region === "ost" ? "2026-01-01" : "2026-02-01",
    validTo: "2026-12-31",
    rules: {
      selection: {
        familyId: "avr-caritas-p",
        engineId: "avr-caritas-p-v1",
        employmentKind: "EMPLOYEE",
        variants: [31, 32].map((annex) => ({
          id: `ANLAGE_${annex}`,
          label: `Anlage ${annex}`,
          specialPartId: `anlage-${annex}`,
          sourceIds,
          regions: [{ id: region.toUpperCase(), label: region, payTableId: "test-p", sourceIds }],
        })),
        capabilities: {
          basePay: "UNSUPPORTED",
          timePremiums: "UNSUPPORTED",
          allowances: "UNSUPPORTED",
          overtime: "UNSUPPORTED",
          annualPayment: "UNSUPPORTED",
        },
      },
      selector: {
        agreementId: "avr-caritas",
        specialPartIds: ["anlage-31", "anlage-32"],
        payTableId: "test-p",
      },
      payTables: [
        {
          id: "test-p",
          sourceIds,
          entries: rows
            .filter((row) => row[0] === "2026-02-01")
            .flatMap((row) =>
              row.slice(2).flatMap((amount, i) =>
                amount
                  ? [
                      {
                        groupId: row[1].toLowerCase(),
                        stepId: String(i + 1),
                        monthlyCents: Number(amount),
                      },
                    ]
                  : [],
              ),
            ),
        },
      ],
      premiumRules: [],
      allowanceRules: [],
      combinationRules: [],
      workPatternRules: [],
      workPatternPolicy: structuredClone(prior.rules.workPatternPolicy),
    },
  } as RuleTariffPackage;
  if (region === "ost") {
    const eastTable = structuredClone(pkg.rules.payTables[0]);
    eastTable.id = "test-p-east";
    // A synthetic one-cent sentinel proves that selection cannot silently reuse the West table.
    eastTable.entries.find(
      (entry) => entry.groupId === "p6" && entry.stepId === "1",
    )!.monthlyCents += 1;
    pkg.rules.payTables.push(eastTable);
    for (const variant of pkg.rules.selection!.variants)
      variant.regions = [
        { id: "OST_TARIF_OST", label: "Tarifgebiet Ost", payTableId: eastTable.id, sourceIds },
        {
          id: "OST_TARIF_WEST_BERLIN",
          label: "Tarifgebiet West · Berlin",
          payTableId: "test-p",
          sourceIds,
        },
        {
          id: "OST_TARIF_WEST_HAMBURG",
          label: "Tarifgebiet West · Hamburg",
          payTableId: "test-p",
          sourceIds,
        },
      ];
  }
  return pkg;
}

function rejects(change: (pkg: RuleTariffPackage) => void, code: string) {
  const pkg = fixture();
  change(pkg);
  const result = validateRulePackage(pkg);
  expect(result.ok).toBe(false);
  if (!result.ok) expect(result.issues.map((issue) => issue.code)).toContain(code);
}

function withWorkingTimes(pkg: RuleTariffPackage): RuleTariffPackage {
  const sourceIds = [pkg.sources[0].id];
  const rules = pkg.rules.selection!.variants.flatMap((variant) =>
    variant.regions.map((region) => ({
      id: `${variant.id.toLowerCase().replaceAll("_", "-")}-${region.id.toLowerCase().replaceAll("_", "-")}-time`,
      variantId: variant.id,
      regionId: region.id,
      validFrom: pkg.validFrom,
      validTo: pkg.validTo,
      fullTimeWeeklyMinutes:
        variant.id === "ANLAGE_32" || ["BW", "MITTE"].includes(region.id) ? 2340 : 2310,
      sourceIds,
    })),
  );
  pkg.rules.employmentWorkingTimeRules = rules as NonNullable<
    RuleTariffPackage["rules"]["employmentWorkingTimeRules"]
  >;
  return pkg;
}

describe("Caritas Pflege regional table contract", () => {
  it.each(["bw", "bayern", "mitte", "nord", "nrw", "ost"])(
    "accepts explicit regional identity %s, without claiming calculation",
    (region) => {
      const pkg = fixture(region);
      expect(validateRulePackage(pkg)).toEqual({ ok: true, value: pkg });
      for (const annex of [31, 32]) {
        const regionId = region === "ost" ? "OST_TARIF_OST" : region.toUpperCase();
        const selection = resolveTariffSelection(pkg, `ANLAGE_${annex}`, regionId);
        expect(selection?.capabilities.basePay).toBe("UNSUPPORTED");
        expect(selection?.groups.find((g) => g.id === "p4")?.levels).toEqual([
          "1",
          "2",
          "3",
          "4",
          "5",
          "6",
        ]);
        expect(selection?.groups.some((g) => g.id === "p5")).toBe(false);
        expect(selection?.groups.find((g) => g.id === "p7")?.levels).toEqual([
          "2",
          "3",
          "4",
          "5",
          "6",
        ]);
      }
      expect(resolveTariffSelection(pkg, "ANLAGE_31", "UNSPECIFIED")).toBeNull();
    },
  );
  it("does not enable remote activation merely by accepting the schema", () => {
    expect([...RULE_CATALOG_SUPPORTED_ENGINE_CONTRACT_VERSIONS] as number[]).not.toContain(14);
  });
  it.each(["bw", "bayern", "mitte", "nord", "nrw", "ost"])(
    "accepts complete, source-bound 2026 working times for %s without enabling salary",
    (region) => {
      const pkg = withWorkingTimes(fixture(region));
      expect(validateRulePackage(pkg)).toEqual({ ok: true, value: pkg });
      expect(pkg.rules.selection!.capabilities.basePay).toBe("UNSUPPORTED");
    },
  );
  it("rejects missing regional working-time coverage", () =>
    rejects((p) => {
      withWorkingTimes(p).rules.employmentWorkingTimeRules!.pop();
    }, "CARITAS_WORKING_TIME_COVERAGE"));
  it("rejects a foreign weekly time and source", () => {
    rejects((p) => {
      withWorkingTimes(p).rules.employmentWorkingTimeRules![0].fullTimeWeeklyMinutes = 2400;
    }, "CARITAS_WORKING_TIME_VALUE");
    rejects((p) => {
      withWorkingTimes(p).rules.employmentWorkingTimeRules![0].sourceIds = ["unknown"];
    }, "UNKNOWN_SOURCE_ID");
  });
  it("rejects a date gap and a duplicate id", () => {
    rejects((p) => {
      withWorkingTimes(p).rules.employmentWorkingTimeRules![0].validFrom = "2026-02-02";
    }, "CARITAS_WORKING_TIME_COVERAGE");
    rejects((p) => {
      const rules = withWorkingTimes(p).rules.employmentWorkingTimeRules!;
      rules[1].id = rules[0].id;
    }, "CARITAS_WORKING_TIME_ID");
  });
  it("does not conflate Berlin and Hamburg in Ost tariff territory West before July 2025", () =>
    rejects((p) => {
      p.packageId = "avr-caritas-p-ost";
      p.validFrom = "2025-01-01";
      p.validTo = "2025-12-31";
      for (const variant of p.rules.selection!.variants)
        variant.regions = [
          { id: "OST_TARIF_OST", label: "Ost", payTableId: "test-p", sourceIds: [p.sources[0].id] },
          {
            id: "OST_TARIF_WEST",
            label: "West",
            payTableId: "test-p",
            sourceIds: [p.sources[0].id],
          },
        ];
      withWorkingTimes(p);
    }, "CARITAS_WORKING_TIME_TERRITORY_AMBIGUOUS"));
  it.each(["basePay", "timePremiums", "allowances", "overtime", "annualPayment"] as const)(
    "rejects premature %s support",
    (capability) => {
      rejects((p) => {
        p.rules.selection!.capabilities[capability] = "SUPPORTED";
      }, "CARITAS_COMPONENT_COVERAGE");
    },
  );
  it("rejects a renamed TV-L identity", () =>
    rejects((p) => {
      p.rules.selection!.engineId = "tvl-kr-v1";
    }, "CARITAS_IDENTITY"));
  it("rejects the old engine contract", () =>
    rejects((p) => {
      p.engineContractVersion = 12;
    }, "CARITAS_CONTRACT"));
  it("rejects mixed regional tables", () =>
    rejects((p) => {
      p.rules.selection!.variants[0].regions[0].id = "OST";
    }, "CARITAS_REGION"));
  it("selects distinct Ost tariff territories by annex and declared table", () => {
    const pkg = fixture("ost");
    const east = resolveTariffSelection(pkg, "ANLAGE_32", "OST_TARIF_OST");
    const west = resolveTariffSelection(pkg, "ANLAGE_32", "OST_TARIF_WEST_BERLIN");
    expect(east?.region.payTableId).toBe("test-p-east");
    expect(west?.region.payTableId).toBe("test-p");
    expect(
      pkg.rules.payTables.find((table) => table.id === east?.region.payTableId)?.entries,
    ).not.toEqual(
      pkg.rules.payTables.find((table) => table.id === west?.region.payTableId)?.entries,
    );
  });
  it("rejects a missing annex-territory table mapping", () =>
    rejects((p) => {
      delete p.rules.selection!.variants[0].regions[0].payTableId;
    }, "CARITAS_TABLE_MAPPING"));
  it("rejects a dangling regional table mapping", () =>
    rejects((p) => {
      p.rules.selection!.variants[0].regions[0].payTableId = "missing";
    }, "UNKNOWN_SELECTION_PAY_TABLE"));
  it("rejects a table that no annex-territory selects", () =>
    rejects((p) => {
      const spare = structuredClone(p.rules.payTables[0]);
      spare.id = "spare";
      p.rules.payTables.push(spare);
    }, "CARITAS_UNREFERENCED_TABLE"));
  it("rejects an unnamed national package", () =>
    rejects((p) => {
      p.packageId = "avr-caritas-p";
    }, "CARITAS_IDENTITY"));
  it("rejects a missing annex", () =>
    rejects((p) => {
      p.rules.selection!.variants.pop();
    }, "CARITAS_VARIANTS"));
  it("rejects duplicate annexes", () =>
    rejects((p) => {
      p.rules.selection!.variants[1] = structuredClone(p.rules.selection!.variants[0]);
    }, "CARITAS_VARIANTS"));
  it("rejects P5", () =>
    rejects((p) => {
      p.rules.payTables[0].entries[0].groupId = "p5";
    }, "CARITAS_TABLE_ENTRY"));
  it("rejects P7 stage 1", () =>
    rejects((p) => {
      p.rules.payTables[0].entries[12].stepId = "1";
    }, "CARITAS_TABLE_ENTRY"));
  it("rejects a missing value", () =>
    rejects((p) => {
      p.rules.payTables[0].entries.pop();
    }, "CARITAS_TABLE_INCOMPLETE"));
  it("rejects zero as missing salary", () =>
    rejects((p) => {
      p.rules.payTables[0].entries[0].monthlyCents = 0;
    }, "CARITAS_TABLE_ENTRY"));
  it("rejects foreign calculation policies", () =>
    rejects((p) => {
      p.rules.tvlOvertimePolicy = structuredClone(prior.rules.tvlOvertimePolicy) as NonNullable<
        RuleTariffPackage["rules"]["tvlOvertimePolicy"]
      >;
    }, "CARITAS_UNSUPPORTED_RULES"));
  it.each([null, "2027-01-01"])("rejects unverified transition %s", (end) =>
    rejects((p) => {
      p.validTo = end;
    }, "CARITAS_2027_TRANSITION"),
  );
});
