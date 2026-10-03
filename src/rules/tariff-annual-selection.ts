import type { TariffAnnualClaim } from "@/domain/tariff-annual-claim";
import type { RuleAnnualPaymentRule, RuleTariffPackage } from "./contracts.generated";
import type { RuleResolver } from "./rule-resolver";
import { resolveTariffSelection } from "./tariff-selection";
import { validateRulePackage } from "./validation";

export type AnnualTariffSelection =
  | {
      readonly ok: true;
      readonly package: RuleTariffPackage;
      readonly rule: RuleAnnualPaymentRule;
      readonly versions: readonly RuleTariffPackage[];
    }
  | {
      readonly ok: false;
      readonly code: "ANNUAL_RULE_MISSING" | "ANNUAL_RULE_AMBIGUOUS" | "ANNUAL_RULE_INVALID";
    };
const terms = (r: RuleAnnualPaymentRule) =>
  JSON.stringify([
    r.rateBasisPoints,
    r.referenceMonths,
    r.lateEntryAfterMonth,
    r.basisPolicy,
    r.eligibilityPolicy,
    r.reductionPolicy,
    r.earlyExitBasis,
    r.payoutMonth,
  ]);

/** No newest-rule guessing: every applicable declaration must agree on this year's terms. */
export function selectAnnualTariff(
  claim: Pick<TariffAnnualClaim, "year" | "selection">,
  resolver: RuleResolver,
): AnnualTariffSelection {
  const candidates = resolver.annualTariffCandidates?.(claim.selection.packageId, claim.year) ?? [];
  const matches: { package: RuleTariffPackage; rule: RuleAnnualPaymentRule }[] = [];
  for (const pkg of candidates) {
    if (![11, 12, 13].includes(pkg.engineContractVersion)) continue;
    const valid = validateRulePackage(pkg);
    if (!valid.ok || valid.value.kind !== "TARIFF" || pkg.packageId !== claim.selection.packageId)
      return { ok: false, code: "ANNUAL_RULE_INVALID" };
    const rules = (pkg.rules.annualPaymentRules ?? []).filter(
      (r) =>
        r.variantId === claim.selection.variant &&
        r.regionIds.includes(claim.selection.region) &&
        r.payGroups.includes(claim.selection.group) &&
        r.firstEntitlementYear <= claim.year &&
        r.lastEntitlementYear >= claim.year,
    );
    if (rules.length > 1) return { ok: false, code: "ANNUAL_RULE_AMBIGUOUS" };
    if (rules.length === 1) matches.push({ package: pkg, rule: rules[0] });
  }
  if (!matches.length) return { ok: false, code: "ANNUAL_RULE_MISSING" };
  if (new Set(matches.map((m) => terms(m.rule))).size !== 1)
    return { ok: false, code: "ANNUAL_RULE_AMBIGUOUS" };
  matches.sort(
    (a, b) =>
      b.package.validFrom.localeCompare(a.package.validFrom) ||
      b.package.versionId.localeCompare(a.package.versionId),
  );
  return { ok: true, ...matches[0], versions: matches.map((m) => m.package) };
}

export type CaritasAnnualDraftSelection =
  | {
      readonly ok: true;
      readonly package: RuleTariffPackage;
      readonly versions: readonly RuleTariffPackage[];
    }
  | {
      readonly ok: false;
      readonly code:
        | "CARITAS_ANNUAL_RULE_MISSING"
        | "CARITAS_ANNUAL_RULE_AMBIGUOUS"
        | "CARITAS_ANNUAL_RULE_INVALID";
    };

/** Candidate-only lookup. DRAFT Caritas terms never become reportable by selection alone. */
export function selectCaritasAnnualDraft(
  claim: Pick<TariffAnnualClaim, "version" | "year" | "selection">,
  resolver: RuleResolver,
): CaritasAnnualDraftSelection {
  if (
    claim.version !== 3 ||
    !Number.isInteger(claim.year) ||
    claim.year < 1900 ||
    claim.year > 4099
  )
    return { ok: false, code: "CARITAS_ANNUAL_RULE_INVALID" };
  const candidates = resolver.annualTariffCandidates?.(claim.selection.packageId, claim.year) ?? [];
  const matches: { package: RuleTariffPackage; terms: string }[] = [];
  for (const pkg of candidates) {
    const valid = validateRulePackage(pkg);
    if (
      !valid.ok ||
      valid.value.kind !== "TARIFF" ||
      valid.value.packageId !== claim.selection.packageId ||
      valid.value.engineContractVersion !== 14 ||
      valid.value.status !== "DRAFT" ||
      !valid.value.rules.caritasAnnualPaymentPolicy
    )
      return { ok: false, code: "CARITAS_ANNUAL_RULE_INVALID" };
    const policy = valid.value.rules.caritasAnnualPaymentPolicy;
    const payoutDate = `${claim.year}-${String(policy.payoutMonth).padStart(2, "0")}-01`;
    if (
      pkg.validFrom > payoutDate ||
      (pkg.validTo !== null && pkg.validTo < payoutDate) ||
      policy.validFrom > payoutDate ||
      policy.validTo < payoutDate
    )
      continue;
    const selection = resolveTariffSelection(pkg, claim.selection.variant, claim.selection.region);
    if (!selection?.groups.some((group) => group.id === claim.selection.group)) continue;
    const bands = policy.rateBands.filter((band) => band.groupIds.includes(claim.selection.group));
    if (bands.length !== 1) return { ok: false, code: "CARITAS_ANNUAL_RULE_INVALID" };
    matches.push({
      package: pkg,
      terms: JSON.stringify([
        bands[0].rateBasisPoints,
        policy.referenceMonths,
        policy.rateDateMonthDay,
        policy.claimDateMonthDay,
        policy.payoutMonth,
        policy.basisPolicy,
        policy.lateEntryBasis,
        policy.reductionPolicy,
        policy.earlyExitVariantId,
        policy.earlyExitBasis,
        policy.eastTariff2025UsesWestTable,
      ]),
    });
  }
  if (!matches.length) return { ok: false, code: "CARITAS_ANNUAL_RULE_MISSING" };
  if (new Set(matches.map((match) => match.terms)).size !== 1)
    return { ok: false, code: "CARITAS_ANNUAL_RULE_AMBIGUOUS" };
  matches.sort(
    (a, b) =>
      b.package.validFrom.localeCompare(a.package.validFrom) ||
      b.package.versionId.localeCompare(a.package.versionId),
  );
  return {
    ok: true,
    package: matches[0].package,
    versions: matches.map((match) => match.package),
  };
}
