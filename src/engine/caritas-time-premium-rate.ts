import { Temporal } from "@js-temporal/polyfill";
import type { RuleTariffPackage } from "@/rules/contracts.generated";
import { resolveTariffSelection } from "@/rules/tariff-selection";
import { validateRulePackage } from "@/rules/validation";

/** Dated, sourced section 6(1)(b-f) base percentages only; no personal pay. */
export type CaritasTimePremiumRateLookup =
  | {
      readonly kind: "source-time-premium-rate";
      readonly packageId: string;
      readonly versionId: string;
      readonly rateId: string;
      readonly variantId: string;
      readonly regionId: string;
      readonly referenceStepId: "3";
      readonly nightBasisPoints: number;
      readonly sundayBasisPoints: number;
      readonly holidayWithTimeOffBasisPoints: number;
      readonly holidayWithoutTimeOffBasisPoints: number;
      readonly preHolidayBasisPoints: number;
      readonly saturdayBasisPoints: number;
      readonly sourceIds: readonly string[];
    }
  | {
      readonly kind: "unavailable";
      readonly reason:
        "INVALID_PACKAGE" | "OUTSIDE_VALIDITY" | "UNKNOWN_SELECTION" | "MISSING_TIME_PREMIUM_RATE";
    };

export function lookupCaritasTimePremiumRate(
  pkg: RuleTariffPackage,
  date: string,
  variantId: string,
  regionId: string,
): CaritasTimePremiumRateLookup {
  if (pkg.engineContractVersion !== 14 || !validateRulePackage(pkg).ok)
    return { kind: "unavailable", reason: "INVALID_PACKAGE" };

  try {
    if (!/^\d{4}-\d{2}-\d{2}$/u.test(date)) throw new RangeError("Invalid ISO date");
    Temporal.PlainDate.from(date);
  } catch {
    return { kind: "unavailable", reason: "OUTSIDE_VALIDITY" };
  }
  if (date < pkg.validFrom || (pkg.validTo !== null && date > pkg.validTo))
    return { kind: "unavailable", reason: "OUTSIDE_VALIDITY" };

  const selection = resolveTariffSelection(pkg, variantId, regionId);
  if (
    selection?.familyId !== "avr-caritas-p" ||
    selection.engineId !== "avr-caritas-p-v1" ||
    selection.region.payTableId === undefined ||
    Object.values(selection.capabilities).some((capability) => capability !== "UNSUPPORTED")
  )
    return { kind: "unavailable", reason: "UNKNOWN_SELECTION" };

  const matches = pkg.rules.caritasTimePremiumRates?.filter(
    (rate) =>
      rate.variantId === variantId &&
      rate.regionId === regionId &&
      rate.validFrom <= date &&
      date <= rate.validTo,
  );
  if (matches?.length !== 1) return { kind: "unavailable", reason: "MISSING_TIME_PREMIUM_RATE" };

  const rate = matches[0];
  return {
    kind: "source-time-premium-rate",
    packageId: pkg.packageId,
    versionId: pkg.versionId,
    rateId: rate.id,
    variantId: rate.variantId,
    regionId: rate.regionId,
    referenceStepId: rate.referenceStepId,
    nightBasisPoints: rate.nightBasisPoints,
    sundayBasisPoints: rate.sundayBasisPoints,
    holidayWithTimeOffBasisPoints: rate.holidayWithTimeOffBasisPoints,
    holidayWithoutTimeOffBasisPoints: rate.holidayWithoutTimeOffBasisPoints,
    preHolidayBasisPoints: rate.preHolidayBasisPoints,
    saturdayBasisPoints: rate.saturdayBasisPoints,
    sourceIds: rate.sourceIds,
  };
}
