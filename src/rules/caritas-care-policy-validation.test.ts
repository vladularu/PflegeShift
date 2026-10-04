import { describe, expect, it } from "vitest";
import baseValue from "../../rules/packages/reviewed/avr-caritas-p-bw/2026-02-01-draft1.json";
import policies from "../testing/fixtures/caritas-care-policies-2026.json";
import type { RuleTariffPackage } from "./contracts.generated";
import { validateRulePackage } from "./validation";

function fixture(): RuleTariffPackage {
  const pkg = structuredClone(baseValue) as RuleTariffPackage;
  Object.assign(pkg.rules, structuredClone(policies.rules));
  pkg.sources.push(
    ...policies.sources.filter((source) => !pkg.sources.some((s) => s.id === source.id)),
  );
  return pkg;
}
function errors(pkg: RuleTariffPackage): string[] {
  const result = validateRulePackage(pkg);
  expect(result.ok).toBe(false);
  return result.ok ? [] : result.issues.map((issue) => issue.code);
}
const fields = [
  "caritasTimePremiumPolicy",
  "caritasOvertimePolicy",
  "caritasAnnualPaymentPolicy",
] as const;

describe("sourced Caritas policy compatibility without activating components", () => {
  it("accepts all three original policies alongside the existing dated rates and annual terms", () => {
    const pkg = fixture();
    expect(validateRulePackage(pkg)).toMatchObject({ ok: true });
    expect(pkg.status).toBe("DRAFT");
    expect(Object.values(pkg.rules.selection!.capabilities)).toEqual(Array(5).fill("UNSUPPORTED"));
    expect(pkg.rules.caritasTimePremiumRates).toEqual(baseValue.rules.caritasTimePremiumRates);
    expect(pkg.rules.caritasAnnualPaymentRules).toEqual(baseValue.rules.caritasAnnualPaymentRules);
  });
  it.each(fields)("rejects %s coverage outside the sourced package", (field) => {
    const pkg = fixture();
    Object.assign(pkg.rules[field]!, { validTo: "2027-01-01" });
    expect(errors(pkg).some((code) => code.endsWith("_RANGE"))).toBe(true);
  });
  it.each(fields)("requires known sources for %s", (field) => {
    const pkg = fixture();
    Object.assign(pkg.rules[field]!, { sourceIds: ["unknown-primary-source"] });
    expect(errors(pkg)).toContain("UNKNOWN_SOURCE_ID");
  });
  it("rejects foreign engine identity even when policy data looks valid", () => {
    const pkg = fixture();
    Object.assign(pkg, { engineContractVersion: 13 });
    expect(errors(pkg)).toContain("CARITAS_CONTRACT");
  });
  it("rejects a repeated overtime group instead of applying a second rate", () => {
    const pkg = fixture();
    pkg.rules.caritasOvertimePolicy!.rateBands[1].groupIds.push("p4");
    expect(errors(pkg)).toContain("CARITAS_OVERTIME_RATE");
  });
  it("rejects a missing annual band group", () => {
    const pkg = fixture();
    pkg.rules.caritasAnnualPaymentPolicy!.rateBands[0].groupIds.pop();
    expect(errors(pkg)).toContain("CARITAS_ANNUAL_RATE");
  });
});
