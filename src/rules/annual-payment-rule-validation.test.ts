import { describe, expect, it } from "vitest";
import { annualPaymentCandidate } from "./annual-payment-test-fixtures";
import { RULE_CATALOG_SUPPORTED_ENGINE_CONTRACT_VERSIONS } from "./rule-catalog-engine-support";
import { validateRulePackage } from "./validation";
import type { RuleAnnualPaymentRule, RuleTariffPackage } from "./contracts.generated";

describe("annual payment contract 11", () => {
  it.each([false, true])(
    "validates synthetic terms, training=%s, while keeping drafts unpublished",
    (training) => {
      const pkg = annualPaymentCandidate(training);
      expect(validateRulePackage(pkg)).toMatchObject({ ok: true });
      expect(pkg.review.status).toBe("DRAFT");
      expect(RULE_CATALOG_SUPPORTED_ENGINE_CONTRACT_VERSIONS).toContain(11);
    },
  );
  it.each([1, 2, 3, 8, 10])("rejects hidden annual terms in contract %s", (version) => {
    const pkg = annualPaymentCandidate(version === 10);
    Object.assign(pkg, { engineContractVersion: version });
    expect(validateRulePackage(pkg).ok).toBe(false);
  });
  const invalid: [string, (r: RuleAnnualPaymentRule, p: RuleTariffPackage) => void][] = [
    [
      "unknown source",
      (r) => {
        r.sourceIds = ["missing"];
      },
    ],
    [
      "unknown variant",
      (r) => {
        r.variantId = "UNKNOWN";
      },
    ],
    [
      "unknown region",
      (r) => {
        r.regionIds = ["UNKNOWN"];
      },
    ],
    [
      "unknown group",
      (r) => {
        r.payGroups = ["unknown"];
      },
    ],
    [
      "missing group",
      (r) => {
        r.payGroups.pop();
      },
    ],
    [
      "missing region",
      (r) => {
        r.regionIds.pop();
      },
    ],
    [
      "missing variant",
      (_, p) => {
        Object.assign(p.rules, {
          annualPaymentRules: p.rules.annualPaymentRules!.filter((r) => r.variantId !== "BT_B"),
        });
      },
    ],
    [
      "duplicate rule",
      (r, p) => {
        p.rules.annualPaymentRules!.push(structuredClone(r));
      },
    ],
    [
      "overlapping scope",
      (r, p) => {
        p.rules.annualPaymentRules!.push({ ...r, id: "overlap" });
      },
    ],
    [
      "inverted years",
      (r) => {
        r.lastEntitlementYear = 2025;
      },
    ],
    [
      "year before package",
      (r) => {
        r.firstEntitlementYear = 2025;
      },
    ],
    [
      "year after package",
      (r) => {
        r.lastEntitlementYear = 2040;
      },
    ],
    [
      "unordered months",
      (r) => {
        r.referenceMonths.reverse();
      },
    ],
    [
      "nonconsecutive months",
      (r) => {
        r.referenceMonths = [5, 7, 9];
      },
    ],
    [
      "late entry mismatch",
      (r) => {
        r.lateEntryAfterMonth = 1;
      },
    ],
    [
      "payment before basis",
      (r) => {
        r.payoutMonth = 6;
      },
    ],
    [
      "training basis on employee",
      (r) => {
        r.basisPolicy = "TVAOED_PFLEGE_14";
      },
    ],
    [
      "different reduction",
      (r) => {
        r.reductionPolicy = "TVAOED_PFLEGE_14";
      },
    ],
    [
      "lost early exit",
      (r) => {
        r.eligibilityPolicy = "EMPLOYED_DECEMBER_1";
      },
    ],
    [
      "lost exit basis",
      (r) => {
        r.earlyExitBasis = "NONE";
      },
    ],
    [
      "wrong family",
      (_, p) => {
        p.rules.selection!.familyId = "unknown";
      },
    ],
    [
      "unsupported capability",
      (_, p) => {
        p.rules.selection!.capabilities.annualPayment = "UNSUPPORTED";
      },
    ],
    [
      "no rules",
      (_, p) => {
        delete p.rules.annualPaymentRules;
      },
    ],
    [
      "unknown code",
      (r) => {
        Object.assign(r, { formula: "eval(1)" });
      },
    ],
    [
      "personal data",
      (r) => {
        Object.assign(r, { actualGrossCents: 100 });
      },
    ],
    [
      "fractional rate",
      (r) => {
        r.rateBasisPoints = 9000.5;
      },
    ],
    [
      "invalid rate",
      (r) => {
        r.rateBasisPoints = -1;
      },
    ],
    [
      "empty months",
      (r) => {
        Object.assign(r, { referenceMonths: [] });
      },
    ],
  ];
  it.each(invalid)("rejects %s", (_, mutate) => {
    const pkg = annualPaymentCandidate();
    mutate(pkg.rules.annualPaymentRules![0], pkg);
    expect(validateRulePackage(pkg).ok).toBe(false);
  });
  it("does not transfer the hospital exception to care homes or training", () => {
    for (const training of [false, true]) {
      const pkg = annualPaymentCandidate(training);
      const rule = pkg.rules.annualPaymentRules!.find((r) => r.variantId === "BT_B")!;
      rule.eligibilityPolicy = "BT_K_EARLY_EXIT";
      rule.earlyExitBasis = "LAST_FULL_MONTH_TABLE_AND_FIXED_ALLOWANCES";
      expect(validateRulePackage(pkg).ok).toBe(false);
    }
  });
  it("permits a rate change in consecutive years, never an overlapping or missing year", () => {
    const pkg = annualPaymentCandidate();
    pkg.validTo = "2029-12-31";
    const previous = pkg.rules.annualPaymentRules!;
    pkg.rules.annualPaymentRules = [
      ...previous,
      ...previous.map((r) => ({
        ...r,
        id: r.id + "-new",
        firstEntitlementYear: 2027,
        lastEntitlementYear: 2029,
        rateBasisPoints: 8000,
      })),
    ];
    expect(validateRulePackage(pkg).ok).toBe(true);
    pkg.rules.annualPaymentRules.at(-1)!.firstEntitlementYear = 2028;
    expect(validateRulePackage(pkg).ok).toBe(false);
  });
  it("rejects retired descriptive contract 8 even after removing annual terms", () => {
    const pkg = annualPaymentCandidate();
    Reflect.set(pkg, "engineContractVersion", 8);
    delete pkg.rules.annualPaymentRules;
    expect(validateRulePackage(pkg)).toMatchObject({
      ok: false,
      issues: expect.arrayContaining([
        expect.objectContaining({ code: "SCHEMA_ENUM", path: "/engineContractVersion" }),
      ]),
    });
  });
  it("retains mandatory training table and overtime checks in contract 11", () => {
    const pkg = annualPaymentCandidate(true);
    pkg.rules.payTables[0].entries.pop();
    expect(validateRulePackage(pkg).ok).toBe(false);
    const noTraining = annualPaymentCandidate(true);
    delete noTraining.rules.trainingPay;
    expect(validateRulePackage(noTraining).ok).toBe(false);
  });
});
