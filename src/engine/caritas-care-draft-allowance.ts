import type { RuleTariffPackage } from "@/rules/contracts.generated";
import {
  calculateCaritasCareDraftBase,
  type CaritasCareDraftBase,
} from "./caritas-care-draft-original-base";
import { roundRemunerationCents } from "./remuneration-money";

/** One sourced Pflegezulage candidate, not complete gross pay or an activated tariff. */
export type CaritasCareDraftAllowance =
  | {
      readonly kind: "personal-care-allowance";
      readonly provisionId: "SECTION_12_3" | "SECTION_12_4";
      readonly fullTimeMonthlyCents: number;
      readonly personalMonthlyCents: number;
      readonly weeklyMinutes: number;
      readonly fullTimeWeeklyMinutes: number;
      readonly packageId: string;
      readonly versionId: string;
      readonly rateId: string;
      readonly rateSourceIds: readonly string[];
      readonly basisSourceIds: readonly string[];
    }
  | {
      readonly kind: "unavailable";
      readonly reason:
        | Extract<CaritasCareDraftBase, { kind: "unavailable" }>["reason"]
        | "MISSING_CARE_ALLOWANCE_RATE";
    };

function calculateProvision(
  pkg: RuleTariffPackage,
  date: string,
  variantId: string,
  regionId: string,
  groupId: string,
  stepId: string,
  weeklyMinutes: number,
  provisionId: "SECTION_12_3" | "SECTION_12_4",
): CaritasCareDraftAllowance {
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

  const rates = pkg.rules.caritasCareAllowanceRates?.filter(
    (rate) =>
      rate.provisionId === provisionId &&
      rate.variantId === variantId &&
      rate.regionId === regionId &&
      rate.validFrom <= date &&
      date <= rate.validTo,
  );
  if (rates?.length !== 1) return { kind: "unavailable", reason: "MISSING_CARE_ALLOWANCE_RATE" };
  const rate = rates[0];
  return {
    kind: "personal-care-allowance",
    provisionId,
    fullTimeMonthlyCents: rate.monthlyCents,
    personalMonthlyCents: roundRemunerationCents(
      rate.monthlyCents * weeklyMinutes,
      base.fullTimeWeeklyMinutes,
    ),
    weeklyMinutes,
    fullTimeWeeklyMinutes: base.fullTimeWeeklyMinutes,
    packageId: base.packageId,
    versionId: base.versionId,
    rateId: rate.id,
    rateSourceIds: rate.sourceIds,
    basisSourceIds: base.sourceIds,
  };
}

/** AVR Anlagen 31/32 §§ 12(4), 12a: dated monthly rate at the agreed work-time fraction. */
export function calculateCaritasCareDraftAllowance(
  pkg: RuleTariffPackage,
  date: string,
  variantId: string,
  regionId: string,
  groupId: string,
  stepId: string,
  weeklyMinutes: number,
): CaritasCareDraftAllowance {
  return calculateProvision(
    pkg,
    date,
    variantId,
    regionId,
    groupId,
    stepId,
    weeklyMinutes,
    "SECTION_12_4",
  );
}

/** AVR Anlagen 31/32 §§ 12(3), 12a: separate non-dynamic regional monthly allowance. */
export function calculateCaritasCareDraftFixedAllowance(
  pkg: RuleTariffPackage,
  date: string,
  variantId: string,
  regionId: string,
  groupId: string,
  stepId: string,
  weeklyMinutes: number,
): CaritasCareDraftAllowance {
  return calculateProvision(
    pkg,
    date,
    variantId,
    regionId,
    groupId,
    stepId,
    weeklyMinutes,
    "SECTION_12_3",
  );
}
