import {
  calculateCaritasCareDraftMonthlyComponents,
  type CaritasCareDraftMonthlyComponentsInput,
  type CaritasCareDraftMonthlyComponentsResult,
} from "./caritas-care-draft-monthly-components";
import {
  calculateCaritasPersonalOvertime,
  type CaritasPersonalOvertimeInput,
  type CaritasPersonalOvertimeResult,
} from "./caritas-care-draft-personal-overtime";

export interface CaritasConfirmedOvertimeLine extends Pick<
  CaritasPersonalOvertimeInput,
  | "serviceDate"
  | "overtimeConfirmed"
  | "baseEntitlement"
  | "premiumEntitlement"
  | "payableWholeHours"
  | "hoursConfirmed"
> {
  /** Stable identity of the externally reviewed, non-overlapping payable hours. */
  readonly lineId: string;
  /** External review binds the cash amount to this month and rules out prior inclusion in other positions or lines. */
  readonly monthlyAllocationConfirmed: boolean;
}

export interface CaritasCareDraftMonthlyWithOvertimeInput extends CaritasCareDraftMonthlyComponentsInput {
  readonly confirmedOvertime: readonly CaritasConfirmedOvertimeLine[];
}

type BaseResult = Extract<
  CaritasCareDraftMonthlyComponentsResult,
  { kind: "draft-known-monthly-components" }
>;
type BaseUnavailable = Extract<CaritasCareDraftMonthlyComponentsResult, { kind: "unavailable" }>;
type OvertimeResult = Extract<CaritasPersonalOvertimeResult, { kind: "personal-overtime" }>;
type OvertimeUnavailable = Extract<CaritasPersonalOvertimeResult, { kind: "unavailable" }>;

type OvertimePosition = {
  readonly component: "confirmed-overtime-base" | "confirmed-overtime-premium";
  readonly lineId: string;
  readonly serviceDate: string;
  readonly payableWholeHours: number;
  readonly rateCentsPerHour: number;
  readonly amountCents: number;
  readonly sourceIds: readonly string[];
  readonly hourlyValues: OvertimeResult["hourlyValues"];
};

export type CaritasCareDraftMonthlyWithOvertimeResult =
  | {
      readonly kind: "draft-known-monthly-components-with-overtime";
      readonly completeGross: false;
      readonly knownSubtotalCents: number;
      readonly knownOvertimeBaseSubtotalCents: number;
      readonly knownOvertimePremiumSubtotalCents: number;
      readonly knownOvertimeSubtotalCents: number;
      readonly packageId: string;
      readonly versionId: string;
      readonly month: string;
      readonly excludedComponents: readonly [
        "SHIFT_ALLOWANCES",
        "TIME_PREMIUMS",
        "OTHER_OVERTIME",
        "ANNUAL_PAYMENT",
        "OTHER_LOCAL_TERMS",
      ];
      readonly positions: readonly (BaseResult["positions"][number] | OvertimePosition)[];
    }
  | BaseUnavailable
  | (OvertimeUnavailable & { readonly component: "confirmed-overtime"; readonly lineId: string })
  | {
      readonly kind: "unavailable";
      readonly reason:
        | "NO_CONFIRMED_OVERTIME_LINES"
        | "INVALID_OVERTIME_LINES"
        | "INVALID_OVERTIME_LINE"
        | "INVALID_OVERTIME_LINE_ID"
        | "DUPLICATE_OVERTIME_LINE"
        | "MONTHLY_ALLOCATION_UNCONFIRMED"
        | "OVERTIME_OUTSIDE_MONTH"
        | "INVALID_DATE"
        | "DAILY_HOURS_EXCEEDED"
        | "AMOUNT_OVERFLOW";
      readonly component: "confirmed-overtime";
      readonly lineId?: string;
    };

/** Candidate subtotal only; neither work dates nor calendar overtime establish a payout month or cash claim. */
export function calculateCaritasCareDraftMonthlyWithOvertime(
  input: CaritasCareDraftMonthlyWithOvertimeInput,
): CaritasCareDraftMonthlyWithOvertimeResult {
  const base = calculateCaritasCareDraftMonthlyComponents(input);
  if (base.kind === "unavailable") return base;
  const unavailable = (reason: "INVALID_OVERTIME_LINES" | "NO_CONFIRMED_OVERTIME_LINES") =>
    ({ kind: "unavailable", reason, component: "confirmed-overtime" }) as const;
  if (!Array.isArray(input.confirmedOvertime)) return unavailable("INVALID_OVERTIME_LINES");
  if (input.confirmedOvertime.length === 0) return unavailable("NO_CONFIRMED_OVERTIME_LINES");

  const seenLineIds = new Set<string>();
  const hoursByDate = new Map<string, number>();
  const positions: (BaseResult["positions"][number] | OvertimePosition)[] = [...base.positions];
  let knownOvertimeBaseSubtotalCents = 0;
  let knownOvertimePremiumSubtotalCents = 0;
  for (const line of input.confirmedOvertime) {
    if (!line || typeof line !== "object")
      return {
        kind: "unavailable",
        reason: "INVALID_OVERTIME_LINE",
        component: "confirmed-overtime",
      };
    if (typeof line.lineId !== "string" || line.lineId.trim() === "")
      return {
        kind: "unavailable",
        reason: "INVALID_OVERTIME_LINE_ID",
        component: "confirmed-overtime",
      };
    const lineId = line.lineId.trim();
    if (seenLineIds.has(lineId))
      return {
        kind: "unavailable",
        reason: "DUPLICATE_OVERTIME_LINE",
        component: "confirmed-overtime",
        lineId,
      };
    seenLineIds.add(lineId);
    if (line.monthlyAllocationConfirmed !== true)
      return {
        kind: "unavailable",
        reason: "MONTHLY_ALLOCATION_UNCONFIRMED",
        component: "confirmed-overtime",
        lineId,
      };
    if (typeof line.serviceDate !== "string")
      return {
        kind: "unavailable",
        reason: "INVALID_DATE",
        component: "confirmed-overtime",
        lineId,
      };
    if (!line.serviceDate.startsWith(`${base.month}-`))
      return {
        kind: "unavailable",
        reason: "OVERTIME_OUTSIDE_MONTH",
        component: "confirmed-overtime",
        lineId,
      };

    const overtime = calculateCaritasPersonalOvertime({
      pkg: input.pkg,
      serviceDate: line.serviceDate,
      variantId: input.variantId,
      regionId: input.regionId,
      groupId: input.groupId,
      personalStepId: input.stepId,
      overtimeConfirmed: line.overtimeConfirmed,
      baseEntitlement: line.baseEntitlement,
      premiumEntitlement: line.premiumEntitlement,
      payableWholeHours: line.payableWholeHours,
      hoursConfirmed: line.hoursConfirmed,
    });
    if (overtime.kind === "unavailable")
      return { ...overtime, component: "confirmed-overtime", lineId };
    const dailyHours = (hoursByDate.get(overtime.serviceDate) ?? 0) + overtime.payableWholeHours;
    if (dailyHours > 24)
      return {
        kind: "unavailable",
        reason: "DAILY_HOURS_EXCEEDED",
        component: "confirmed-overtime",
        lineId,
      };
    hoursByDate.set(overtime.serviceDate, dailyHours);

    knownOvertimeBaseSubtotalCents += overtime.baseAmountCents;
    knownOvertimePremiumSubtotalCents += overtime.premiumAmountCents;
    if (
      !Number.isSafeInteger(knownOvertimeBaseSubtotalCents) ||
      !Number.isSafeInteger(knownOvertimePremiumSubtotalCents)
    )
      return {
        kind: "unavailable",
        reason: "AMOUNT_OVERFLOW",
        component: "confirmed-overtime",
        lineId,
      };
    const provenance = {
      lineId,
      serviceDate: overtime.serviceDate,
      payableWholeHours: overtime.payableWholeHours,
      sourceIds: overtime.hourlyValues.sourceIds,
      hourlyValues: overtime.hourlyValues,
    };
    positions.push(
      {
        ...provenance,
        component: "confirmed-overtime-base",
        rateCentsPerHour: overtime.hourlyValues.baseCentsPerHour,
        amountCents: overtime.baseAmountCents,
      },
      {
        ...provenance,
        component: "confirmed-overtime-premium",
        rateCentsPerHour: overtime.hourlyValues.premiumCentsPerHour,
        amountCents: overtime.premiumAmountCents,
      },
    );
  }
  const knownOvertimeSubtotalCents =
    knownOvertimeBaseSubtotalCents + knownOvertimePremiumSubtotalCents;
  const knownSubtotalCents = base.knownSubtotalCents + knownOvertimeSubtotalCents;
  if (
    !Number.isSafeInteger(knownOvertimeSubtotalCents) ||
    !Number.isSafeInteger(knownSubtotalCents)
  )
    return { kind: "unavailable", reason: "AMOUNT_OVERFLOW", component: "confirmed-overtime" };
  return {
    kind: "draft-known-monthly-components-with-overtime",
    completeGross: false,
    knownSubtotalCents,
    knownOvertimeBaseSubtotalCents,
    knownOvertimePremiumSubtotalCents,
    knownOvertimeSubtotalCents,
    packageId: base.packageId,
    versionId: base.versionId,
    month: base.month,
    excludedComponents: [
      "SHIFT_ALLOWANCES",
      "TIME_PREMIUMS",
      "OTHER_OVERTIME",
      "ANNUAL_PAYMENT",
      "OTHER_LOCAL_TERMS",
    ],
    positions,
  };
}
