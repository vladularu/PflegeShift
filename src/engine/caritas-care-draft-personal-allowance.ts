import type { RuleTariffPackage } from "@/rules/contracts.generated";
import {
  calculateCaritasCareDraftBase,
  type CaritasCareDraftBase,
} from "./caritas-care-draft-base";
import {
  lookupCaritasCareAllowanceRate,
  type CaritasCareAllowanceRateLookup,
} from "./caritas-care-allowance-rate";

export type CaritasCareAllowanceEntitlement = "CONFIRMED" | "NOT_ENTITLED" | "UNKNOWN";

/** One confirmed DRAFT allowance component, never a complete or activated salary. */
export type CaritasCareDraftPersonalAllowance =
  | {
      readonly kind: "personal-care-allowance";
      readonly completeGross: false;
      readonly entitlementConfirmed: true;
      readonly provisionId: "SECTION_12_3" | "SECTION_12_4";
      readonly fullTimeMonthlyCents: number;
      readonly personalMonthlyCents: number;
      readonly weeklyMinutes: number;
      readonly fullTimeWeeklyMinutes: number;
      readonly packageId: string;
      readonly versionId: string;
      readonly rateId: string;
      readonly tableId: string;
      readonly workingTimeRuleId: string;
      readonly rateSourceIds: readonly string[];
      readonly basisSourceIds: readonly string[];
      readonly prorationProvision: "AVR_ANLAGE_31_32_12A";
    }
  | {
      readonly kind: "unavailable";
      readonly reason:
        | Extract<CaritasCareDraftBase, { kind: "unavailable" }>["reason"]
        | Extract<CaritasCareAllowanceRateLookup, { kind: "unavailable" }>["reason"]
        | "ENTITLEMENT_UNCONFIRMED"
        | "NOT_ENTITLED"
        | "AMOUNT_OVERFLOW";
    };

/**
 * Prorates a sourced monthly rate under Anlagen 31/32 § 12a only when entitlement
 * to this specific provision has been confirmed outside this DRAFT calculation.
 */
export function calculateCaritasCareDraftPersonalAllowance(
  pkg: RuleTariffPackage,
  date: string,
  variantId: string,
  regionId: string,
  groupId: string,
  stepId: string,
  weeklyMinutes: number,
  provisionId: "SECTION_12_3" | "SECTION_12_4",
  entitlement: CaritasCareAllowanceEntitlement,
): CaritasCareDraftPersonalAllowance {
  if (entitlement === "NOT_ENTITLED") return { kind: "unavailable", reason: "NOT_ENTITLED" };
  if (entitlement !== "CONFIRMED")
    return { kind: "unavailable", reason: "ENTITLEMENT_UNCONFIRMED" };

  const base = calculateCaritasCareDraftBase(
    pkg,
    date,
    variantId,
    regionId,
    groupId,
    stepId,
    weeklyMinutes,
  );
  if (base.kind === "unavailable") return base;

  const rate = lookupCaritasCareAllowanceRate(pkg, date, variantId, regionId, provisionId);
  if (rate.kind === "unavailable") return rate;

  const numerator = rate.monthlyCents * weeklyMinutes;
  if (!Number.isSafeInteger(numerator)) return { kind: "unavailable", reason: "AMOUNT_OVERFLOW" };
  const wholeCents = Math.floor(numerator / base.fullTimeWeeklyMinutes);
  const remainder = numerator % base.fullTimeWeeklyMinutes;
  const personalMonthlyCents = wholeCents + (remainder * 2 >= base.fullTimeWeeklyMinutes ? 1 : 0);
  if (!Number.isSafeInteger(personalMonthlyCents))
    return { kind: "unavailable", reason: "AMOUNT_OVERFLOW" };

  return {
    kind: "personal-care-allowance",
    completeGross: false,
    entitlementConfirmed: true,
    provisionId: rate.provisionId,
    fullTimeMonthlyCents: rate.monthlyCents,
    personalMonthlyCents,
    weeklyMinutes,
    fullTimeWeeklyMinutes: base.fullTimeWeeklyMinutes,
    packageId: base.packageId,
    versionId: base.versionId,
    rateId: rate.rateId,
    tableId: base.tableId,
    workingTimeRuleId: base.workingTimeRuleId,
    rateSourceIds: rate.sourceIds,
    basisSourceIds: base.sourceIds,
    prorationProvision: "AVR_ANLAGE_31_32_12A",
  };
}
