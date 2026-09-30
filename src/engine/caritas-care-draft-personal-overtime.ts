import type { RuleTariffPackage } from "@/rules/contracts.generated";
import {
  lookupCaritasOvertimeHourlyValues,
  type CaritasOvertimeHourlyValues,
} from "./caritas-overtime-hourly-values";

export type CaritasOvertimeCashEntitlement = "CONFIRMED_CASH" | "NOT_ENTITLED" | "UNKNOWN";

export interface CaritasPersonalOvertimeInput {
  readonly pkg: RuleTariffPackage;
  /** Work date to which the externally reviewed payable hours have been assigned. */
  readonly serviceDate: string;
  readonly variantId: string;
  readonly regionId: string;
  readonly groupId: string;
  readonly personalStepId: string;
  /** External review has resolved employer order and applicable compensation rules. */
  readonly overtimeConfirmed: boolean;
  /** Cash payment of the actual work, separately from the overtime premium. */
  readonly baseEntitlement: CaritasOvertimeCashEntitlement;
  readonly premiumEntitlement: CaritasOvertimeCashEntitlement;
  /** The same whole hours must be payable in cash for both components. */
  readonly payableWholeHours: number;
  readonly hoursConfirmed: boolean;
}

/** One confirmed cash overtime amount; no automatic claim or complete salary. */
export type CaritasPersonalOvertimeResult =
  | {
      readonly kind: "personal-overtime";
      readonly completeGross: false;
      readonly serviceDate: string;
      readonly payableWholeHours: number;
      readonly baseAmountCents: number;
      readonly premiumAmountCents: number;
      readonly personalAmountCents: number;
      readonly overtimeConfirmed: true;
      readonly cashBaseEntitlementConfirmed: true;
      readonly cashPremiumEntitlementConfirmed: true;
      readonly hoursConfirmed: true;
      readonly hourlyValues: Extract<
        CaritasOvertimeHourlyValues,
        { kind: "source-overtime-hourly-values" }
      >;
    }
  | {
      readonly kind: "unavailable";
      readonly reason:
        | Extract<CaritasOvertimeHourlyValues, { kind: "unavailable" }>["reason"]
        | "OVERTIME_UNCONFIRMED"
        | "BASE_ENTITLEMENT_UNCONFIRMED"
        | "PREMIUM_ENTITLEMENT_UNCONFIRMED"
        | "BASE_NOT_ENTITLED"
        | "PREMIUM_NOT_ENTITLED"
        | "HOURS_UNCONFIRMED"
        | "INVALID_WHOLE_HOURS";
    };

export function calculateCaritasPersonalOvertime(
  input: CaritasPersonalOvertimeInput,
): CaritasPersonalOvertimeResult {
  if (input.overtimeConfirmed !== true)
    return { kind: "unavailable", reason: "OVERTIME_UNCONFIRMED" };
  if (input.baseEntitlement === "NOT_ENTITLED")
    return { kind: "unavailable", reason: "BASE_NOT_ENTITLED" };
  if (input.baseEntitlement !== "CONFIRMED_CASH")
    return { kind: "unavailable", reason: "BASE_ENTITLEMENT_UNCONFIRMED" };
  if (input.premiumEntitlement === "NOT_ENTITLED")
    return { kind: "unavailable", reason: "PREMIUM_NOT_ENTITLED" };
  if (input.premiumEntitlement !== "CONFIRMED_CASH")
    return { kind: "unavailable", reason: "PREMIUM_ENTITLEMENT_UNCONFIRMED" };
  if (input.hoursConfirmed !== true) return { kind: "unavailable", reason: "HOURS_UNCONFIRMED" };
  if (
    !Number.isSafeInteger(input.payableWholeHours) ||
    input.payableWholeHours < 1 ||
    input.payableWholeHours > 24
  )
    return { kind: "unavailable", reason: "INVALID_WHOLE_HOURS" };

  const hourlyValues = lookupCaritasOvertimeHourlyValues(
    input.pkg,
    input.serviceDate,
    input.variantId,
    input.regionId,
    input.groupId,
    input.personalStepId,
  );
  if (hourlyValues.kind === "unavailable") return hourlyValues;

  const baseAmountCents = hourlyValues.baseCentsPerHour * input.payableWholeHours;
  const premiumAmountCents = hourlyValues.premiumCentsPerHour * input.payableWholeHours;
  const personalAmountCents = baseAmountCents + premiumAmountCents;
  if (
    !Number.isSafeInteger(baseAmountCents) ||
    !Number.isSafeInteger(premiumAmountCents) ||
    !Number.isSafeInteger(personalAmountCents)
  )
    return { kind: "unavailable", reason: "AMOUNT_OVERFLOW" };

  return {
    kind: "personal-overtime",
    completeGross: false,
    serviceDate: input.serviceDate,
    payableWholeHours: input.payableWholeHours,
    baseAmountCents,
    premiumAmountCents,
    personalAmountCents,
    overtimeConfirmed: true,
    cashBaseEntitlementConfirmed: true,
    cashPremiumEntitlementConfirmed: true,
    hoursConfirmed: true,
    hourlyValues,
  };
}
