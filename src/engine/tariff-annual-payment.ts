import { validateTariffAnnualClaim } from "@/domain/tariff-annual-claim";
import type { RuleTariffPackage } from "@/rules/contracts.generated";
import { validateRulePackage } from "@/rules/validation";
import { tariffAnnualEligibility } from "./tariff-annual-eligibility";
import { tariffAnnualBasis, type TariffAnnualBasis } from "./tariff-annual-basis";

export interface TariffAnnualEstimate {
  readonly claimId: string | null;
  readonly year: number | null;
  readonly payoutMonth: string | null;
  readonly status: "estimated" | "unavailable";
  readonly amountCents: number | null;
  readonly eligible: boolean | null;
  readonly ruleId: string | null;
  readonly packageId: string | null;
  readonly versionId: string | null;
  readonly sourceIds: readonly string[];
  readonly rateBasisPoints: number | null;
  readonly twelfths: { readonly numerator: number; readonly denominator: number } | null;
  readonly basisCents: number | null;
  readonly basisMethod: TariffAnnualBasis["method"] | null;
  readonly basisMonths: readonly string[];
  readonly missing: readonly string[];
}
/** One final HALF_UP rounding; the displayed basis is never fed back into calculation. */
function round(numerator: bigint, denominator: bigint): number {
  const cents = (2n * numerator + denominator) / (2n * denominator);
  if (cents > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error("Annual amount outside safe range.");
  return Number(cents);
}
export function calculateTariffAnnualClaim(
  rulePackage: RuleTariffPackage,
  input: unknown,
): TariffAnnualEstimate {
  const empty: TariffAnnualEstimate = {
    claimId: null,
    year: null,
    payoutMonth: null,
    status: "unavailable",
    amountCents: null,
    eligible: null,
    ruleId: null,
    packageId: null,
    versionId: null,
    sourceIds: [],
    rateBasisPoints: null,
    twelfths: null,
    basisCents: null,
    basisMethod: null,
    basisMonths: [],
    missing: [],
  };
  let claim;
  try {
    claim = validateTariffAnnualClaim(input);
  } catch {
    return { ...empty, missing: ["claim.invalid"] };
  }
  const result = { ...empty, claimId: claim.id, year: claim.year };
  if (!claim.selection.confirmed) return { ...result, missing: ["selection.confirmed"] };
  const valid = validateRulePackage(rulePackage);
  if (
    !valid.ok ||
    valid.value.kind !== "TARIFF" ||
    ![11, 12, 13].includes(valid.value.engineContractVersion) ||
    !valid.value.rules.annualPaymentRules?.length ||
    valid.value.packageId !== claim.selection.packageId
  )
    return { ...result, missing: ["rulePackage"] };
  const pkg = valid.value;
  const matches = pkg.rules.annualPaymentRules!.filter(
    (rule) =>
      rule.variantId === claim.selection.variant &&
      rule.regionIds.includes(claim.selection.region) &&
      rule.payGroups.includes(claim.selection.group) &&
      claim.year >= rule.firstEntitlementYear &&
      claim.year <= rule.lastEntitlementYear,
  );
  if (matches.length !== 1) return { ...result, missing: ["ruleSelection"] };
  const rule = matches[0];
  const eligibility = tariffAnnualEligibility(claim, rule);
  const sourced = {
    ...result,
    ruleId: rule.id,
    packageId: pkg.packageId,
    versionId: pkg.versionId,
    sourceIds: [...rule.sourceIds],
    rateBasisPoints: rule.rateBasisPoints,
    payoutMonth: claim.year + "-" + String(rule.payoutMonth).padStart(2, "0"),
    eligible: eligibility.eligible,
  };
  if (eligibility.missing.length || eligibility.eligible === null)
    return { ...sourced, missing: [...new Set(eligibility.missing)] };
  if (!eligibility.eligible) return { ...sourced, status: "estimated", amountCents: 0 };
  const twelfths = eligibility.twelfths!;
  if (twelfths.numerator === 0)
    return { ...sourced, status: "estimated", amountCents: 0, twelfths };
  const { basis, missing } = tariffAnnualBasis(claim, rule, eligibility);
  if (basis === null) return { ...sourced, twelfths, missing: [...new Set(missing)] };
  return {
    ...sourced,
    status: "estimated",
    amountCents: round(
      basis.numerator * BigInt(rule.rateBasisPoints) * BigInt(twelfths.numerator),
      basis.denominator * 10_000n * 12n * BigInt(twelfths.denominator),
    ),
    twelfths,
    basisCents: round(basis.numerator, basis.denominator),
    basisMethod: basis.method,
    basisMonths: basis.months,
  };
}
