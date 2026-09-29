import type { RuleTariffPackage } from "@/rules/contracts.generated";
import {
  lookupCaritasShiftAllowanceRate,
  type CaritasShiftAllowanceRateLookup,
} from "./caritas-shift-allowance-rate";

export type CaritasHourlyShiftAllowanceType = "ALTERNATING_HOURLY" | "SHIFT_HOURLY";
export type CaritasHourlyShiftEntitlement = "CONFIRMED_NONPERMANENT" | "NOT_ENTITLED" | "UNKNOWN";

export interface CaritasPersonalHourlyShiftInput {
  readonly pkg: RuleTariffPackage;
  /** Date to which the externally reviewed payable hours have been assigned. */
  readonly serviceDate: string;
  readonly variantId: string;
  readonly regionId: string;
  readonly allowanceType: CaritasHourlyShiftAllowanceType;
  readonly entitlement: CaritasHourlyShiftEntitlement;
  readonly payableWholeHours: number;
  readonly hoursConfirmed: boolean;
}

/** Sourced amount for externally confirmed whole hours; never a complete salary. */
export type CaritasPersonalHourlyShiftResult =
  | {
      readonly kind: "personal-hourly-shift-allowance";
      readonly completeGross: false;
      readonly nonPermanentEntitlementConfirmed: true;
      readonly hoursConfirmed: true;
      readonly serviceDate: string;
      readonly allowanceType: CaritasHourlyShiftAllowanceType;
      readonly payableWholeHours: number;
      readonly rateCentsPerHour: number;
      readonly personalAmountCents: number;
      readonly packageId: string;
      readonly versionId: string;
      readonly rateId: string;
      readonly sourceIds: readonly string[];
    }
  | {
      readonly kind: "unavailable";
      readonly reason:
        | Extract<CaritasShiftAllowanceRateLookup, { kind: "unavailable" }>["reason"]
        | "ENTITLEMENT_UNCONFIRMED"
        | "NOT_ENTITLED"
        | "HOURS_UNCONFIRMED"
        | "INVALID_WHOLE_HOURS"
        | "UNKNOWN_ALLOWANCE_TYPE"
        | "AMOUNT_OVERFLOW";
    };

export function calculateCaritasPersonalHourlyShiftAllowance(
  input: CaritasPersonalHourlyShiftInput,
): CaritasPersonalHourlyShiftResult {
  if (input.entitlement === "NOT_ENTITLED") return { kind: "unavailable", reason: "NOT_ENTITLED" };
  if (input.entitlement !== "CONFIRMED_NONPERMANENT")
    return { kind: "unavailable", reason: "ENTITLEMENT_UNCONFIRMED" };
  if (input.hoursConfirmed !== true) return { kind: "unavailable", reason: "HOURS_UNCONFIRMED" };
  if (input.allowanceType !== "ALTERNATING_HOURLY" && input.allowanceType !== "SHIFT_HOURLY")
    return { kind: "unavailable", reason: "UNKNOWN_ALLOWANCE_TYPE" };
  if (
    !Number.isSafeInteger(input.payableWholeHours) ||
    input.payableWholeHours < 1 ||
    input.payableWholeHours > 24
  )
    return { kind: "unavailable", reason: "INVALID_WHOLE_HOURS" };
  if (input.pkg.status !== "DRAFT") return { kind: "unavailable", reason: "INVALID_PACKAGE" };

  const rate = lookupCaritasShiftAllowanceRate(
    input.pkg,
    input.serviceDate,
    input.variantId,
    input.regionId,
  );
  if (rate.kind === "unavailable") return rate;

  const rateCentsPerHour =
    input.allowanceType === "ALTERNATING_HOURLY"
      ? rate.alternatingHourlyCents
      : rate.shiftHourlyCents;
  const personalAmountCents = rateCentsPerHour * input.payableWholeHours;
  if (!Number.isSafeInteger(personalAmountCents))
    return { kind: "unavailable", reason: "AMOUNT_OVERFLOW" };

  return {
    kind: "personal-hourly-shift-allowance",
    completeGross: false,
    nonPermanentEntitlementConfirmed: true,
    hoursConfirmed: true,
    serviceDate: input.serviceDate,
    allowanceType: input.allowanceType,
    payableWholeHours: input.payableWholeHours,
    rateCentsPerHour,
    personalAmountCents,
    packageId: rate.packageId,
    versionId: rate.versionId,
    rateId: rate.rateId,
    sourceIds: rate.sourceIds,
  };
}
