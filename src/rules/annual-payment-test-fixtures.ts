import employeeValue from "./__fixtures__/original-tvoed-selection-r2.json";
import trainingValue from "../../rules/packages/reviewed/tvaoed-pflege-vka/2026-05.json";
import type { RuleAnnualPaymentRule, RuleTariffPackage } from "./contracts.generated";

function nonempty<T>(values: readonly T[]): [T, ...T[]] {
  if (values.length === 0) throw new Error("Expected nonempty test fixture.");
  return [values[0], ...values.slice(1)];
}

/** Synthetic contract tests only. This does not create reviewed tariff content. */
export function annualPaymentCandidate(training = false): RuleTariffPackage {
  const pkg = structuredClone(training ? trainingValue : employeeValue) as RuleTariffPackage;
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
      return bands.map((payGroups, i): RuleAnnualPaymentRule => ({
        id: variant.id.toLowerCase().replace("_", "-") + "-annual-" + i,
        variantId: variant.id,
        regionIds: nonempty(variant.regions.map((region) => region.id)),
        payGroups: nonempty(payGroups),
        firstEntitlementYear: 2026,
        lastEntitlementYear: 2026,
        rateBasisPoints: i === 0 ? 9000 : 8500,
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
