import { describe, expect, it } from "vitest";
import employeeValue from "../../rules/packages/reviewed/tvoed-vka-bt-k/2026-05-r3.json";
import type { RuleTariffPackage } from "./contracts.generated";
import { trainingCatalogFixture } from "./training-contract-test-fixtures";
import { validateRulePackage } from "./validation";
const employee = employeeValue as RuleTariffPackage;
const issueCodes = (value: unknown) => {
  const result = validateRulePackage(value);
  return result.ok ? [] : result.issues.map((issue) => issue.code);
};
describe("explicit training catalog contracts", () => {
  it.each([10, 11] as const)("validates synthetic training contract %i", (version) => {
    expect(validateRulePackage(trainingCatalogFixture(version))).toMatchObject({ ok: true });
  });
  it("retains the reviewed employee contract", () => {
    expect(validateRulePackage(employee)).toMatchObject({ ok: true });
  });
  it("rejects missing categories and undeclared years", () => {
    const pkg = trainingCatalogFixture();
    pkg.rules.trainingPay!.categories[0].years = [1, 2];
    expect(issueCodes(pkg)).toContain("UNDECLARED_TRAINING_YEAR");
    delete pkg.rules.trainingPay;
    expect(issueCodes(pkg)).toContain("MISSING_TRAINING_PAY");
  });
  it("requires every declared category/year exactly once", () => {
    const pkg = trainingCatalogFixture();
    pkg.rules.payTables[0].entries.pop();
    expect(issueCodes(pkg)).toContain("TRAINING_TABLE_INCOMPLETE");
    pkg.rules.trainingPay!.categories.push(structuredClone(pkg.rules.trainingPay!.categories[0]));
    expect(issueCodes(pkg)).toContain("DUPLICATE_TRAINING_CATEGORY");
  });
  it("rejects unknown sources", () => {
    const pkg = trainingCatalogFixture();
    pkg.rules.trainingPay!.categories[0].sourceIds = ["unknown-source"];
    expect(issueCodes(pkg)).toContain("UNKNOWN_SOURCE_ID");
  });
  it("never caps training years with employee steps", () => {
    const pkg = trainingCatalogFixture();
    pkg.rules.overtimeBaseRule = structuredClone(employee.rules.overtimeBaseRule);
    expect(issueCodes(pkg)).toContain("TRAINING_OVERTIME_BASIS_INVALID");
  });
  it("rejects foreign identity and missing annual capability", () => {
    const pkg = trainingCatalogFixture(11);
    pkg.packageId = "foreign-training";
    expect(issueCodes(pkg)).toContain("UNSUPPORTED_TARIFF_SELECTION");
    pkg.packageId = "tvaoed-pflege-vka";
    pkg.rules.selection!.capabilities.annualPayment = "UNSUPPORTED";
    expect(issueCodes(pkg)).toContain("MISSING_ANNUAL_PAYMENT");
  });
  it("rejects supported overtime without a training rate", () => {
    const pkg = trainingCatalogFixture();
    pkg.rules.selection!.capabilities.overtime = "SUPPORTED";
    expect(issueCodes(pkg)).toContain("TRAINING_OVERTIME_INCOMPLETE");
  });
  it("rejects employee condition/step premium bases", () => {
    const pkg = trainingCatalogFixture();
    pkg.rules.selection!.capabilities.timePremiums = "SUPPORTED";
    pkg.rules.premiumRules = structuredClone(employee.rules.premiumRules).filter(
      (rule) => rule.premiumType !== "OVERTIME",
    );
    expect(issueCodes(pkg)).toContain("TRAINING_PREMIUM_BASIS_INVALID");
  });
  it("rejects training data on employee contracts", () => {
    const pkg = structuredClone(employee);
    Object.assign(pkg.rules, { trainingPay: trainingCatalogFixture().rules.trainingPay });
    expect(issueCodes(pkg)).toContain("UNSUPPORTED_TRAINING_PAY");
  });
});
