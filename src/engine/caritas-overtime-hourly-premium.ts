import type { RuleTariffPackage } from "@/rules/contracts.generated";
import { lookupCaritasCareTable, type CaritasCareTableLookup } from "./caritas-care-table";
import {
  lookupCaritasFullTimeWeeklyMinutes,
  type CaritasWorkingTimeLookup,
} from "./caritas-working-time";

const MONTHLY_FACTOR_THOUSANDTHS = 4_348;
const THIRTY_PERCENT_GROUPS = new Set(["p4", "p6", "p7", "p8", "p9", "p10", "p11"]);
const FIFTEEN_PERCENT_GROUPS = new Set(["p12", "p13", "p14", "p15", "p16"]);

/** Sourced Stufe-3 overtime premium per hour, without entitlement or payable hours. */
export type CaritasOvertimeHourlyPremium =
  | {
      readonly kind: "source-overtime-hourly-premium";
      readonly packageId: string;
      readonly versionId: string;
      readonly date: string;
      readonly variantId: string;
      readonly regionId: string;
      readonly groupId: string;
      readonly referenceStepId: "3";
      readonly hourlyTableCents: number;
      readonly premiumBasisPoints: 1500 | 3000;
      readonly premiumCentsPerHour: number;
      readonly tableId: string;
      readonly workingTimeRuleId: string;
      readonly sourceIds: readonly string[];
      readonly rateProvision: "AVR_ANLAGE_31_32_6_ABS_1_A";
      readonly divisorProvision: "AVR_ANLAGE_1_IIA_A_SATZ_4";
      readonly roundingProvision: "AVR_ANLAGE_1_X_E";
    }
  | {
      readonly kind: "unavailable";
      readonly reason:
        | Extract<CaritasCareTableLookup, { kind: "unavailable" }>["reason"]
        | Extract<CaritasWorkingTimeLookup, { kind: "unavailable" }>["reason"]
        | "UNSUPPORTED_GROUP"
        | "AMOUNT_OVERFLOW";
    };

export function lookupCaritasOvertimeHourlyPremium(
  pkg: RuleTariffPackage,
  date: string,
  variantId: string,
  regionId: string,
  groupId: string,
): CaritasOvertimeHourlyPremium {
  if (pkg.status !== "DRAFT") return { kind: "unavailable", reason: "INVALID_PACKAGE" };

  const table = lookupCaritasCareTable(pkg, date, variantId, regionId, groupId, "3");
  if (table.kind === "unavailable") return table;
  const workingTime = lookupCaritasFullTimeWeeklyMinutes(pkg, date, variantId, regionId);
  if (workingTime.kind === "unavailable") return workingTime;

  const premiumBasisPoints = THIRTY_PERCENT_GROUPS.has(table.groupId)
    ? 3000
    : FIFTEEN_PERCENT_GROUPS.has(table.groupId)
      ? 1500
      : null;
  if (premiumBasisPoints === null) return { kind: "unavailable", reason: "UNSUPPORTED_GROUP" };

  const hourlyNumerator = table.monthlyCents * 60_000;
  const hourlyDenominator = MONTHLY_FACTOR_THOUSANDTHS * workingTime.fullTimeWeeklyMinutes;
  if (
    !Number.isSafeInteger(hourlyNumerator) ||
    !Number.isSafeInteger(hourlyDenominator) ||
    hourlyDenominator <= 0
  )
    return { kind: "unavailable", reason: "AMOUNT_OVERFLOW" };
  const hourlyWholeCents = Math.floor(hourlyNumerator / hourlyDenominator);
  const hourlyRemainder = hourlyNumerator % hourlyDenominator;
  const hourlyTableCents =
    hourlyWholeCents + (hourlyRemainder >= hourlyDenominator - hourlyRemainder ? 1 : 0);
  if (!Number.isSafeInteger(hourlyTableCents))
    return { kind: "unavailable", reason: "AMOUNT_OVERFLOW" };

  const premiumNumerator = hourlyTableCents * premiumBasisPoints;
  if (!Number.isSafeInteger(premiumNumerator))
    return { kind: "unavailable", reason: "AMOUNT_OVERFLOW" };
  const premiumWholeCents = Math.floor(premiumNumerator / 10_000);
  const premiumRemainder = premiumNumerator % 10_000;
  const premiumCentsPerHour = premiumWholeCents + (premiumRemainder >= 5_000 ? 1 : 0);
  if (!Number.isSafeInteger(premiumCentsPerHour))
    return { kind: "unavailable", reason: "AMOUNT_OVERFLOW" };

  return {
    kind: "source-overtime-hourly-premium",
    packageId: pkg.packageId,
    versionId: pkg.versionId,
    date,
    variantId,
    regionId,
    groupId: table.groupId,
    referenceStepId: "3",
    hourlyTableCents,
    premiumBasisPoints,
    premiumCentsPerHour,
    tableId: table.tableId,
    workingTimeRuleId: workingTime.ruleId,
    sourceIds: [...new Set([...table.sourceIds, ...workingTime.sourceIds])],
    rateProvision: "AVR_ANLAGE_31_32_6_ABS_1_A",
    divisorProvision: "AVR_ANLAGE_1_IIA_A_SATZ_4",
    roundingProvision: "AVR_ANLAGE_1_X_E",
  };
}
