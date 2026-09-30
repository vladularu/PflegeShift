import type { RuleTariffPackage } from "@/rules/contracts.generated";
import {
  lookupCaritasOvertimeHourlyBase,
  type CaritasOvertimeHourlyBase,
} from "./caritas-overtime-hourly-base";
import {
  lookupCaritasOvertimeHourlyPremium,
  type CaritasOvertimeHourlyPremium,
} from "./caritas-overtime-hourly-premium";

/** Source-backed hourly components only; no overtime entitlement or payable hours. */
export type CaritasOvertimeHourlyValues =
  | {
      readonly kind: "source-overtime-hourly-values";
      readonly base: Extract<CaritasOvertimeHourlyBase, { kind: "source-overtime-hourly-base" }>;
      readonly premium: Extract<
        CaritasOvertimeHourlyPremium,
        { kind: "source-overtime-hourly-premium" }
      >;
      readonly baseCentsPerHour: number;
      readonly premiumCentsPerHour: number;
      readonly totalCentsPerHour: number;
      readonly sourceIds: readonly string[];
    }
  | {
      readonly kind: "unavailable";
      readonly reason:
        | Extract<CaritasOvertimeHourlyBase, { kind: "unavailable" }>["reason"]
        | Extract<CaritasOvertimeHourlyPremium, { kind: "unavailable" }>["reason"]
        | "SOURCE_MISMATCH"
        | "AMOUNT_OVERFLOW";
    };

export function lookupCaritasOvertimeHourlyValues(
  pkg: RuleTariffPackage,
  date: string,
  variantId: string,
  regionId: string,
  groupId: string,
  personalStepId: string,
): CaritasOvertimeHourlyValues {
  const base = lookupCaritasOvertimeHourlyBase(
    pkg,
    date,
    variantId,
    regionId,
    groupId,
    personalStepId,
  );
  if (base.kind === "unavailable") return base;

  const premium = lookupCaritasOvertimeHourlyPremium(pkg, date, variantId, regionId, groupId);
  if (premium.kind === "unavailable") return premium;
  if (
    base.packageId !== premium.packageId ||
    base.versionId !== premium.versionId ||
    base.tableId !== premium.tableId ||
    base.workingTimeRuleId !== premium.workingTimeRuleId ||
    base.groupId !== premium.groupId
  )
    return { kind: "unavailable", reason: "SOURCE_MISMATCH" };

  const totalCentsPerHour = base.hourlyBaseCents + premium.premiumCentsPerHour;
  if (!Number.isSafeInteger(totalCentsPerHour))
    return { kind: "unavailable", reason: "AMOUNT_OVERFLOW" };

  return {
    kind: "source-overtime-hourly-values",
    base,
    premium,
    baseCentsPerHour: base.hourlyBaseCents,
    premiumCentsPerHour: premium.premiumCentsPerHour,
    totalCentsPerHour,
    sourceIds: [...new Set([...base.sourceIds, ...premium.sourceIds])],
  };
}
