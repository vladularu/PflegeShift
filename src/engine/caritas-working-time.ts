import { Temporal } from "@js-temporal/polyfill";
import type { RuleTariffPackage } from "@/rules/contracts.generated";
import { resolveTariffSelection } from "@/rules/tariff-selection";
import { validateRulePackage } from "@/rules/validation";

/** A sourced full-time weekly duration, not a personal pay calculation. */
export type CaritasWorkingTimeLookup =
  | {
      readonly kind: "source-working-time";
      readonly packageId: string;
      readonly versionId: string;
      readonly ruleId: string;
      readonly fullTimeWeeklyMinutes: number;
      readonly sourceIds: readonly string[];
    }
  | {
      readonly kind: "unavailable";
      readonly reason:
        "INVALID_PACKAGE" | "OUTSIDE_VALIDITY" | "UNKNOWN_SELECTION" | "MISSING_WORKING_TIME_RULE";
    };

export function lookupCaritasFullTimeWeeklyMinutes(
  pkg: RuleTariffPackage,
  date: string,
  variantId: string,
  regionId: string,
): CaritasWorkingTimeLookup {
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

  const matches = pkg.rules.employmentWorkingTimeRules?.filter(
    (rule) =>
      rule.variantId === variantId &&
      rule.regionId === regionId &&
      rule.validFrom <= date &&
      (rule.validTo === null || date <= rule.validTo),
  );
  if (matches?.length !== 1) return { kind: "unavailable", reason: "MISSING_WORKING_TIME_RULE" };

  const rule = matches[0];
  return {
    kind: "source-working-time",
    packageId: pkg.packageId,
    versionId: pkg.versionId,
    ruleId: rule.id,
    fullTimeWeeklyMinutes: rule.fullTimeWeeklyMinutes,
    sourceIds: rule.sourceIds,
  };
}
