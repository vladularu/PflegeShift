import {
  calculateCaritasCareDraftMonthlyComponents,
  type CaritasCareDraftMonthlyComponentsInput,
  type CaritasCareDraftMonthlyComponentsResult,
} from "./caritas-care-draft-monthly-components";
import {
  calculateCaritasPersonalHourlyShiftAllowance,
  type CaritasPersonalHourlyShiftInput,
  type CaritasPersonalHourlyShiftResult,
} from "./caritas-care-draft-personal-hourly-shift";

export interface CaritasConfirmedHourlyShiftLine extends Pick<
  CaritasPersonalHourlyShiftInput,
  "serviceDate" | "allowanceType" | "entitlement" | "payableWholeHours" | "hoursConfirmed"
> {
  /** Stable identity of the externally reviewed payable hours, unique across both hourly forms. */
  readonly lineId: string;
  /** External review assigns the amount to this month and rules out prior inclusion. */
  readonly monthlyAllocationConfirmed: boolean;
  /** External review confirms the chosen nonpermanent form and excludes overlapping allowance hours. */
  readonly categoryAndOverlapConfirmed: boolean;
}

export interface CaritasCareDraftMonthlyWithHourlyShiftInput extends CaritasCareDraftMonthlyComponentsInput {
  readonly confirmedHourlyShift: readonly CaritasConfirmedHourlyShiftLine[];
}

type BaseSuccess = Extract<
  CaritasCareDraftMonthlyComponentsResult,
  { kind: "draft-known-monthly-components" }
>;
type HourlySuccess = Extract<
  CaritasPersonalHourlyShiftResult,
  { kind: "personal-hourly-shift-allowance" }
>;
type HourlyPosition = {
  readonly component: "confirmed-hourly-shift-allowance";
  readonly lineId: string;
  readonly serviceDate: string;
  readonly allowanceType: HourlySuccess["allowanceType"];
  readonly payableWholeHours: number;
  readonly rateCentsPerHour: number;
  readonly amountCents: number;
  readonly rateId: string;
  readonly sourceIds: readonly string[];
};

export type CaritasCareDraftMonthlyWithHourlyShiftResult =
  | {
      readonly kind: "draft-known-monthly-components-with-hourly-shift";
      readonly completeGross: false;
      readonly packageId: string;
      readonly versionId: string;
      readonly month: string;
      readonly knownSubtotalCents: number;
      readonly knownHourlyShiftSubtotalCents: number;
      readonly positions: readonly (BaseSuccess["positions"][number] | HourlyPosition)[];
      readonly excludedComponents: readonly [
        "OTHER_SHIFT_ALLOWANCES",
        "TIME_PREMIUMS",
        "OVERTIME",
        "ANNUAL_PAYMENT",
        "OTHER_LOCAL_TERMS",
      ];
    }
  | Extract<CaritasCareDraftMonthlyComponentsResult, { kind: "unavailable" }>
  | (Extract<CaritasPersonalHourlyShiftResult, { kind: "unavailable" }> & {
      readonly component: "confirmed-hourly-shift-allowance";
      readonly lineId: string;
    })
  | {
      readonly kind: "unavailable";
      readonly reason:
        | "INVALID_HOURLY_SHIFT_LINES"
        | "NO_CONFIRMED_HOURLY_SHIFT_LINES"
        | "INVALID_HOURLY_SHIFT_LINE"
        | "INVALID_HOURLY_SHIFT_LINE_ID"
        | "DUPLICATE_HOURLY_SHIFT_LINE"
        | "MONTHLY_ALLOCATION_UNCONFIRMED"
        | "CATEGORY_OR_OVERLAP_UNCONFIRMED"
        | "INVALID_DATE"
        | "HOURLY_SHIFT_OUTSIDE_MONTH"
        | "DAILY_HOURS_EXCEEDED"
        | "AMOUNT_OVERFLOW";
      readonly component: "confirmed-hourly-shift-allowance";
      readonly lineId?: string;
    };

/** Incomplete DRAFT subtotal for independently confirmed nonpermanent payable hours. */
export function calculateCaritasCareDraftMonthlyWithHourlyShift(
  input: CaritasCareDraftMonthlyWithHourlyShiftInput,
): CaritasCareDraftMonthlyWithHourlyShiftResult {
  const base = calculateCaritasCareDraftMonthlyComponents(input);
  if (base.kind === "unavailable") return base;
  const component = "confirmed-hourly-shift-allowance" as const;
  if (!Array.isArray(input.confirmedHourlyShift))
    return { kind: "unavailable", reason: "INVALID_HOURLY_SHIFT_LINES", component };
  if (input.confirmedHourlyShift.length === 0)
    return { kind: "unavailable", reason: "NO_CONFIRMED_HOURLY_SHIFT_LINES", component };

  const seenIds = new Set<string>();
  const hoursByDate = new Map<string, number>();
  const positions: (BaseSuccess["positions"][number] | HourlyPosition)[] = [...base.positions];
  let knownHourlyShiftSubtotalCents = 0;
  for (const line of input.confirmedHourlyShift) {
    if (!line || typeof line !== "object" || Array.isArray(line))
      return { kind: "unavailable", reason: "INVALID_HOURLY_SHIFT_LINE", component };
    if (typeof line.lineId !== "string" || line.lineId.trim() === "")
      return { kind: "unavailable", reason: "INVALID_HOURLY_SHIFT_LINE_ID", component };
    const lineId = line.lineId.trim();
    if (seenIds.has(lineId))
      return { kind: "unavailable", reason: "DUPLICATE_HOURLY_SHIFT_LINE", component, lineId };
    seenIds.add(lineId);
    if (line.monthlyAllocationConfirmed !== true)
      return { kind: "unavailable", reason: "MONTHLY_ALLOCATION_UNCONFIRMED", component, lineId };
    if (line.categoryAndOverlapConfirmed !== true)
      return { kind: "unavailable", reason: "CATEGORY_OR_OVERLAP_UNCONFIRMED", component, lineId };
    if (typeof line.serviceDate !== "string")
      return { kind: "unavailable", reason: "INVALID_DATE", component, lineId };
    if (!line.serviceDate.startsWith(base.month + "-"))
      return { kind: "unavailable", reason: "HOURLY_SHIFT_OUTSIDE_MONTH", component, lineId };

    const hourly = calculateCaritasPersonalHourlyShiftAllowance({
      pkg: input.pkg,
      variantId: input.variantId,
      regionId: input.regionId,
      serviceDate: line.serviceDate,
      allowanceType: line.allowanceType,
      entitlement: line.entitlement,
      payableWholeHours: line.payableWholeHours,
      hoursConfirmed: line.hoursConfirmed,
    });
    if (hourly.kind === "unavailable") return { ...hourly, component, lineId };
    const dailyHours = (hoursByDate.get(hourly.serviceDate) ?? 0) + hourly.payableWholeHours;
    if (dailyHours > 24)
      return { kind: "unavailable", reason: "DAILY_HOURS_EXCEEDED", component, lineId };
    hoursByDate.set(hourly.serviceDate, dailyHours);
    knownHourlyShiftSubtotalCents += hourly.personalAmountCents;
    if (!Number.isSafeInteger(knownHourlyShiftSubtotalCents))
      return { kind: "unavailable", reason: "AMOUNT_OVERFLOW", component, lineId };
    positions.push({
      component,
      lineId,
      serviceDate: hourly.serviceDate,
      allowanceType: hourly.allowanceType,
      payableWholeHours: hourly.payableWholeHours,
      rateCentsPerHour: hourly.rateCentsPerHour,
      amountCents: hourly.personalAmountCents,
      rateId: hourly.rateId,
      sourceIds: hourly.sourceIds,
    });
  }
  const knownSubtotalCents = base.knownSubtotalCents + knownHourlyShiftSubtotalCents;
  if (!Number.isSafeInteger(knownSubtotalCents))
    return { kind: "unavailable", reason: "AMOUNT_OVERFLOW", component };
  return {
    kind: "draft-known-monthly-components-with-hourly-shift",
    completeGross: false,
    packageId: base.packageId,
    versionId: base.versionId,
    month: base.month,
    knownSubtotalCents,
    knownHourlyShiftSubtotalCents,
    positions,
    excludedComponents: [
      "OTHER_SHIFT_ALLOWANCES",
      "TIME_PREMIUMS",
      "OVERTIME",
      "ANNUAL_PAYMENT",
      "OTHER_LOCAL_TERMS",
    ],
  };
}
