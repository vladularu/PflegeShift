import employeeValue from "../../rules/packages/reviewed/tvoed-vka-bt-k/2026-05-r3.json";
import type { RuleAnnualPaymentRule, RuleTariffPackage } from "./contracts.generated";

/** Synthetische Beträge, keine Tarifquelle und keine App-Aktivierung. */
export function trainingCatalogFixture(version: 10 | 11 = 10): RuleTariffPackage {
  const pkg = structuredClone(employeeValue) as RuleTariffPackage;
  pkg.packageId = "tvaoed-pflege-vka";
  pkg.versionId = "synthetic-training-2026";
  pkg.status = "DRAFT";
  pkg.review = {
    status: "DRAFT",
    reviewedBy: null,
    reviewedAt: null,
    gitCommit: null,
  };
  pkg.engineContractVersion = version;
  const selection = pkg.rules.selection!;
  selection.familyId = "tvaoed-pflege";
  selection.engineId = "tvaoed-pflege-v1";
  selection.employmentKind = "APPRENTICE";
  selection.capabilities = {
    basePay: "SUPPORTED",
    timePremiums: "UNSUPPORTED",
    allowances: "UNSUPPORTED",
    overtime: "UNSUPPORTED",
    annualPayment: version === 11 ? "SUPPORTED" : "UNSUPPORTED",
  };
  pkg.rules.selector.agreementId = "tvaoed-vka";
  pkg.rules.payTables[0].entries = [1, 2, 3].map((year) => ({
    groupId: "b",
    stepId: "s" + year,
    monthlyCents: 150000,
  })) as RuleTariffPackage["rules"]["payTables"][0]["entries"];
  const sourceIds = selection.variants[0].sourceIds;
  pkg.rules.trainingPay = {
    categories: [{ groupId: "b", label: "Synthetische Ausbildung", years: [1, 2, 3], sourceIds }],
    minimumNightHourlyCents: 100,
    sourceIds,
  };
  delete pkg.rules.overtimeBaseRule;
  pkg.rules.premiumRules = [];
  pkg.rules.allowanceRules = [];
  pkg.rules.combinationRules = [];
  delete pkg.rules.annualPaymentRules;
  if (version === 11) {
    const annual = selection.variants.map((variant): RuleAnnualPaymentRule => ({
      id: "synthetic-annual-" + variant.id.toLowerCase().replaceAll("_", "-"),
      variantId: variant.id,
      regionIds: ["OTHER", "KAV_BW"],
      payGroups: ["b"],
      firstEntitlementYear: 2026,
      lastEntitlementYear: 2026,
      rateBasisPoints: 9000,
      referenceMonths: [8, 9, 10],
      lateEntryAfterMonth: 10,
      payoutMonth: 11,
      basisPolicy: "TVAOED_PFLEGE_14",
      reductionPolicy: "TVAOED_PFLEGE_14",
      eligibilityPolicy: "TRAINING_OR_DIRECT_TAKEOVER_DECEMBER_1",
      earlyExitBasis: "NONE",
      sourceIds,
    }));
    pkg.rules.annualPaymentRules = [annual[0], ...annual.slice(1)];
  }
  return pkg;
}
