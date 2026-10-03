import { Temporal } from "@js-temporal/polyfill";
import type { TariffAnnualClaim } from "@/domain/tariff-annual-claim";
import type { RuleAnnualPaymentRule } from "@/rules/contracts.generated";

/** Shared calculation inputs; a Caritas draft can use the same checked mechanics without
 * advertising a complete, executable annual-payment rule in the public catalog. */
export interface AnnualCalculationRule {
  readonly eligibilityPolicy: RuleAnnualPaymentRule["eligibilityPolicy"] | "CARITAS_31_EARLY_EXIT";
  readonly reductionPolicy: RuleAnnualPaymentRule["reductionPolicy"] | "CARITAS_16";
  readonly basisPolicy: RuleAnnualPaymentRule["basisPolicy"] | "CARITAS_16";
  readonly earlyExitBasis: RuleAnnualPaymentRule["earlyExitBasis"];
  readonly referenceMonths: readonly number[];
  readonly lateEntryAfterMonth: number;
}

export interface AnnualClaimEligibility {
  readonly eligible: boolean | null;
  readonly takeover: boolean;
  readonly earlyExit: boolean;
  readonly twelfths: { readonly numerator: number; readonly denominator: number } | null;
  readonly missing: readonly string[];
}
export function tariffAnnualEligibility(
  claim: TariffAnnualClaim,
  rule: AnnualCalculationRule,
): AnnualClaimEligibility {
  const missing: string[] = [];
  const result = (
    eligible: boolean | null,
    takeover = false,
    earlyExit = false,
    twelfths: AnnualClaimEligibility["twelfths"] = null,
  ): AnnualClaimEligibility => ({
    eligible,
    takeover,
    earlyExit,
    twelfths,
    missing,
  });
  const e = claim.employment;
  if (!e.confirmed || e.start === null) {
    missing.push("employment");
    return result(null);
  }
  const first = claim.year + "-01-01",
    last = claim.year + "-12-31",
    december = claim.year + "-12-01";
  if (e.start > last || (e.end !== null && e.end < first)) return result(false);
  const atDecember = e.start <= december && (e.end === null || e.end >= december);
  let earlyExit =
    (rule.eligibilityPolicy === "BT_K_EARLY_EXIT" ||
      rule.eligibilityPolicy === "CARITAS_31_EARLY_EXIT") &&
    e.end !== null &&
    e.end < december;
  if (
    !atDecember &&
    rule.eligibilityPolicy === "TVL_DECEMBER_1_OR_LEGACY_ATZ" &&
    e.end !== null &&
    e.end < december
  ) {
    const legacy = claim.exceptions.tvlLegacyRetirementExit;
    if (legacy == null) {
      missing.push("exceptions.tvlLegacyRetirementExit");
      return result(null);
    }
    earlyExit = legacy;
  }
  let takeover = false;
  if (!atDecember && !earlyExit) {
    if (
      rule.eligibilityPolicy !== "TRAINING_OR_DIRECT_TAKEOVER_DECEMBER_1" &&
      rule.eligibilityPolicy !== "TVAL_TRAINING_OR_DIRECT_TAKEOVER_DECEMBER_1"
    )
      return result(false);
    const answers = Object.values(e.takeover);
    if (e.end === null || e.end >= december || answers.includes(false)) return result(false);
    if (answers.includes(null)) {
      missing.push("employment.takeover");
      return result(null);
    }
    takeover = true;
  }
  let months = 0;
  for (const row of claim.entitlements) {
    const ym = Temporal.PlainYearMonth.from({ year: claim.year, month: row.month });
    const from = ym.toPlainDate({ day: 1 }).toString();
    const through = ym.toPlainDate({ day: ym.daysInMonth }).toString();
    // §16(4): an in-month takeover assigns the whole transition month to employment.
    if (
      takeover &&
      rule.reductionPolicy === "TVAL_PFLEGE_16" &&
      e.end !== null &&
      e.end >= from &&
      e.end < through
    )
      continue;
    if (through < e.start || (e.end !== null && from > e.end)) {
      if (row.reason !== "NONE" && row.reason !== "UNKNOWN")
        missing.push("entitlements." + row.month + ".periodConflict");
      continue;
    }
    if (row.reason === "UNKNOWN") missing.push("entitlements." + row.month);
    else if (row.reason === "PAY" || row.reason === "MATERNITY") months++;
    else if (row.reason === "PARENTAL_BIRTH_YEAR") {
      const x = claim.exceptions;
      if (x.birthYear === null || x.payBeforeParentalLeave === null)
        missing.push("exceptions.parentalLeave");
      else if (x.birthYear === claim.year && x.payBeforeParentalLeave) months++;
    } else if (row.reason === "SICK_PAY_SUPPLEMENT" || row.reason === "MILITARY_RETURN") {
      if (row.reason === "SICK_PAY_SUPPLEMENT" && rule.reductionPolicy === "TVAL_PFLEGE_16")
        months++;
      else if (
        rule.reductionPolicy !== "TVOED_VKA_20" &&
        rule.reductionPolicy !== "TVL_20" &&
        rule.reductionPolicy !== "CARITAS_16"
      )
        missing.push("entitlements." + row.month + ".unsupportedException");
      else if (row.reason === "SICK_PAY_SUPPLEMENT") months++;
      else if (claim.exceptions.militaryReturnBeforeDecember1 === null)
        missing.push("exceptions.militaryReturn");
      else if (claim.exceptions.militaryReturnBeforeDecember1) months++;
    }
  }
  const a = claim.allocation;
  if (a.required === null || (takeover && !a.required)) missing.push("allocation");
  let twelfths = { numerator: months, denominator: 1 };
  if (a.required) {
    if (a.twelfthsNumerator === null || a.twelfthsDenominator === null)
      missing.push("allocation.twelfths");
    else if (a.twelfthsNumerator > months * a.twelfthsDenominator)
      missing.push("allocation.exceedsEntitlement");
    else twelfths = { numerator: a.twelfthsNumerator, denominator: a.twelfthsDenominator };
  } else if (a.twelfthsNumerator !== null || a.twelfthsDenominator !== null) {
    missing.push("allocation.conflict");
  }
  return result(true, takeover, earlyExit, missing.length ? null : twelfths);
}
