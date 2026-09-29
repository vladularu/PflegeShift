import type { RuleTariffPackage } from "@/rules/contracts.generated";
import { lookupCaritasCareTable, type CaritasCareTableLookup } from "./caritas-care-table";
import {
  lookupCaritasFullTimeWeeklyMinutes,
  type CaritasWorkingTimeLookup,
} from "./caritas-working-time";

const MONTHLY_FACTOR_THOUSANDTHS = 4_348;

/** Sourced hourly pay for work performed, before an overtime premium or payable hours. */
export type CaritasOvertimeHourlyBase =
  | {
      readonly kind: "source-overtime-hourly-base";
      readonly packageId: string;
      readonly versionId: string;
      readonly date: string;
      readonly variantId: string;
      readonly regionId: string;
      readonly groupId: string;
      readonly personalStepId: string;
      readonly referenceStepId: string;
      readonly referenceMonthlyCents: number;
      readonly fullTimeWeeklyMinutes: number;
      readonly hourlyBaseCents: number;
      readonly tableId: string;
      readonly workingTimeRuleId: string;
      readonly sourceIds: readonly string[];
      readonly stepCapProvision: "AVR_ANLAGE_31_32_6_ABS_1_ANMERKUNG";
      readonly divisorProvision: "AVR_ANLAGE_1_IIA_A_SATZ_4";
      readonly roundingProvision: "AVR_ANLAGE_1_X_E";
    }
  | {
      readonly kind: "unavailable";
      readonly reason:
        | Extract<CaritasCareTableLookup, { kind: "unavailable" }>["reason"]
        | Extract<CaritasWorkingTimeLookup, { kind: "unavailable" }>["reason"]
        | "INVALID_STEP"
        | "INVALID_WORKING_TIME"
        | "AMOUNT_OVERFLOW";
    };

export function lookupCaritasOvertimeHourlyBase(
  pkg: RuleTariffPackage,
  date: string,
  variantId: string,
  regionId: string,
  groupId: string,
  personalStepId: string,
): CaritasOvertimeHourlyBase {
  if (pkg.status !== "DRAFT") return { kind: "unavailable", reason: "INVALID_PACKAGE" };
  if (!/^[1-6]$/u.test(personalStepId)) return { kind: "unavailable", reason: "INVALID_STEP" };

  // Check that the person's step exists, even when a higher step is capped at four.
  const personalTable = lookupCaritasCareTable(
    pkg,
    date,
    variantId,
    regionId,
    groupId,
    personalStepId,
  );
  if (personalTable.kind === "unavailable") return personalTable;

  const referenceStepId = String(Math.min(Number(personalStepId), 4));
  const referenceTable =
    referenceStepId === personalStepId
      ? personalTable
      : lookupCaritasCareTable(pkg, date, variantId, regionId, groupId, referenceStepId);
  if (referenceTable.kind === "unavailable") return referenceTable;

  const workingTime = lookupCaritasFullTimeWeeklyMinutes(pkg, date, variantId, regionId);
  if (workingTime.kind === "unavailable") return workingTime;
  if (workingTime.fullTimeWeeklyMinutes <= 0)
    return { kind: "unavailable", reason: "INVALID_WORKING_TIME" };

  const numerator = referenceTable.monthlyCents * 60_000;
  const denominator = MONTHLY_FACTOR_THOUSANDTHS * workingTime.fullTimeWeeklyMinutes;
  if (!Number.isSafeInteger(numerator) || !Number.isSafeInteger(denominator))
    return { kind: "unavailable", reason: "AMOUNT_OVERFLOW" };
  const wholeCents = Math.floor(numerator / denominator);
  const remainder = numerator % denominator;
  const hourlyBaseCents = wholeCents + (remainder >= denominator - remainder ? 1 : 0);
  if (!Number.isSafeInteger(hourlyBaseCents))
    return { kind: "unavailable", reason: "AMOUNT_OVERFLOW" };

  return {
    kind: "source-overtime-hourly-base",
    packageId: pkg.packageId,
    versionId: pkg.versionId,
    date,
    variantId,
    regionId,
    groupId: referenceTable.groupId,
    personalStepId,
    referenceStepId,
    referenceMonthlyCents: referenceTable.monthlyCents,
    fullTimeWeeklyMinutes: workingTime.fullTimeWeeklyMinutes,
    hourlyBaseCents,
    tableId: referenceTable.tableId,
    workingTimeRuleId: workingTime.ruleId,
    sourceIds: [...new Set([...referenceTable.sourceIds, ...workingTime.sourceIds])],
    stepCapProvision: "AVR_ANLAGE_31_32_6_ABS_1_ANMERKUNG",
    divisorProvision: "AVR_ANLAGE_1_IIA_A_SATZ_4",
    roundingProvision: "AVR_ANLAGE_1_X_E",
  };
}
