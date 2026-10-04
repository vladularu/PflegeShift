import { validateTariffAnnualClaim } from "@/domain/tariff-annual-claim";
import type { RuleTariffPackage } from "@/rules/contracts.generated";
import type { RuleResolver } from "@/rules/rule-resolver";
import { selectCaritasAnnualDraft } from "@/rules/tariff-annual-selection";
import { resolveTariffSelection } from "@/rules/tariff-selection";
import { validateRulePackage } from "@/rules/validation";
import { tariffAnnualBasis, type TariffAnnualBasis } from "./tariff-annual-basis";
import { tariffAnnualEligibility, type AnnualCalculationRule } from "./tariff-annual-eligibility";

export interface CaritasAnnualDraftEstimate {
  /** A candidate is deliberately not a reportable annual-payment position. */
  readonly draftOnly: true;
  readonly status: "estimated" | "unavailable";
  readonly amountCents: number | null;
  readonly eligible: boolean | null;
  readonly packageId: string | null;
  readonly versionId: string | null;
  readonly year: number | null;
  readonly payoutMonth: string | null;
  readonly sourceIds: readonly string[];
  readonly rateBasisPoints: number | null;
  readonly twelfths: { readonly numerator: number; readonly denominator: number } | null;
  readonly basisCents: number | null;
  readonly basisMethod: TariffAnnualBasis["method"] | null;
  readonly basisMonths: readonly string[];
  readonly missing: readonly string[];
}

function round(numerator: bigint, denominator: bigint): number {
  const cents = (2n * numerator + denominator) / (2n * denominator);
  if (cents > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error("Annual amount outside safe range.");
  return Number(cents);
}

function emptyCaritasAnnualDraftEstimate(year: number | null): CaritasAnnualDraftEstimate {
  return {
    draftOnly: true,
    status: "unavailable",
    amountCents: null,
    eligible: null,
    packageId: null,
    versionId: null,
    year,
    payoutMonth: null,
    sourceIds: [],
    rateBasisPoints: null,
    twelfths: null,
    basisCents: null,
    basisMethod: null,
    basisMonths: [],
    missing: [],
  };
}

/** Late entrants, older RK-Ost West-table cases and unconfirmed bases stay unavailable. */
export function calculateCaritasAnnualDraftClaim(
  rulePackage: RuleTariffPackage,
  input: unknown,
): CaritasAnnualDraftEstimate {
  const empty = emptyCaritasAnnualDraftEstimate(null);
  let claim;
  try {
    claim = validateTariffAnnualClaim(input);
  } catch {
    return { ...empty, missing: ["claim.invalid"] };
  }
  const result = { ...empty, year: claim.year };
  const valid = validateRulePackage(rulePackage);
  if (
    !valid.ok ||
    valid.value.kind !== "TARIFF" ||
    valid.value.engineContractVersion !== 14 ||
    valid.value.status !== "DRAFT" ||
    valid.value.packageId !== claim.selection.packageId ||
    claim.version !== 3
  )
    return { ...result, missing: ["rulePackage"] };
  const pkg = valid.value;
  const policy = pkg.rules.caritasAnnualPaymentPolicy;
  if (!policy) return { ...result, missing: ["rulePeriod"] };
  const payoutDate = `${claim.year}-${String(policy.payoutMonth).padStart(2, "0")}-01`;
  if (
    policy.validFrom > payoutDate ||
    policy.validTo < payoutDate ||
    pkg.validFrom > payoutDate ||
    (pkg.validTo !== null && pkg.validTo < payoutDate)
  )
    return { ...result, missing: ["rulePeriod"] };
  const selected = resolveTariffSelection(pkg, claim.selection.variant, claim.selection.region);
  const rateBands = policy.rateBands.filter((band) =>
    band.groupIds.includes(claim.selection.group),
  );
  if (
    !claim.selection.confirmed ||
    !selected?.groups.some((group) => group.id === claim.selection.group) ||
    rateBands.length !== 1
  )
    return { ...result, missing: ["selection"] };
  const rate = rateBands[0].rateBasisPoints;
  const sourced = {
    ...result,
    packageId: pkg.packageId,
    versionId: pkg.versionId,
    sourceIds: [...policy.sourceIds],
    rateBasisPoints: rate,
    // § 16(5) names the regular November payment, but does not establish a
    // cash month for an Anlage 31 employee who left before December.
    payoutMonth:
      claim.selection.variant === policy.earlyExitVariantId &&
      claim.employment.end !== null &&
      claim.employment.end < `${claim.year}-12-01`
        ? null
        : `${claim.year}-${String(policy.payoutMonth).padStart(2, "0")}`,
  };
  const rateDate = `${claim.year}-${policy.rateDateMonthDay}`;
  if (
    !claim.selection.groupAtSeptember1Confirmed ||
    !claim.employment.confirmed ||
    claim.employment.start === null ||
    claim.employment.start > rateDate ||
    (claim.employment.end !== null && claim.employment.end < rateDate)
  )
    return { ...sourced, missing: ["selection.groupAtSeptember1"] };
  if (policy.eastTariff2025UsesWestTable && claim.selection.region === "OST_TARIF_OST")
    return { ...sourced, missing: ["basis.ostWestTable"] };
  const rule: AnnualCalculationRule = {
    eligibilityPolicy:
      claim.selection.variant === policy.earlyExitVariantId
        ? "CARITAS_31_EARLY_EXIT"
        : "EMPLOYED_DECEMBER_1",
    reductionPolicy: "CARITAS_16",
    basisPolicy: "CARITAS_16",
    earlyExitBasis:
      claim.selection.variant === policy.earlyExitVariantId ? policy.earlyExitBasis : "NONE",
    referenceMonths: policy.referenceMonths,
    lateEntryAfterMonth: policy.referenceMonths[2],
  };
  const eligibility = tariffAnnualEligibility(claim, rule);
  if (eligibility.missing.length || eligibility.eligible === null)
    return { ...sourced, missing: [...new Set(eligibility.missing)] };
  if (!eligibility.eligible)
    return { ...sourced, status: "estimated", amountCents: 0, eligible: false };
  const twelfths = eligibility.twelfths!;
  if (twelfths.numerator === 0)
    return {
      ...sourced,
      status: "estimated",
      amountCents: 0,
      eligible: true,
      twelfths,
    };
  const { basis, missing } = tariffAnnualBasis(claim, rule, eligibility);
  if (basis === null)
    return { ...sourced, eligible: true, twelfths, missing: [...new Set(missing)] };
  return {
    ...sourced,
    status: "estimated",
    eligible: true,
    amountCents: round(
      basis.numerator * BigInt(rate) * BigInt(twelfths.numerator),
      basis.denominator * 10_000n * 12n * BigInt(twelfths.denominator),
    ),
    twelfths,
    basisCents: round(basis.numerator, basis.denominator),
    basisMethod: basis.method,
    basisMonths: basis.months,
  };
}

/** Resolves a saved claim through the injected catalog, never a bundled fallback. */
export function calculateCaritasAnnualDraftFromResolver(
  resolver: RuleResolver,
  input: unknown,
): CaritasAnnualDraftEstimate {
  let claim;
  try {
    claim = validateTariffAnnualClaim(input);
  } catch {
    return { ...emptyCaritasAnnualDraftEstimate(null), missing: ["claim.invalid"] };
  }
  const selected = selectCaritasAnnualDraft(claim, resolver);
  if (!selected.ok)
    return { ...emptyCaritasAnnualDraftEstimate(claim.year), missing: [selected.code] };
  return calculateCaritasAnnualDraftClaim(selected.package, claim);
}
