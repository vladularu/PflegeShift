import type { RuleTariffPackage } from "@/rules/contracts.generated";
import { lookupCaritasCareTable, type CaritasCareTableLookup } from "./caritas-care-table";
import {
  lookupCaritasTimePremiumRate,
  type CaritasTimePremiumRateLookup,
} from "./caritas-time-premium-rate";
import {
  lookupCaritasFullTimeWeeklyMinutes,
  type CaritasWorkingTimeLookup,
} from "./caritas-working-time";

/** The three sourced inputs for a time premium, without an hourly or personal amount. */
export type CaritasTimePremiumReference =
  | {
      readonly kind: "source-time-premium-reference";
      readonly packageId: string;
      readonly versionId: string;
      readonly variantId: string;
      readonly regionId: string;
      readonly groupId: string;
      readonly referenceStepId: "3";
      readonly tableId: string;
      readonly workingTimeRuleId: string;
      readonly rateId: string;
      readonly fullTimeMonthlyCents: number;
      readonly fullTimeWeeklyMinutes: number;
      readonly nightBasisPoints: number;
      readonly sundayBasisPoints: number;
      readonly holidayWithTimeOffBasisPoints: number;
      readonly holidayWithoutTimeOffBasisPoints: number;
      readonly preHolidayBasisPoints: number;
      readonly saturdayBasisPoints: number;
      readonly tableSourceIds: readonly string[];
      readonly workingTimeSourceIds: readonly string[];
      readonly rateSourceIds: readonly string[];
    }
  | {
      readonly kind: "unavailable";
      readonly reason:
        | Extract<CaritasCareTableLookup, { kind: "unavailable" }>["reason"]
        | Extract<CaritasWorkingTimeLookup, { kind: "unavailable" }>["reason"]
        | Extract<CaritasTimePremiumRateLookup, { kind: "unavailable" }>["reason"];
    };

export function lookupCaritasTimePremiumReference(
  pkg: RuleTariffPackage,
  date: string,
  variantId: string,
  regionId: string,
  groupId: string,
): CaritasTimePremiumReference {
  if (pkg.status !== "DRAFT") return { kind: "unavailable", reason: "INVALID_PACKAGE" };

  const rate = lookupCaritasTimePremiumRate(pkg, date, variantId, regionId);
  if (rate.kind === "unavailable") return rate;

  const table = lookupCaritasCareTable(
    pkg,
    date,
    variantId,
    regionId,
    groupId,
    rate.referenceStepId,
  );
  if (table.kind === "unavailable") return table;

  const workingTime = lookupCaritasFullTimeWeeklyMinutes(pkg, date, variantId, regionId);
  if (workingTime.kind === "unavailable") return workingTime;

  return {
    kind: "source-time-premium-reference",
    packageId: rate.packageId,
    versionId: rate.versionId,
    variantId: rate.variantId,
    regionId: rate.regionId,
    groupId: table.groupId,
    referenceStepId: rate.referenceStepId,
    tableId: table.tableId,
    workingTimeRuleId: workingTime.ruleId,
    rateId: rate.rateId,
    fullTimeMonthlyCents: table.monthlyCents,
    fullTimeWeeklyMinutes: workingTime.fullTimeWeeklyMinutes,
    nightBasisPoints: rate.nightBasisPoints,
    sundayBasisPoints: rate.sundayBasisPoints,
    holidayWithTimeOffBasisPoints: rate.holidayWithTimeOffBasisPoints,
    holidayWithoutTimeOffBasisPoints: rate.holidayWithoutTimeOffBasisPoints,
    preHolidayBasisPoints: rate.preHolidayBasisPoints,
    saturdayBasisPoints: rate.saturdayBasisPoints,
    tableSourceIds: table.sourceIds,
    workingTimeSourceIds: workingTime.sourceIds,
    rateSourceIds: rate.sourceIds,
  };
}
