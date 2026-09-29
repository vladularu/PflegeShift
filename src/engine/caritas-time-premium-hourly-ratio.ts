import type { RuleTariffPackage } from "@/rules/contracts.generated";
import {
  lookupCaritasTimePremiumReference,
  type CaritasTimePremiumReference,
} from "./caritas-time-premium-reference";

const MONTHLY_FACTOR_THOUSANDTHS = 4_348;

/** Exact hourly Stufe-3 table ratio; no cent rounding or payable premium. */
export type CaritasTimePremiumHourlyRatio =
  | {
      readonly kind: "source-hourly-table-ratio";
      readonly reference: Extract<
        CaritasTimePremiumReference,
        { kind: "source-time-premium-reference" }
      >;
      readonly monthlyFactorThousandths: 4348;
      readonly hourlyCentsNumerator: number;
      readonly hourlyCentsDenominator: number;
      readonly divisorProvision: "AVR_ANLAGE_1_IIA_A_SATZ_4";
    }
  | {
      readonly kind: "unavailable";
      readonly reason:
        Extract<CaritasTimePremiumReference, { kind: "unavailable" }>["reason"] | "RATIO_OVERFLOW";
    };

export function lookupCaritasTimePremiumHourlyRatio(
  pkg: RuleTariffPackage,
  date: string,
  variantId: string,
  regionId: string,
  groupId: string,
): CaritasTimePremiumHourlyRatio {
  const reference = lookupCaritasTimePremiumReference(pkg, date, variantId, regionId, groupId);
  if (reference.kind === "unavailable") return reference;

  // monthly cents / (4.348 * weekly minutes / 60), kept as an exact ratio.
  const hourlyCentsNumerator = reference.fullTimeMonthlyCents * 60_000;
  const hourlyCentsDenominator = MONTHLY_FACTOR_THOUSANDTHS * reference.fullTimeWeeklyMinutes;
  if (
    !Number.isSafeInteger(hourlyCentsNumerator) ||
    !Number.isSafeInteger(hourlyCentsDenominator) ||
    hourlyCentsDenominator <= 0
  )
    return { kind: "unavailable", reason: "RATIO_OVERFLOW" };

  return {
    kind: "source-hourly-table-ratio",
    reference,
    monthlyFactorThousandths: MONTHLY_FACTOR_THOUSANDTHS,
    hourlyCentsNumerator,
    hourlyCentsDenominator,
    divisorProvision: "AVR_ANLAGE_1_IIA_A_SATZ_4",
  };
}
