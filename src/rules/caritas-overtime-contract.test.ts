import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { RuleTariffPackage } from "./contracts.generated";
import { validateRulePackage } from "./validation";

function candidate(): RuleTariffPackage {
  return JSON.parse(
    readFileSync(
      new URL(
        "../../rules/packages/reviewed/avr-caritas-p-mitte/2026-02-01-draft1.json",
        import.meta.url,
      ),
      "utf8",
    ),
  ) as RuleTariffPackage;
}

function withPolicy(): RuleTariffPackage {
  const pkg = candidate();
  pkg.rules.caritasOvertimePolicy = {
    validFrom: "2026-02-01",
    validTo: "2026-12-31",
    premiumReferenceStepId: "3",
    workPayMaximumStepId: "4",
    monthlyFactorThousandths: 4348,
    rateBands: [
      {
        groupIds: ["p4", "p6", "p7", "p8", "p9", "p10", "p11"],
        premiumBasisPoints: 3000,
      },
      { groupIds: ["p12", "p13", "p14", "p15", "p16"], premiumBasisPoints: 1500 },
    ],
    requiresConfirmedClassification: true,
    requiresSettlementChoice: true,
    timeConversionAllowed: true,
    sourceIds: ["caritas-avr-text-2026-03"],
  };
  return pkg;
}

function codes(pkg: RuleTariffPackage): string[] {
  const result = validateRulePackage(pkg);
  return result.ok ? [] : result.issues.map((issue) => issue.code);
}

describe("Caritas Anlage 31/32 overtime contract", () => {
  it("accepts the sourced rates but keeps pay unsupported pending personal facts", () => {
    const pkg = withPolicy();
    expect(validateRulePackage(pkg)).toEqual({ ok: true, value: pkg });
    expect(pkg.status).toBe("DRAFT");
    expect(pkg.rules.selection?.capabilities.overtime).toBe("UNSUPPORTED");
  });

  it("rejects missing, duplicate, incorrect, and unsupported P-group rates", () => {
    const missing = withPolicy();
    missing.rules.caritasOvertimePolicy!.rateBands[0].groupIds.pop();
    expect(codes(missing)).toContain("CARITAS_OVERTIME_RATE");

    const duplicate = withPolicy();
    duplicate.rules.caritasOvertimePolicy!.rateBands[1].groupIds.push("p11");
    expect(codes(duplicate)).toContain("CARITAS_OVERTIME_RATE");

    const wrongRate = withPolicy();
    wrongRate.rules.caritasOvertimePolicy!.rateBands[1].premiumBasisPoints = 3000;
    expect(codes(wrongRate)).toContain("CARITAS_OVERTIME_RATE");

    const p5 = withPolicy();
    p5.rules.caritasOvertimePolicy!.rateBands[0].groupIds.push("p5");
    expect(codes(p5)).toContain("CARITAS_OVERTIME_RATE");
  });

  it("rejects missing evidence, wrong contract, and dates outside reviewed coverage", () => {
    const source = withPolicy();
    source.rules.caritasOvertimePolicy!.sourceIds = [source.sources[0].id];
    expect(codes(source)).toContain("CARITAS_OVERTIME_SOURCE");

    const contract = withPolicy();
    contract.engineContractVersion = 12;
    expect(codes(contract)).toContain("CARITAS_OVERTIME_CONTRACT");

    const range = withPolicy();
    range.rules.caritasOvertimePolicy!.validTo = "2027-01-01";
    expect(codes(range)).toContain("CARITAS_OVERTIME_RANGE");
  });
});
