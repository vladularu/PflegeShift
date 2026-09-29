import {
  calculateCaritasCareDraftMonthlyComponents,
  type CaritasCareDraftMonthlyComponentsInput,
  type CaritasCareDraftMonthlyComponentsResult,
} from "./caritas-care-draft-monthly-components";
import {
  calculateCaritasPersonalMonthlyShiftAllowance,
  type CaritasMonthlyShiftAllowanceType,
  type CaritasMonthlyShiftEntitlement,
  type CaritasPersonalMonthlyShiftResult,
} from "./caritas-care-draft-personal-monthly-shift";

export interface CaritasCareDraftMonthlyWithShiftInput extends CaritasCareDraftMonthlyComponentsInput {
  readonly shiftAllowanceType: CaritasMonthlyShiftAllowanceType;
  readonly shiftEntitlement: CaritasMonthlyShiftEntitlement;
  readonly fullMonthWeeklyTimeConfirmed: boolean;
}

type ExistingPosition = Extract<
  CaritasCareDraftMonthlyComponentsResult,
  { kind: "draft-known-monthly-components" }
>["positions"][number];

type MonthlyShiftPosition = {
  readonly component: "monthly-shift-allowance";
  readonly allowanceType: CaritasMonthlyShiftAllowanceType;
  readonly amountCents: number;
  readonly sourceIds: readonly string[];
  readonly rateSourceIds: readonly string[];
  readonly workingTimeSourceIds: readonly string[];
};

type BaseUnavailable = Extract<CaritasCareDraftMonthlyComponentsResult, { kind: "unavailable" }>;
type ShiftUnavailable = Extract<CaritasPersonalMonthlyShiftResult, { kind: "unavailable" }>;

export type CaritasCareDraftMonthlyWithShiftResult =
  | {
      readonly kind: "draft-known-monthly-components-with-shift";
      readonly completeGross: false;
      readonly knownSubtotalCents: number;
      readonly packageId: string;
      readonly versionId: string;
      readonly month: string;
      readonly excludedComponents: readonly [
        "OTHER_SHIFT_ALLOWANCES",
        "TIME_PREMIUMS",
        "OVERTIME",
        "ANNUAL_PAYMENT",
        "OTHER_LOCAL_TERMS",
      ];
      readonly positions: readonly (ExistingPosition | MonthlyShiftPosition)[];
    }
  | BaseUnavailable
  | (ShiftUnavailable & { readonly component: "monthly-shift-allowance" })
  | { readonly kind: "unavailable"; readonly reason: "AMOUNT_OVERFLOW" };

/** A sourced DRAFT subtotal with exactly one externally confirmed monthly shift allowance. */
export function calculateCaritasCareDraftMonthlyComponentsWithShift(
  input: CaritasCareDraftMonthlyWithShiftInput,
): CaritasCareDraftMonthlyWithShiftResult {
  const base = calculateCaritasCareDraftMonthlyComponents(input);
  if (base.kind === "unavailable") return base;

  const shift = calculateCaritasPersonalMonthlyShiftAllowance({
    pkg: input.pkg,
    month: input.month,
    variantId: input.variantId,
    regionId: input.regionId,
    weeklyMinutes: input.weeklyMinutes,
    allowanceType: input.shiftAllowanceType,
    entitlement: input.shiftEntitlement,
    fullMonthEmploymentConfirmed: input.fullMonthEmploymentConfirmed,
    fullMonthWeeklyTimeConfirmed: input.fullMonthWeeklyTimeConfirmed,
  });
  if (shift.kind === "unavailable") return { ...shift, component: "monthly-shift-allowance" };

  const knownSubtotalCents = base.knownSubtotalCents + shift.personalMonthlyCents;
  if (!Number.isSafeInteger(knownSubtotalCents))
    return { kind: "unavailable", reason: "AMOUNT_OVERFLOW" };

  return {
    kind: "draft-known-monthly-components-with-shift",
    completeGross: false,
    knownSubtotalCents,
    packageId: base.packageId,
    versionId: base.versionId,
    month: base.month,
    excludedComponents: [
      "OTHER_SHIFT_ALLOWANCES",
      "TIME_PREMIUMS",
      "OVERTIME",
      "ANNUAL_PAYMENT",
      "OTHER_LOCAL_TERMS",
    ],
    positions: [
      ...base.positions,
      {
        component: "monthly-shift-allowance",
        allowanceType: shift.allowanceType,
        amountCents: shift.personalMonthlyCents,
        sourceIds: [...new Set([...shift.rateSourceIds, ...shift.workingTimeSourceIds])],
        rateSourceIds: shift.rateSourceIds,
        workingTimeSourceIds: shift.workingTimeSourceIds,
      },
    ],
  };
}
