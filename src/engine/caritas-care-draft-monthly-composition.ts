import {
  calculateCaritasCareDraftMonthlyComponents,
  type CaritasCareDraftMonthlyComponentsInput,
  type CaritasCareDraftMonthlyComponentsResult,
} from "./caritas-care-draft-monthly-components";
import {
  calculateCaritasCareDraftMonthlyComponentsWithShift,
  type CaritasCareDraftMonthlyWithShiftInput,
  type CaritasCareDraftMonthlyWithShiftResult,
} from "./caritas-care-draft-monthly-components-with-shift";
import {
  calculateCaritasCareDraftMonthlyWithTimePremiums,
  type CaritasConfirmedTimePremiumLine,
  type CaritasCareDraftMonthlyWithTimePremiumsResult,
} from "./caritas-care-draft-monthly-with-time-premiums";
import {
  calculateCaritasCareDraftMonthlyWithOvertime,
  type CaritasConfirmedOvertimeLine,
  type CaritasCareDraftMonthlyWithOvertimeResult,
} from "./caritas-care-draft-monthly-with-overtime";
import {
  calculateCaritasCareDraftMonthlyWithHourlyShift,
  type CaritasConfirmedHourlyShiftLine,
  type CaritasCareDraftMonthlyWithHourlyShiftResult,
} from "./caritas-care-draft-monthly-with-hourly-shift";

export interface CaritasCareDraftMonthlyCompositionInput extends CaritasCareDraftMonthlyComponentsInput {
  /** null explicitly omits monthly shift allowances from this incomplete subtotal. */
  readonly monthlyShift: Pick<
    CaritasCareDraftMonthlyWithShiftInput,
    "shiftAllowanceType" | "shiftEntitlement" | "fullMonthWeeklyTimeConfirmed"
  > | null;
  /** An empty list explicitly omits hourly shift allowances; it does not establish zero entitlement. */
  readonly confirmedHourlyShift: readonly CaritasConfirmedHourlyShiftLine[];
  /** An empty list explicitly omits time premiums; it does not establish zero entitlement. */
  readonly confirmedPremiums: readonly CaritasConfirmedTimePremiumLine[];
  /** An empty list explicitly omits overtime; it does not establish zero entitlement. */
  readonly confirmedOvertime: readonly CaritasConfirmedOvertimeLine[];
  /** External review binds the supplied cash positions to this month and rules out duplicate inclusion. */
  readonly monthlyCompositionConfirmed: boolean;
}

type BaseSuccess = Extract<
  CaritasCareDraftMonthlyComponentsResult,
  { kind: "draft-known-monthly-components" }
>;
type ShiftSuccess = Extract<
  CaritasCareDraftMonthlyWithShiftResult,
  { kind: "draft-known-monthly-components-with-shift" }
>;
type TimeSuccess = Extract<
  CaritasCareDraftMonthlyWithTimePremiumsResult,
  { kind: "draft-known-monthly-components-with-time-premiums" }
>;
type OvertimeSuccess = Extract<
  CaritasCareDraftMonthlyWithOvertimeResult,
  { kind: "draft-known-monthly-components-with-overtime" }
>;
type HourlyShiftSuccess = Extract<
  CaritasCareDraftMonthlyWithHourlyShiftResult,
  { kind: "draft-known-monthly-components-with-hourly-shift" }
>;
type Position =
  | BaseSuccess["positions"][number]
  | ShiftSuccess["positions"][number]
  | TimeSuccess["positions"][number]
  | OvertimeSuccess["positions"][number]
  | HourlyShiftSuccess["positions"][number];
type PartialResult =
  | CaritasCareDraftMonthlyComponentsResult
  | CaritasCareDraftMonthlyWithShiftResult
  | CaritasCareDraftMonthlyWithTimePremiumsResult
  | CaritasCareDraftMonthlyWithOvertimeResult
  | CaritasCareDraftMonthlyWithHourlyShiftResult;

export type CaritasCareDraftMonthlyCompositionResult =
  | {
      readonly kind: "draft-known-monthly-composition";
      readonly completeGross: false;
      readonly packageId: string;
      readonly versionId: string;
      readonly month: string;
      readonly knownSubtotalCents: number;
      readonly knownBaseAndCareSubtotalCents: number;
      readonly knownMonthlyShiftSubtotalCents: number;
      readonly knownHourlyShiftSubtotalCents: number;
      readonly knownTimePremiumSubtotalCents: number;
      readonly knownOvertimeBaseSubtotalCents: number;
      readonly knownOvertimePremiumSubtotalCents: number;
      readonly knownOvertimeSubtotalCents: number;
      readonly positions: readonly Position[];
      readonly excludedComponents: readonly [
        "SHIFT_ALLOWANCES" | "OTHER_SHIFT_ALLOWANCES",
        "TIME_PREMIUMS" | "OTHER_TIME_PREMIUMS",
        "OVERTIME" | "OTHER_OVERTIME",
        "ANNUAL_PAYMENT",
        "OTHER_LOCAL_TERMS",
      ];
    }
  | Extract<PartialResult, { kind: "unavailable" }>
  | {
      readonly kind: "unavailable";
      readonly reason:
        | "MONTHLY_COMPOSITION_UNCONFIRMED"
        | "INVALID_COMPONENT_LINES"
        | "INVALID_MONTHLY_SHIFT"
        | "MIXED_SHIFT_FORMS_UNSUPPORTED"
        | "INVALID_PREMIUM_LINE"
        | "INVALID_DATE";
      readonly component: "monthly-composition" | "confirmed-time-premium";
      readonly lineId?: string;
    };

/** A combined, explicitly incomplete DRAFT subtotal from one shared monthly selection. */
export function calculateCaritasCareDraftMonthlyComposition(
  input: CaritasCareDraftMonthlyCompositionInput,
): CaritasCareDraftMonthlyCompositionResult {
  if (input.monthlyCompositionConfirmed !== true)
    return {
      kind: "unavailable",
      reason: "MONTHLY_COMPOSITION_UNCONFIRMED",
      component: "monthly-composition",
    };
  if (
    !Array.isArray(input.confirmedPremiums) ||
    !Array.isArray(input.confirmedOvertime) ||
    !Array.isArray(input.confirmedHourlyShift)
  )
    return {
      kind: "unavailable",
      reason: "INVALID_COMPONENT_LINES",
      component: "monthly-composition",
    };
  if (
    input.monthlyShift !== null &&
    (!input.monthlyShift ||
      typeof input.monthlyShift !== "object" ||
      Array.isArray(input.monthlyShift))
  )
    return {
      kind: "unavailable",
      reason: "INVALID_MONTHLY_SHIFT",
      component: "monthly-composition",
    };

  // Mixed monthly/hourly forms need a separately reviewed contract, not an inferred legal rule.
  if (input.monthlyShift !== null && input.confirmedHourlyShift.length > 0)
    return {
      kind: "unavailable",
      reason: "MIXED_SHIFT_FORMS_UNSUPPORTED",
      component: "monthly-composition",
    };

  const base = calculateCaritasCareDraftMonthlyComponents(input);
  if (base.kind === "unavailable") return base;
  const normalizedPremiums: CaritasConfirmedTimePremiumLine[] = [];
  for (const line of input.confirmedPremiums) {
    if (!line || typeof line !== "object")
      return {
        kind: "unavailable",
        reason: "INVALID_PREMIUM_LINE",
        component: "confirmed-time-premium",
      };
    if (typeof line.lineId !== "string" || line.lineId.trim() === "")
      return {
        kind: "unavailable",
        reason: "INVALID_PREMIUM_LINE_ID",
        component: "confirmed-time-premium",
      };
    const lineId = line.lineId.trim();
    if (typeof line.serviceDate !== "string")
      return {
        kind: "unavailable",
        reason: "INVALID_DATE",
        component: "confirmed-time-premium",
        lineId,
      };
    normalizedPremiums.push({ ...line, lineId });
  }

  const shift =
    input.monthlyShift === null
      ? null
      : calculateCaritasCareDraftMonthlyComponentsWithShift({
          ...input,
          shiftAllowanceType: input.monthlyShift.shiftAllowanceType,
          shiftEntitlement: input.monthlyShift.shiftEntitlement,
          fullMonthWeeklyTimeConfirmed: input.monthlyShift.fullMonthWeeklyTimeConfirmed,
        });
  if (shift?.kind === "unavailable") return shift;
  const hourlyShift =
    input.confirmedHourlyShift.length === 0
      ? null
      : calculateCaritasCareDraftMonthlyWithHourlyShift(input);
  if (hourlyShift?.kind === "unavailable") return hourlyShift;
  const time =
    normalizedPremiums.length === 0
      ? null
      : calculateCaritasCareDraftMonthlyWithTimePremiums({
          ...input,
          confirmedPremiums: normalizedPremiums,
        });
  if (time?.kind === "unavailable") return time;
  const overtime =
    input.confirmedOvertime.length === 0
      ? null
      : calculateCaritasCareDraftMonthlyWithOvertime(input);
  if (overtime?.kind === "unavailable") return overtime;

  // Each partial helper repeats the monthly basis. Keep it once and append only its additional family.
  const shiftPositions =
    shift?.positions.filter((position) => position.component === "monthly-shift-allowance") ?? [];
  const hourlyShiftPositions =
    hourlyShift?.positions.filter(
      (position) => position.component === "confirmed-hourly-shift-allowance",
    ) ?? [];
  const timePositions =
    time?.positions.filter((position) => position.component === "confirmed-time-premium") ?? [];
  const overtimePositions =
    overtime?.positions.filter(
      (position) =>
        position.component === "confirmed-overtime-base" ||
        position.component === "confirmed-overtime-premium",
    ) ?? [];
  const positions: Position[] = [
    ...base.positions,
    ...shiftPositions,
    ...hourlyShiftPositions,
    ...timePositions,
    ...overtimePositions,
  ];
  const knownMonthlyShiftSubtotalCents = shiftPositions.reduce(
    (sum, position) => sum + position.amountCents,
    0,
  );
  const knownSubtotalCents = positions.reduce((sum, position) => sum + position.amountCents, 0);
  if (
    !Number.isSafeInteger(knownMonthlyShiftSubtotalCents) ||
    !Number.isSafeInteger(knownSubtotalCents)
  )
    return { kind: "unavailable", reason: "AMOUNT_OVERFLOW" };
  return {
    kind: "draft-known-monthly-composition",
    completeGross: false,
    packageId: base.packageId,
    versionId: base.versionId,
    month: base.month,
    knownSubtotalCents,
    knownBaseAndCareSubtotalCents: base.knownSubtotalCents,
    knownMonthlyShiftSubtotalCents,
    knownHourlyShiftSubtotalCents: hourlyShift?.knownHourlyShiftSubtotalCents ?? 0,
    knownTimePremiumSubtotalCents: time?.knownTimePremiumSubtotalCents ?? 0,
    knownOvertimeBaseSubtotalCents: overtime?.knownOvertimeBaseSubtotalCents ?? 0,
    knownOvertimePremiumSubtotalCents: overtime?.knownOvertimePremiumSubtotalCents ?? 0,
    knownOvertimeSubtotalCents: overtime?.knownOvertimeSubtotalCents ?? 0,
    positions,
    excludedComponents: [
      shift === null && hourlyShift === null ? "SHIFT_ALLOWANCES" : "OTHER_SHIFT_ALLOWANCES",
      time === null ? "TIME_PREMIUMS" : "OTHER_TIME_PREMIUMS",
      overtime === null ? "OVERTIME" : "OTHER_OVERTIME",
      "ANNUAL_PAYMENT",
      "OTHER_LOCAL_TERMS",
    ],
  };
}
