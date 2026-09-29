import type { RuleTariffPackage } from "@/rules/contracts.generated";
import {
  lookupCaritasTimePremiumHourlyRatio,
  type CaritasTimePremiumHourlyRatio,
} from "./caritas-time-premium-hourly-ratio";

/** Sourced hourly reference values, before personal hours or entitlement. */
export type CaritasTimePremiumHourlyValues =
  | {
      readonly kind: "source-hourly-premium-values";
      readonly ratio: Extract<CaritasTimePremiumHourlyRatio, { kind: "source-hourly-table-ratio" }>;
      readonly hourlyTableCents: number;
      readonly nightCentsPerHour: number;
      readonly sundayCentsPerHour: number;
      readonly holidayWithTimeOffCentsPerHour: number;
      readonly holidayWithoutTimeOffCentsPerHour: number;
      readonly preHolidayCentsPerHour: number;
      readonly saturdayCentsPerHour: number;
      readonly roundingProvision: "AVR_ANLAGE_1_X_E";
      readonly roundingOrder: "HOURLY_TABLE_CENTS_THEN_PERCENTAGE";
    }
  | {
      readonly kind: "unavailable";
      readonly reason:
        | Extract<CaritasTimePremiumHourlyRatio, { kind: "unavailable" }>["reason"]
        | "ROUNDING_OVERFLOW";
    };

function roundNonnegativeRatioHalfUp(numerator: number, denominator: number): number | null {
  if (
    !Number.isSafeInteger(numerator) ||
    !Number.isSafeInteger(denominator) ||
    numerator < 0 ||
    denominator <= 0
  )
    return null;

  const whole = Math.floor(numerator / denominator);
  const remainder = numerator % denominator;
  const rounded = whole + (remainder >= denominator - remainder ? 1 : 0);
  return Number.isSafeInteger(rounded) ? rounded : null;
}

function percentOfRoundedHourlyCents(hourlyCents: number, basisPoints: number): number | null {
  const numerator = hourlyCents * basisPoints;
  return roundNonnegativeRatioHalfUp(numerator, 10_000);
}

export function lookupCaritasTimePremiumHourlyValues(
  pkg: RuleTariffPackage,
  date: string,
  variantId: string,
  regionId: string,
  groupId: string,
): CaritasTimePremiumHourlyValues {
  const ratio = lookupCaritasTimePremiumHourlyRatio(pkg, date, variantId, regionId, groupId);
  if (ratio.kind === "unavailable") return ratio;

  // The official 2025 table rounds the hourly Stufe-3 basis before applying percentages.
  const hourlyTableCents = roundNonnegativeRatioHalfUp(
    ratio.hourlyCentsNumerator,
    ratio.hourlyCentsDenominator,
  );
  if (hourlyTableCents === null) return { kind: "unavailable", reason: "ROUNDING_OVERFLOW" };

  const rate = ratio.reference;
  const nightCentsPerHour = percentOfRoundedHourlyCents(hourlyTableCents, rate.nightBasisPoints);
  const sundayCentsPerHour = percentOfRoundedHourlyCents(hourlyTableCents, rate.sundayBasisPoints);
  const holidayWithTimeOffCentsPerHour = percentOfRoundedHourlyCents(
    hourlyTableCents,
    rate.holidayWithTimeOffBasisPoints,
  );
  const holidayWithoutTimeOffCentsPerHour = percentOfRoundedHourlyCents(
    hourlyTableCents,
    rate.holidayWithoutTimeOffBasisPoints,
  );
  const preHolidayCentsPerHour = percentOfRoundedHourlyCents(
    hourlyTableCents,
    rate.preHolidayBasisPoints,
  );
  const saturdayCentsPerHour = percentOfRoundedHourlyCents(
    hourlyTableCents,
    rate.saturdayBasisPoints,
  );
  if (
    nightCentsPerHour === null ||
    sundayCentsPerHour === null ||
    holidayWithTimeOffCentsPerHour === null ||
    holidayWithoutTimeOffCentsPerHour === null ||
    preHolidayCentsPerHour === null ||
    saturdayCentsPerHour === null
  )
    return { kind: "unavailable", reason: "ROUNDING_OVERFLOW" };

  return {
    kind: "source-hourly-premium-values",
    ratio,
    hourlyTableCents,
    nightCentsPerHour,
    sundayCentsPerHour,
    holidayWithTimeOffCentsPerHour,
    holidayWithoutTimeOffCentsPerHour,
    preHolidayCentsPerHour,
    saturdayCentsPerHour,
    roundingProvision: "AVR_ANLAGE_1_X_E",
    roundingOrder: "HOURLY_TABLE_CENTS_THEN_PERCENTAGE",
  };
}
