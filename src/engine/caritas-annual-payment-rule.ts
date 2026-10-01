import type { RuleCaritasAnnualPaymentRule, RuleTariffPackage } from "@/rules/contracts.generated";
import { resolveTariffSelection } from "@/rules/tariff-selection";
import { validateRulePackage } from "@/rules/validation";

export type CaritasAnnualPaymentRuleLookup =
  | (Omit<Readonly<RuleCaritasAnnualPaymentRule>, "payGroups" | "sourceIds" | "referenceMonths"> & {
      readonly kind: "source-annual-payment-rule";
      readonly packageId: string;
      readonly versionId: string;
      readonly basisPayTableId: string;
      readonly payGroups: readonly string[];
      readonly sourceIds: readonly string[];
      readonly referenceMonths: readonly [7, 8, 9];
      readonly draft: true;
      readonly completeGross: false;
    })
  | {
      readonly kind: "unavailable";
      readonly reason:
        | "INVALID_PACKAGE"
        | "OUTSIDE_ENTITLEMENT_YEAR"
        | "UNKNOWN_SELECTION"
        | "UNKNOWN_PAY_GROUP"
        | "MISSING_ANNUAL_PAYMENT_RULE";
    };

/** Returns a sourced annual rule; it never determines entitlement, an annual amount or salary. */
export function lookupCaritasAnnualPaymentRule(
  pkg: RuleTariffPackage,
  entitlementYear: number,
  variantId: string,
  regionId: string,
  payGroupId: string,
): CaritasAnnualPaymentRuleLookup {
  if (pkg.engineContractVersion !== 14 || !validateRulePackage(pkg).ok) {
    return { kind: "unavailable", reason: "INVALID_PACKAGE" };
  }
  const referenceDate = `${entitlementYear}-09-01`;
  if (
    !Number.isSafeInteger(entitlementYear) ||
    ![2025, 2026].includes(entitlementYear) ||
    referenceDate < pkg.validFrom ||
    (pkg.validTo !== null && referenceDate > pkg.validTo)
  ) {
    return { kind: "unavailable", reason: "OUTSIDE_ENTITLEMENT_YEAR" };
  }
  const selection = resolveTariffSelection(pkg, variantId, regionId);
  if (
    selection?.familyId !== "avr-caritas-p" ||
    selection.engineId !== "avr-caritas-p-v1" ||
    selection.region.payTableId === undefined ||
    Object.values(selection.capabilities).some((value) => value !== "UNSUPPORTED")
  ) {
    return { kind: "unavailable", reason: "UNKNOWN_SELECTION" };
  }
  const table = pkg.rules.payTables.find((item) => item.id === selection.region.payTableId);
  if (!table?.entries.some((entry) => entry.groupId === payGroupId)) {
    return { kind: "unavailable", reason: "UNKNOWN_PAY_GROUP" };
  }
  const matches = pkg.rules.caritasAnnualPaymentRules?.filter(
    (rule) =>
      rule.entitlementYear === entitlementYear &&
      rule.variantId === variantId &&
      rule.regionId === regionId &&
      rule.payGroups.some((group) => group === payGroupId),
  );
  if (matches?.length !== 1) {
    return { kind: "unavailable", reason: "MISSING_ANNUAL_PAYMENT_RULE" };
  }
  const rule = matches[0];
  const basisPayTableId = pkg.rules.selection?.variants
    .find((item) => item.id === variantId)
    ?.regions.find((item) => item.id === rule.basisRegionId)?.payTableId;
  if (basisPayTableId === undefined) return { kind: "unavailable", reason: "INVALID_PACKAGE" };
  return {
    ...rule,
    kind: "source-annual-payment-rule",
    packageId: pkg.packageId,
    versionId: pkg.versionId,
    basisPayTableId,
    payGroups: [...rule.payGroups],
    sourceIds: [...rule.sourceIds],
    referenceMonths: [7, 8, 9],
    draft: true,
    completeGross: false,
  };
}
