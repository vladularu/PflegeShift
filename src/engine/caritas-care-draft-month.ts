import { Temporal } from "@js-temporal/polyfill";
import type { DatedAllowanceEntitlement } from "@/domain/remuneration-supplement";
import type { RuleTariffPackage } from "@/rules/contracts.generated";
import {
  calculateCaritasCareDraftAllowance,
  calculateCaritasCareDraftFixedAllowance,
  type CaritasCareDraftAllowance,
} from "./caritas-care-draft-allowance";
import {
  calculateCaritasCareDraftBase,
  type CaritasCareDraftBase,
} from "./caritas-care-draft-original-base";
import {
  calculateCaritasCareDraftShiftAllowance,
  type CaritasDraftShiftResult,
} from "./caritas-care-draft-shift-allowance";
import {
  calculateCaritasCareDraftTimePremiums,
  type CaritasDraftTimePremiumResult,
  type CaritasDraftWorkedSlice,
} from "./caritas-care-draft-time-premiums";

type ConfirmedClaim = "ENTITLED" | "NOT_ENTITLED" | "UNKNOWN";

export interface CaritasCareDraftMonthInput {
  readonly pkg: RuleTariffPackage;
  readonly month: string;
  readonly variantId: string;
  readonly regionId: string;
  readonly groupId: string;
  readonly stepId: string;
  readonly weeklyMinutes: number;
  /** This candidate does not prorate commencement, termination or unpaid absence. */
  readonly fullMonthEmploymentConfirmed: boolean;
  /** An unpaid absence or interrupted base entitlement must not be silently paid in full. */
  readonly fullMonthlyBaseEntitlementConfirmed: boolean;
  readonly fixedAllowanceClaim: ConfirmedClaim;
  readonly careAllowanceClaim: ConfirmedClaim;
  readonly shiftEntitlements: readonly DatedAllowanceEntitlement[];
  /** Actual net work, split at local midnight and with actual pauses removed. */
  readonly workedSlices: readonly CaritasDraftWorkedSlice[];
  readonly workDataComplete: boolean;
  readonly localAgreement: "NONE_CONFIRMED" | "UNKNOWN" | "DIFFERENT";
}

type Component =
  "base" | "fixed-allowance" | "care-allowance" | "shift-allowance" | "time-premiums";
type ComponentFailure =
  | Extract<CaritasCareDraftBase, { kind: "unavailable" }>["reason"]
  | Extract<CaritasCareDraftAllowance, { kind: "unavailable" }>["reason"]
  | Extract<CaritasDraftShiftResult, { kind: "unavailable" }>["reason"]
  | Extract<CaritasDraftTimePremiumResult, { kind: "unavailable" }>["reason"];

export type CaritasCareDraftMonthResult =
  | {
      readonly kind: "draft-known-subtotal";
      readonly status: "estimated";
      /** Not total gross pay: overtime, annual payment and special local terms are excluded. */
      readonly knownSubtotalCents: number;
      readonly packageId: string;
      readonly versionId: string;
      readonly month: string;
      readonly localAgreementUnconfirmed: boolean;
      readonly excludedComponents: readonly ["OVERTIME", "ANNUAL_PAYMENT", "OTHER_LOCAL_TERMS"];
      readonly positions: readonly {
        readonly component: Component;
        readonly amountCents: number;
        readonly status: "calculated" | "estimated";
        readonly sourceIds: readonly string[];
      }[];
    }
  | {
      readonly kind: "unavailable";
      readonly reason:
        | ComponentFailure
        | "INVALID_MONTH"
        | "PARTIAL_EMPLOYMENT"
        | "BASE_ENTITLEMENT_UNKNOWN"
        | "ALLOWANCE_CLAIM_UNKNOWN"
        | "MID_MONTH_BASE_CHANGE"
        | "WORKED_SLICES_OVERLAP";
      readonly component?: Component;
    };

function monthBounds(month: string): { from: string; through: string } | null {
  try {
    if (!/^\d{4}-\d{2}$/u.test(month)) return null;
    const yearMonth = Temporal.PlainYearMonth.from(month);
    if (yearMonth.toString() !== month) return null;
    return {
      from: `${month}-01`,
      through: `${month}-${String(yearMonth.daysInMonth).padStart(2, "0")}`,
    };
  } catch {
    return null;
  }
}

/** Candidate-only subtotal. Never use this result as a payroll or complete monthly gross amount. */
export function calculateCaritasCareDraftMonth(
  input: CaritasCareDraftMonthInput,
): CaritasCareDraftMonthResult {
  const bounds = monthBounds(input.month);
  if (!bounds) return { kind: "unavailable", reason: "INVALID_MONTH" };
  if (!input.fullMonthEmploymentConfirmed)
    return { kind: "unavailable", reason: "PARTIAL_EMPLOYMENT" };
  if (!input.fullMonthlyBaseEntitlementConfirmed)
    return { kind: "unavailable", reason: "BASE_ENTITLEMENT_UNKNOWN" };
  if (input.fixedAllowanceClaim === "UNKNOWN" || input.careAllowanceClaim === "UNKNOWN")
    return { kind: "unavailable", reason: "ALLOWANCE_CLAIM_UNKNOWN" };
  if (
    bounds.from < input.pkg.validFrom ||
    (input.pkg.validTo !== null && bounds.through > input.pkg.validTo)
  )
    return { kind: "unavailable", reason: "OUTSIDE_VALIDITY" };
  if (input.pkg.status !== "DRAFT") return { kind: "unavailable", reason: "INVALID_PACKAGE" };

  const { pkg, variantId, regionId, groupId, stepId, weeklyMinutes } = input;
  const changesWithinMonth = (item: {
    variantId: string;
    regionId: string;
    validFrom: string;
    validTo: string | null;
  }) =>
    item.variantId === variantId &&
    item.regionId === regionId &&
    ((item.validFrom > bounds.from && item.validFrom <= bounds.through) ||
      (item.validTo !== null && item.validTo >= bounds.from && item.validTo < bounds.through));
  if (
    pkg.rules.employmentWorkingTimeRules?.some(changesWithinMonth) ||
    (input.fixedAllowanceClaim === "ENTITLED" &&
      pkg.rules.caritasCareAllowanceRates?.some(
        (rate) => rate.provisionId === "SECTION_12_3" && changesWithinMonth(rate),
      )) ||
    (input.careAllowanceClaim === "ENTITLED" &&
      pkg.rules.caritasCareAllowanceRates?.some(
        (rate) => rate.provisionId === "SECTION_12_4" && changesWithinMonth(rate),
      ))
  )
    return { kind: "unavailable", reason: "MID_MONTH_BASE_CHANGE" };

  const base = calculateCaritasCareDraftBase(
    pkg,
    bounds.from,
    variantId,
    regionId,
    groupId,
    stepId,
    weeklyMinutes,
  );
  if (base.kind === "unavailable") return { ...base, component: "base" };
  const positions: {
    component: Component;
    amountCents: number;
    status: "calculated" | "estimated";
    sourceIds: readonly string[];
  }[] = [
    {
      component: "base",
      amountCents: base.personalMonthlyCents,
      status: "calculated",
      sourceIds: base.sourceIds,
    },
  ];

  for (const [claim, component, calculate] of [
    [input.fixedAllowanceClaim, "fixed-allowance", calculateCaritasCareDraftFixedAllowance],
    [input.careAllowanceClaim, "care-allowance", calculateCaritasCareDraftAllowance],
  ] as const) {
    if (claim === "NOT_ENTITLED") continue;
    const allowance = calculate(
      pkg,
      bounds.from,
      variantId,
      regionId,
      groupId,
      stepId,
      weeklyMinutes,
    );
    if (allowance.kind === "unavailable") return { ...allowance, component };
    positions.push({
      component,
      amountCents: allowance.personalMonthlyCents,
      status: "calculated",
      sourceIds: [...new Set([...allowance.rateSourceIds, ...allowance.basisSourceIds])],
    });
  }

  const sortedSlices = [...input.workedSlices].sort(
    (a, b) => a.date.localeCompare(b.date) || a.fromMinute - b.fromMinute,
  );
  const workByDate = new Map<string, number>();
  for (let index = 0; index < sortedSlices.length; index++) {
    const slice = sortedSlices[index];
    if (slice.date < bounds.from || slice.date > bounds.through)
      return { kind: "unavailable", reason: "OUTSIDE_VALIDITY", component: "time-premiums" };
    const previous = sortedSlices[index - 1];
    if (previous?.date === slice.date && previous.throughMinute > slice.fromMinute)
      return { kind: "unavailable", reason: "WORKED_SLICES_OVERLAP", component: "time-premiums" };
    workByDate.set(
      slice.date,
      (workByDate.get(slice.date) ?? 0) + slice.throughMinute - slice.fromMinute,
    );
  }
  const shift = calculateCaritasCareDraftShiftAllowance({
    pkg,
    from: bounds.from,
    through: bounds.through,
    variantId,
    regionId,
    weeklyMinutes,
    entitlements: input.shiftEntitlements,
    workDaysComplete: input.workDataComplete,
    workedDays: [...workByDate].map(([date, workedMinutes]) => ({
      date,
      workedMinutes,
      estimatedPause: false,
    })),
  });
  if (shift.kind === "unavailable") return { ...shift, component: "shift-allowance" };
  positions.push({
    component: "shift-allowance",
    amountCents: shift.amountCents,
    status: shift.status,
    sourceIds: [...new Set(shift.positions.flatMap((item) => item.sourceIds))],
  });

  const time = calculateCaritasCareDraftTimePremiums({
    pkg,
    variantId,
    regionId,
    groupId,
    workedSlices: sortedSlices,
    workDataComplete: input.workDataComplete,
    localAgreement: input.localAgreement,
  });
  if (time.kind === "unavailable") return { ...time, component: "time-premiums" };
  positions.push({
    component: "time-premiums",
    amountCents: time.amountCents,
    status: time.status,
    sourceIds: time.sourceIds,
  });
  return {
    kind: "draft-known-subtotal",
    status: "estimated",
    knownSubtotalCents: positions.reduce((sum, item) => sum + item.amountCents, 0),
    packageId: pkg.packageId,
    versionId: pkg.versionId,
    month: input.month,
    localAgreementUnconfirmed: time.localAgreementUnconfirmed,
    excludedComponents: ["OVERTIME", "ANNUAL_PAYMENT", "OTHER_LOCAL_TERMS"],
    positions,
  };
}
