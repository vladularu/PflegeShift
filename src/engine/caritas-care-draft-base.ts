import type { RuleTariffPackage } from "@/rules/contracts.generated";
import { lookupCaritasCareTable, type CaritasCareTableLookup } from "./caritas-care-table";
import {
  lookupCaritasFullTimeWeeklyMinutes,
  type CaritasWorkingTimeLookup,
} from "./caritas-working-time";

/** One dated table component from a DRAFT package, never a complete gross salary. */
export type CaritasCareDraftBase =
  | {
      readonly kind: "personal-table-base";
      readonly completeGross: false;
      readonly fullTimeMonthlyCents: number;
      readonly personalMonthlyCents: number;
      readonly weeklyMinutes: number;
      readonly fullTimeWeeklyMinutes: number;
      readonly packageId: string;
      readonly versionId: string;
      readonly tableId: string;
      readonly workingTimeRuleId: string;
      readonly groupId: string;
      readonly stepId: string;
      readonly sourceIds: readonly string[];
      readonly prorationProvision: "AVR_ANLAGE_31_32_12A";
    }
  | {
      readonly kind: "unavailable";
      readonly reason:
        | Extract<CaritasCareTableLookup, { kind: "unavailable" }>["reason"]
        | Extract<CaritasWorkingTimeLookup, { kind: "unavailable" }>["reason"]
        | "INVALID_WEEKLY_TIME"
        | "AMOUNT_OVERFLOW";
    };

/** AVR Anlagen 31/32 § 12a: agreed weekly time divided by comparable full-time weekly time. */
export function calculateCaritasCareDraftBase(
  pkg: RuleTariffPackage,
  date: string,
  variantId: string,
  regionId: string,
  groupId: string,
  stepId: string,
  weeklyMinutes: number,
): CaritasCareDraftBase {
  if (pkg.status !== "DRAFT") return { kind: "unavailable", reason: "INVALID_PACKAGE" };

  const table = lookupCaritasCareTable(pkg, date, variantId, regionId, groupId, stepId);
  if (table.kind === "unavailable") return table;

  const workingTime = lookupCaritasFullTimeWeeklyMinutes(pkg, date, variantId, regionId);
  if (workingTime.kind === "unavailable") return workingTime;

  const fullTimeWeeklyMinutes = workingTime.fullTimeWeeklyMinutes;
  if (
    !Number.isSafeInteger(weeklyMinutes) ||
    weeklyMinutes <= 0 ||
    weeklyMinutes > fullTimeWeeklyMinutes
  )
    return { kind: "unavailable", reason: "INVALID_WEEKLY_TIME" };

  const numerator = table.monthlyCents * weeklyMinutes;
  if (!Number.isSafeInteger(numerator)) return { kind: "unavailable", reason: "AMOUNT_OVERFLOW" };
  const wholeCents = Math.floor(numerator / fullTimeWeeklyMinutes);
  const remainder = numerator % fullTimeWeeklyMinutes;
  const personalMonthlyCents = wholeCents + (remainder * 2 >= fullTimeWeeklyMinutes ? 1 : 0);
  if (!Number.isSafeInteger(personalMonthlyCents))
    return { kind: "unavailable", reason: "AMOUNT_OVERFLOW" };

  return {
    kind: "personal-table-base",
    completeGross: false,
    fullTimeMonthlyCents: table.monthlyCents,
    personalMonthlyCents,
    weeklyMinutes,
    fullTimeWeeklyMinutes,
    packageId: table.packageId,
    versionId: table.versionId,
    tableId: table.tableId,
    workingTimeRuleId: workingTime.ruleId,
    groupId: table.groupId,
    stepId: table.stepId,
    sourceIds: [...new Set([...table.sourceIds, ...workingTime.sourceIds])],
    prorationProvision: "AVR_ANLAGE_31_32_12A",
  };
}
