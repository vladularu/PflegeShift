import type { RuleAnnualPaymentRule, RuleTariffPackage } from "./contracts.generated";
import type { ValidationIssue } from "./validation";

/** Semantic checks run after the generated schema validator on both publisher and app. */
export function annualPaymentRuleIssues(pkg: RuleTariffPackage): ValidationIssue[] {
  const { annualPaymentRules: rules, selection, selector, payTables } = pkg.rules;
  const issues: ValidationIssue[] = [];
  const add = (code: string, path: string, message: string) => issues.push({ code, path, message });
  const root = "/rules/annualPaymentRules";
  const contractVersion: number = pkg.engineContractVersion;
  const tvl = contractVersion === 12;
  const tval = contractVersion === 13;
  if (pkg.engineContractVersion !== 11 && !tvl && !tval) {
    if (rules !== undefined)
      add("UNSUPPORTED_ANNUAL_PAYMENT", root, "Annual payment rules require contract 11 or 12.");
    return issues;
  }
  if (
    (tvl || tval) &&
    rules === undefined &&
    selection?.capabilities.annualPayment === "UNSUPPORTED"
  )
    return issues;
  if (!selection || selection.capabilities.annualPayment !== "SUPPORTED" || !rules?.length) {
    add("MISSING_ANNUAL_PAYMENT", root, "Annual payment support requires explicit complete terms.");
    return issues;
  }
  const training = selection.employmentKind === "APPRENTICE";
  if (
    (training &&
      (selection.familyId !== (tval ? "tval-pflege" : "tvaoed-pflege") ||
        selector.agreementId !== (tval ? "tva-l-pflege" : "tvaoed-vka"))) ||
    (!training &&
      (selection.familyId !== (tvl ? "tvl-kr" : "tvoed-p") ||
        selector.agreementId !== (tvl ? "tv-l" : "tvoed-vka"))) ||
    (tvl && training)
  )
    add(
      "ANNUAL_PAYMENT_FAMILY",
      root,
      "Annual payment procedures must match the declared care family.",
    );
  const sources = new Set(pkg.sources.map((source) => source.id));
  const groups = new Set(
    payTables
      .find((table) => table.id === selector.payTableId)
      ?.entries.map((entry) => entry.groupId),
  );
  const ids = new Set<string>();
  for (const [index, rule] of rules.entries()) {
    const path = root + "/" + index;
    if (ids.has(rule.id))
      add("DUPLICATE_ANNUAL_PAYMENT", path + "/id", "Rule identifiers must be unique.");
    ids.add(rule.id);
    for (const id of rule.sourceIds)
      if (!sources.has(id)) add("UNKNOWN_SOURCE_ID", path + "/sourceIds", "Unknown source: " + id);
    const variant = selection.variants.find((entry) => entry.id === rule.variantId);
    if (
      !variant ||
      !(tval ? ["pflege"] : tvl ? ["section-43"] : ["bt-k", "bt-b"]).includes(variant.specialPartId)
    )
      add(
        "ANNUAL_PAYMENT_VARIANT",
        path + "/variantId",
        "Unknown or unsupported annual payment variant.",
      );
    for (const id of rule.regionIds)
      if (!variant?.regions.some((region) => region.id === id))
        add("ANNUAL_PAYMENT_REGION", path + "/regionIds", "Unknown region: " + id);
    for (const group of rule.payGroups)
      if (!groups.has(group))
        add("ANNUAL_PAYMENT_GROUP", path + "/payGroups", "Unknown group: " + group);
    if (
      rule.firstEntitlementYear > rule.lastEntitlementYear ||
      rule.firstEntitlementYear < Number(pkg.validFrom.slice(0, 4)) ||
      (pkg.validTo !== null && rule.lastEntitlementYear > Number(pkg.validTo.slice(0, 4)))
    )
      add(
        "ANNUAL_PAYMENT_YEARS",
        path,
        "Claim years must be ordered and within the package years.",
      );
    if (
      tval
        ? rule.referenceMonths.join(",") !== "11" ||
          rule.lateEntryAfterMonth !== 11 ||
          rule.payoutMonth !== 11 ||
          rule.rateBasisPoints !== 9500
        : rule.referenceMonths.length !== 3 ||
          rule.referenceMonths.some((month, i) => month !== rule.referenceMonths[0] + i) ||
          rule.lateEntryAfterMonth !== (tvl ? 8 : rule.referenceMonths[2]) ||
          rule.payoutMonth <= rule.referenceMonths[2] ||
          (tvl && (rule.referenceMonths.join(",") !== "7,8,9" || rule.payoutMonth !== 11))
    )
      add(
        "ANNUAL_PAYMENT_MONTHS",
        path,
        "Ordered consecutive reference months must precede payment.",
      );
    const earlyExit = !training && variant?.specialPartId === "bt-k";
    if (
      rule.basisPolicy !==
        (tval
          ? "TVAL_PFLEGE_16"
          : tvl
            ? "TVL_20"
            : training
              ? "TVAOED_PFLEGE_14"
              : "TVOED_VKA_20") ||
      rule.reductionPolicy !== rule.basisPolicy ||
      rule.eligibilityPolicy !==
        (tval
          ? "TVAL_TRAINING_OR_DIRECT_TAKEOVER_DECEMBER_1"
          : tvl
            ? "TVL_DECEMBER_1_OR_LEGACY_ATZ"
            : training
              ? "TRAINING_OR_DIRECT_TAKEOVER_DECEMBER_1"
              : earlyExit
                ? "BT_K_EARLY_EXIT"
                : "EMPLOYED_DECEMBER_1") ||
      rule.earlyExitBasis !==
        (tvl
          ? "LAST_THREE_MONTHS_TVL"
          : earlyExit
            ? "LAST_FULL_MONTH_TABLE_AND_FIXED_ALLOWANCES"
            : "NONE")
    )
      add(
        "ANNUAL_PAYMENT_POLICY",
        path,
        "Basis, eligibility and reduction policies must match the tariff.",
      );
  }
  // A global SUPPORTED capability must not hide missing regions, groups or years.
  const firstYear = Math.min(...rules.map((rule) => rule.firstEntitlementYear));
  const lastYear = Math.max(...rules.map((rule) => rule.lastEntitlementYear));
  for (const variant of selection.variants)
    for (const region of variant.regions)
      for (const group of groups) {
        const applicable = rules.filter(
          (rule) =>
            rule.variantId === variant.id &&
            rule.regionIds.includes(region.id) &&
            rule.payGroups.includes(group),
        );
        checkCoverage(applicable, firstYear, lastYear, (code) =>
          add(
            code,
            root,
            "Annual coverage for " +
              variant.id +
              "/" +
              region.id +
              "/" +
              group +
              " is incomplete or ambiguous.",
          ),
        );
      }
  return issues;
}

function checkCoverage(
  rules: readonly RuleAnnualPaymentRule[],
  firstYear: number,
  lastYear: number,
  add: (code: string) => void,
) {
  let next = firstYear;
  for (const rule of [...rules].sort((a, b) => a.firstEntitlementYear - b.firstEntitlementYear)) {
    if (rule.firstEntitlementYear < next) add("ANNUAL_PAYMENT_OVERLAP");
    if (rule.firstEntitlementYear > next) add("ANNUAL_PAYMENT_COVERAGE");
    next = Math.max(next, rule.lastEntitlementYear + 1);
  }
  if (next <= lastYear) add("ANNUAL_PAYMENT_COVERAGE");
}
