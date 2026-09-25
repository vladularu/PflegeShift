import { Temporal } from "@js-temporal/polyfill";
import type { RuleTariffPackage } from "@/rules/contracts.generated";
import { resolveTariffSelection } from "@/rules/tariff-selection";
import { validateRulePackage } from "@/rules/validation";

/** A dated, sourced full-time rate only; it does not establish personal entitlement. */
export type CaritasCareAllowanceRateLookup =
  | {
      readonly kind: "source-care-allowance-rate";
      readonly packageId: string;
      readonly versionId: string;
      readonly rateId: string;
      readonly provisionId: "SECTION_12_3" | "SECTION_12_4";
      readonly variantId: string;
      readonly regionId: string;
      readonly monthlyCents: number;
      readonly sourceIds: readonly string[];
    }
  | {
      readonly kind: "unavailable";
      readonly reason:
        | "INVALID_PACKAGE"
        | "OUTSIDE_VALIDITY"
        | "UNKNOWN_SELECTION"
        | "UNKNOWN_PROVISION"
        | "MISSING_CARE_ALLOWANCE_RATE";
    };

export function lookupCaritasCareAllowanceRate(
  pkg: RuleTariffPackage,
  date: string,
  variantId: string,
  regionId: string,
  provisionId: "SECTION_12_3" | "SECTION_12_4",
): CaritasCareAllowanceRateLookup {
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

  if (provisionId !== "SECTION_12_3" && provisionId !== "SECTION_12_4")
    return { kind: "unavailable", reason: "UNKNOWN_PROVISION" };

  const matches = pkg.rules.caritasCareAllowanceRates?.filter(
    (rate) =>
      rate.provisionId === provisionId &&
      rate.variantId === variantId &&
      rate.regionId === regionId &&
      rate.validFrom <= date &&
      date <= rate.validTo,
  );
  if (matches?.length !== 1) return { kind: "unavailable", reason: "MISSING_CARE_ALLOWANCE_RATE" };

  const rate = matches[0];
  return {
    kind: "source-care-allowance-rate",
    packageId: pkg.packageId,
    versionId: pkg.versionId,
    rateId: rate.id,
    provisionId: rate.provisionId,
    variantId: rate.variantId,
    regionId: rate.regionId,
    monthlyCents: rate.monthlyCents,
    sourceIds: rate.sourceIds,
  };
}
