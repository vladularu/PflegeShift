import { describe, expect, it } from "vitest";
import prior from "../../rules/examples/tariff-package.valid.json";
import type { RuleTariffPackage } from "./contracts.generated";
import { RULE_CATALOG_SUPPORTED_ENGINE_CONTRACT_VERSIONS } from "./rule-catalog-engine-support";
import { resolveTariffSelection } from "./tariff-selection";
import { validateRulePackage } from "./validation";

const groups = [4, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16] as const;
const regions = ["bw", "bayern", "mitte", "nord", "nrw", "ost"] as const;
const sourceIds = [prior.sources[0].id];

function table(id: string) {
  return {
    id,
    sourceIds,
    entries: groups.flatMap((group) =>
      Array.from({ length: group <= 6 ? 6 : 5 }, (_, index) => {
        const step = group <= 6 ? index + 1 : index + 2;
        return {
          groupId: `p${group}`,
          stepId: String(step),
          monthlyCents: 200000 + group * 1000 + step,
        };
      }),
    ),
  };
}

// Synthetic structural fixture. Amounts and source identity are not Caritas pay claims.
function fixture(region: (typeof regions)[number] = "bw"): RuleTariffPackage {
  const east = region === "ost";
  const territoryIds = east
    ? ["OST_TARIF_OST", "OST_TARIF_WEST_BERLIN", "OST_TARIF_WEST_HAMBURG"]
    : [region.toUpperCase()];
  return {
    ...structuredClone(prior),
    engineContractVersion: 14,
    packageId: `avr-caritas-p-${region}`,
    versionId: east ? "2025-01-draft1" : "2025-07-01-draft1",
    status: "DRAFT",
    validFrom: east ? "2025-01-01" : "2025-07-01",
    validTo: east ? "2025-12-31" : "2026-01-31",
    review: { status: "DRAFT", reviewedBy: null, reviewedAt: null, gitCommit: null },
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
          regions: territoryIds.map((id) => ({
            id,
            label: id,
            payTableId: id === "OST_TARIF_OST" ? "p-east" : "p-common",
            sourceIds,
          })),
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
        payTableId: "p-common",
      },
      payTables: east ? [table("p-common"), table("p-east")] : [table("p-common")],
      premiumRules: [],
      allowanceRules: [],
      combinationRules: [],
      workPatternRules: [],
      workPatternPolicy: structuredClone(prior.rules.workPatternPolicy),
    },
  } as RuleTariffPackage;
}

function issueCodes(pkg: RuleTariffPackage): string[] {
  const result = validateRulePackage(pkg);
  expect(result.ok).toBe(false);
  return result.ok ? [] : result.issues.map((item) => item.code);
}

describe("Caritas P table-only contract 14", () => {
  it.each(regions)("accepts a sourced period and explicit selection for %s", (region) => {
    const pkg = fixture(region);
    expect(validateRulePackage(pkg)).toEqual({ ok: true, value: pkg });
    const territory = region === "ost" ? "OST_TARIF_OST" : region.toUpperCase();
    const selection = resolveTariffSelection(pkg, "ANLAGE_31", territory);
    expect(selection?.groups.find((group) => group.id === "p4")?.levels).toEqual([
      "1",
      "2",
      "3",
      "4",
      "5",
      "6",
    ]);
    expect(selection?.groups.find((group) => group.id === "p7")?.levels).toEqual([
      "2",
      "3",
      "4",
      "5",
      "6",
    ]);
    expect(selection?.groups.some((group) => group.id === "p5")).toBe(false);
    expect(selection?.capabilities.basePay).toBe("UNSUPPORTED");
  });

  it("keeps Ost territory table mappings distinct", () => {
    const pkg = fixture("ost");
    expect(resolveTariffSelection(pkg, "ANLAGE_32", "OST_TARIF_OST")?.region.payTableId).toBe(
      "p-east",
    );
    expect(
      resolveTariffSelection(pkg, "ANLAGE_32", "OST_TARIF_WEST_BERLIN")?.region.payTableId,
    ).toBe("p-common");
  });

  it.each([
    ["bw", "2026-02-01", "2026-12-31"],
    ["ost", "2026-01-01", "2026-12-31"],
  ] as const)("accepts the separate 2026 period for %s", (region, start, end) => {
    const pkg = fixture(region);
    pkg.validFrom = start;
    pkg.validTo = end;
    expect(validateRulePackage(pkg)).toEqual({ ok: true, value: pkg });
  });

  it("rejects an absent P value and an invented P5 value", () => {
    const missing = fixture();
    missing.rules.payTables[0].entries.pop();
    expect(issueCodes(missing)).toContain("CARITAS_TABLE_INCOMPLETE");
    const invented = fixture();
    invented.rules.payTables[0].entries.push({ groupId: "p5", stepId: "1", monthlyCents: 200000 });
    expect(issueCodes(invented)).toContain("CARITAS_TABLE_ENTRY");
  });

  it("rejects an implicit table mapping, supported pay, and foreign calculation rules", () => {
    const mapping = fixture();
    delete mapping.rules.selection!.variants[0].regions[0].payTableId;
    expect(issueCodes(mapping)).toContain("CARITAS_TABLE_MAPPING");
    const capability = fixture();
    capability.rules.selection!.capabilities.basePay = "SUPPORTED";
    expect(issueCodes(capability)).toContain("CARITAS_CAPABILITIES");
    const foreign = fixture();
    foreign.rules.premiumRules = structuredClone((prior as RuleTariffPackage).rules.premiumRules);
    expect(issueCodes(foreign)).toContain("CARITAS_FOREIGN_RULES");
  });

  it("rejects wrong periods and reviewed status, and keeps remote activation blocked", () => {
    const period = fixture();
    period.validTo = "2027-03-31";
    expect(issueCodes(period)).toContain("CARITAS_TABLE_PERIOD");
    const reviewed = fixture();
    reviewed.status = "REVIEWED";
    expect(issueCodes(reviewed)).toContain("CARITAS_DRAFT_ONLY");
    expect([...RULE_CATALOG_SUPPORTED_ENGINE_CONTRACT_VERSIONS] as number[]).not.toContain(14);
  });

  it("rejects a Caritas identity assigned to an older tariff contract", () => {
    const pkg = fixture();
    pkg.engineContractVersion = 11;
    expect(issueCodes(pkg)).toContain("CARITAS_CONTRACT");
  });
});
