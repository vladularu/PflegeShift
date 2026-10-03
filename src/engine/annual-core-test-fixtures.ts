import employeeValue from "../../rules/packages/reviewed/tvoed-vka-bt-k/2026-05-r3.json";
import type { RuleAnnualPaymentRule, RuleTariffPackage } from "@/rules/contracts.generated";
function nonempty<T>(values: readonly T[]): [T, ...T[]] {
  if (values.length === 0) throw new Error("Expected nonempty test fixture");
  return [values[0], ...values.slice(1)];
}
/** Synthetic annual arithmetic inputs only; no training rate dataset or catalog activation. */
export function annualPaymentCandidate(training = false): RuleTariffPackage {
  const pkg = structuredClone(employeeValue) as RuleTariffPackage;
  if (training) {
    pkg.packageId = "synthetic-training-annual";
    pkg.versionId = "synthetic-2026";
    pkg.status = "DRAFT";
    pkg.rules.selector.agreementId = "tvaoed-vka";
    pkg.rules.selection = {
      ...pkg.rules.selection!,
      familyId: "tvaoed-pflege",
      engineId: "tvaoed-pflege-v1",
      employmentKind: "APPRENTICE",
      capabilities: {
        basePay: "UNSUPPORTED",
        timePremiums: "UNSUPPORTED",
        allowances: "UNSUPPORTED",
        overtime: "UNSUPPORTED",
        annualPayment: "SUPPORTED",
      },
    };
    pkg.rules.payTables = [
      {
        ...pkg.rules.payTables[0],
        entries: [
          { groupId: "b", stepId: "s1", monthlyCents: 150000 },
          { groupId: "b", stepId: "s2", monthlyCents: 150000 },
          { groupId: "b", stepId: "s3", monthlyCents: 150000 },
        ],
      },
    ];
    pkg.rules.trainingPay = {
      categories: [
        {
          groupId: "b",
          label: "Synthetic training",
          years: [1, 2, 3],
          sourceIds: [...pkg.rules.selection.variants[0].sourceIds],
        },
      ],
      minimumNightHourlyCents: 100,
      sourceIds: [...pkg.rules.selection.variants[0].sourceIds],
    };
    delete pkg.rules.overtimeBaseRule;
    pkg.rules.allowanceRules = [];
    pkg.rules.premiumRules = [];
    pkg.rules.combinationRules = [];
  }
  pkg.engineContractVersion = 11;
  pkg.rules.selection!.capabilities.annualPayment = "SUPPORTED";
  const groups = [...new Set(pkg.rules.payTables[0].entries.map((entry) => entry.groupId))];
  pkg.rules.annualPaymentRules = nonempty(
    pkg.rules.selection!.variants.flatMap((variant) => {
      const bands = training
        ? [groups]
        : [
            groups.filter((id) => Number(id.slice(1)) <= 8),
            groups.filter((id) => Number(id.slice(1)) >= 9),
          ];
      return bands.map((payGroups, index): RuleAnnualPaymentRule => ({
        id: variant.id.toLowerCase().replace("_", "-") + "-annual-" + index,
        variantId: variant.id,
        regionIds: nonempty(variant.regions.map((region) => region.id)),
        payGroups: nonempty(payGroups),
        firstEntitlementYear: 2026,
        lastEntitlementYear: 2026,
        rateBasisPoints: index === 0 ? 9000 : 8500,
        referenceMonths: training ? [8, 9, 10] : [7, 8, 9],
        lateEntryAfterMonth: training ? 10 : 9,
        basisPolicy: training ? "TVAOED_PFLEGE_14" : "TVOED_VKA_20",
        eligibilityPolicy: training
          ? "TRAINING_OR_DIRECT_TAKEOVER_DECEMBER_1"
          : variant.id === "BT_K"
            ? "BT_K_EARLY_EXIT"
            : "EMPLOYED_DECEMBER_1",
        reductionPolicy: training ? "TVAOED_PFLEGE_14" : "TVOED_VKA_20",
        earlyExitBasis:
          !training && variant.id === "BT_K"
            ? "LAST_FULL_MONTH_TABLE_AND_FIXED_ALLOWANCES"
            : "NONE",
        payoutMonth: 11,
        sourceIds: [...variant.sourceIds],
      }));
    }),
  );
  return pkg;
}
