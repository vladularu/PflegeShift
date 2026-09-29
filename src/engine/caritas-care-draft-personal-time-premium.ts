import type { RuleTariffPackage } from "@/rules/contracts.generated";
import {
  lookupCaritasTimePremiumHourlyValues,
  type CaritasTimePremiumHourlyValues,
} from "./caritas-time-premium-hourly-values";

export type CaritasTimePremiumType =
  | "NIGHT"
  | "SUNDAY"
  | "HOLIDAY_WITH_TIME_OFF"
  | "HOLIDAY_WITHOUT_TIME_OFF"
  | "PRE_HOLIDAY"
  | "SATURDAY";

export type CaritasTimePremiumEntitlement = "CONFIRMED_CASH" | "NOT_ENTITLED" | "UNKNOWN";

export interface CaritasPersonalTimePremiumInput {
  readonly pkg: RuleTariffPackage;
  /** Date to which the externally reviewed payable hours have been assigned. */
  readonly serviceDate: string;
  readonly variantId: string;
  readonly regionId: string;
  readonly groupId: string;
  readonly premiumType: CaritasTimePremiumType;
  readonly entitlement: CaritasTimePremiumEntitlement;
  readonly payableWholeHours: number;
  readonly hoursConfirmed: boolean;
  /** The employer has resolved category conditions and any overlapping premiums. */
  readonly categoryAndOverlapConfirmed: boolean;
}

/** One externally confirmed cash premium, never a complete salary or automatic claim. */
export type CaritasPersonalTimePremiumResult =
  | {
      readonly kind: "personal-time-premium";
      readonly completeGross: false;
      readonly serviceDate: string;
      readonly premiumType: CaritasTimePremiumType;
      readonly payableWholeHours: number;
      readonly rateCentsPerHour: number;
      readonly personalAmountCents: number;
      readonly cashEntitlementConfirmed: true;
      readonly hoursConfirmed: true;
      readonly categoryAndOverlapConfirmed: true;
      readonly hourlyValues: Extract<
        CaritasTimePremiumHourlyValues,
        { kind: "source-hourly-premium-values" }
      >;
    }
  | {
      readonly kind: "unavailable";
      readonly reason:
        | Extract<CaritasTimePremiumHourlyValues, { kind: "unavailable" }>["reason"]
        | "ENTITLEMENT_UNCONFIRMED"
        | "NOT_ENTITLED"
        | "HOURS_UNCONFIRMED"
        | "CATEGORY_OR_OVERLAP_UNCONFIRMED"
        | "INVALID_WHOLE_HOURS"
        | "UNKNOWN_PREMIUM_TYPE"
        | "AMOUNT_OVERFLOW";
    };

function rateFor(
  values: Extract<CaritasTimePremiumHourlyValues, { kind: "source-hourly-premium-values" }>,
  premiumType: CaritasTimePremiumType,
): number | null {
  switch (premiumType) {
    case "NIGHT":
      return values.nightCentsPerHour;
    case "SUNDAY":
      return values.sundayCentsPerHour;
    case "HOLIDAY_WITH_TIME_OFF":
      return values.holidayWithTimeOffCentsPerHour;
    case "HOLIDAY_WITHOUT_TIME_OFF":
      return values.holidayWithoutTimeOffCentsPerHour;
    case "PRE_HOLIDAY":
      return values.preHolidayCentsPerHour;
    case "SATURDAY":
      return values.saturdayCentsPerHour;
    default:
      return null;
  }
}

export function calculateCaritasPersonalTimePremium(
  input: CaritasPersonalTimePremiumInput,
): CaritasPersonalTimePremiumResult {
  if (input.entitlement === "NOT_ENTITLED") return { kind: "unavailable", reason: "NOT_ENTITLED" };
  if (input.entitlement !== "CONFIRMED_CASH")
    return { kind: "unavailable", reason: "ENTITLEMENT_UNCONFIRMED" };
  if (input.hoursConfirmed !== true) return { kind: "unavailable", reason: "HOURS_UNCONFIRMED" };
  if (input.categoryAndOverlapConfirmed !== true)
    return { kind: "unavailable", reason: "CATEGORY_OR_OVERLAP_UNCONFIRMED" };
  if (
    !Number.isSafeInteger(input.payableWholeHours) ||
    input.payableWholeHours < 1 ||
    input.payableWholeHours > 24
  )
    return { kind: "unavailable", reason: "INVALID_WHOLE_HOURS" };
  if (input.pkg.status !== "DRAFT") return { kind: "unavailable", reason: "INVALID_PACKAGE" };

  const hourlyValues = lookupCaritasTimePremiumHourlyValues(
    input.pkg,
    input.serviceDate,
    input.variantId,
    input.regionId,
    input.groupId,
  );
  if (hourlyValues.kind === "unavailable") return hourlyValues;

  const rateCentsPerHour = rateFor(hourlyValues, input.premiumType);
  if (rateCentsPerHour === null) return { kind: "unavailable", reason: "UNKNOWN_PREMIUM_TYPE" };
  const personalAmountCents = rateCentsPerHour * input.payableWholeHours;
  if (!Number.isSafeInteger(personalAmountCents))
    return { kind: "unavailable", reason: "AMOUNT_OVERFLOW" };

  return {
    kind: "personal-time-premium",
    completeGross: false,
    serviceDate: input.serviceDate,
    premiumType: input.premiumType,
    payableWholeHours: input.payableWholeHours,
    rateCentsPerHour,
    personalAmountCents,
    cashEntitlementConfirmed: true,
    hoursConfirmed: true,
    categoryAndOverlapConfirmed: true,
    hourlyValues,
  };
}
