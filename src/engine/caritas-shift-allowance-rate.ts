import { Temporal } from "@js-temporal/polyfill";
import type { RuleTariffPackage } from "@/rules/contracts.generated";
import { resolveTariffSelection } from "@/rules/tariff-selection";
import { validateRulePackage } from "@/rules/validation";

/** Dated, sourced section 6(5)/(6) rates only; no personal entitlement or pay. */
export type CaritasShiftAllowanceRateLookup =
  | {
      readonly kind: "source-shift-allowance-rate";
      readonly packageId: string;
      readonly versionId: string;
      readonly rateId: string;
      readonly variantId: string;
      readonly regionId: string;
      readonly alternatingMonthlyCents: number;
      readonly alternatingHourlyCents: number;
      readonly shiftMonthlyCents: number;
      readonly shiftHourlyCents: number;
      readonly sourceIds: readonly string[];
    }
  | {
      readonly kind: "unavailable";
      readonly reason:
        | "INVALID_PACKAGE"
        | "OUTSIDE_VALIDITY"
        | "UNKNOWN_SELECTION"
        | "MISSING_SHIFT_ALLOWANCE_RATE";
    };

export function lookupCaritasShiftAllowanceRate(
  pkg: RuleTariffPackage,
  date: string,
  variantId: string,
  regionId: string,
): CaritasShiftAllowanceRateLookup {
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

  const matches = pkg.rules.caritasShiftAllowanceRates?.filter(
    (rate) =>
      rate.variantId === variantId &&
      rate.regionId === regionId &&
      rate.validFrom <= date &&
      date <= rate.validTo,
  );
  if (matches?.length !== 1) return { kind: "unavailable", reason: "MISSING_SHIFT_ALLOWANCE_RATE" };

  const rate = matches[0];
  return {
    kind: "source-shift-allowance-rate",
    packageId: pkg.packageId,
    versionId: pkg.versionId,
    rateId: rate.id,
    variantId: rate.variantId,
    regionId: rate.regionId,
    alternatingMonthlyCents: rate.alternatingMonthlyCents,
    alternatingHourlyCents: rate.alternatingHourlyCents,
    shiftMonthlyCents: rate.shiftMonthlyCents,
    shiftHourlyCents: rate.shiftHourlyCents,
    sourceIds: rate.sourceIds,
  };
}
