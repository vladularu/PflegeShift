import { Temporal } from "@js-temporal/polyfill";
import type { RuleTariffPackage } from "@/rules/contracts.generated";
import { validateRulePackage } from "@/rules/validation";
import {
  calculateCaritasCareDraftBase,
  type CaritasCareDraftBase,
} from "./caritas-care-draft-base";
import {
  calculateCaritasCareDraftPersonalAllowance,
  type CaritasCareAllowanceEntitlement,
  type CaritasCareDraftPersonalAllowance,
} from "./caritas-care-draft-personal-allowance";

export interface CaritasCareDraftMonthlyComponentsInput {
  readonly pkg: RuleTariffPackage;
  readonly month: string;
  readonly variantId: string;
  readonly regionId: string;
  readonly groupId: string;
  readonly stepId: string;
  readonly weeklyMinutes: number;
  /** Commencement, termination and unpaid absence are outside this candidate. */
  readonly fullMonthEmploymentConfirmed: boolean;
  readonly fullMonthlyBaseEntitlementConfirmed: boolean;
  readonly fixedAllowanceEntitlement: CaritasCareAllowanceEntitlement;
  readonly careAllowanceEntitlement: CaritasCareAllowanceEntitlement;
}

type Component = "table-base" | "care-allowance-12-3" | "care-allowance-12-4";

export type CaritasCareDraftMonthlyComponentsResult =
  | {
      readonly kind: "draft-known-monthly-components";
      readonly completeGross: false;
      readonly knownSubtotalCents: number;
      readonly packageId: string;
      readonly versionId: string;
      readonly month: string;
      readonly excludedComponents: readonly [
        "SHIFT_ALLOWANCES",
        "TIME_PREMIUMS",
        "OVERTIME",
        "ANNUAL_PAYMENT",
        "OTHER_LOCAL_TERMS",
      ];
      readonly positions: readonly {
        readonly component: Component;
        readonly amountCents: number;
        readonly sourceIds: readonly string[];
      }[];
    }
  | {
      readonly kind: "unavailable";
      readonly reason:
        | Extract<CaritasCareDraftBase, { kind: "unavailable" }>["reason"]
        | Extract<CaritasCareDraftPersonalAllowance, { kind: "unavailable" }>["reason"]
        | "INVALID_MONTH"
        | "PARTIAL_EMPLOYMENT"
        | "BASE_ENTITLEMENT_UNCONFIRMED"
        | "ENTITLEMENT_UNCONFIRMED"
        | "MID_MONTH_RULE_CHANGE"
        | "AMOUNT_OVERFLOW";
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

/** Candidate-only subtotal of sourced monthly components, never total gross pay. */
export function calculateCaritasCareDraftMonthlyComponents(
  input: CaritasCareDraftMonthlyComponentsInput,
): CaritasCareDraftMonthlyComponentsResult {
  const bounds = monthBounds(input.month);
  if (!bounds) return { kind: "unavailable", reason: "INVALID_MONTH" };
  if (input.fullMonthEmploymentConfirmed !== true)
    return { kind: "unavailable", reason: "PARTIAL_EMPLOYMENT" };
  if (input.fullMonthlyBaseEntitlementConfirmed !== true)
    return { kind: "unavailable", reason: "BASE_ENTITLEMENT_UNCONFIRMED" };
  for (const entitlement of [input.fixedAllowanceEntitlement, input.careAllowanceEntitlement])
    if (entitlement !== "CONFIRMED" && entitlement !== "NOT_ENTITLED")
      return { kind: "unavailable", reason: "ENTITLEMENT_UNCONFIRMED" };

  const { pkg, variantId, regionId, groupId, stepId, weeklyMinutes } = input;
  if (pkg.status !== "DRAFT" || !validateRulePackage(pkg).ok)
    return { kind: "unavailable", reason: "INVALID_PACKAGE" };
  if (bounds.from < pkg.validFrom || (pkg.validTo !== null && bounds.through > pkg.validTo))
    return { kind: "unavailable", reason: "OUTSIDE_VALIDITY" };

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
    (input.fixedAllowanceEntitlement === "CONFIRMED" &&
      pkg.rules.caritasCareAllowanceRates?.some(
        (rate) => rate.provisionId === "SECTION_12_3" && changesWithinMonth(rate),
      )) ||
    (input.careAllowanceEntitlement === "CONFIRMED" &&
      pkg.rules.caritasCareAllowanceRates?.some(
        (rate) => rate.provisionId === "SECTION_12_4" && changesWithinMonth(rate),
      ))
  )
    return { kind: "unavailable", reason: "MID_MONTH_RULE_CHANGE" };

  const base = calculateCaritasCareDraftBase(
    pkg,
    bounds.from,
    variantId,
    regionId,
    groupId,
    stepId,
    weeklyMinutes,
  );
  if (base.kind === "unavailable") return { ...base, component: "table-base" };
  const positions: {
    component: Component;
    amountCents: number;
    sourceIds: readonly string[];
  }[] = [
    { component: "table-base", amountCents: base.personalMonthlyCents, sourceIds: base.sourceIds },
  ];

  for (const [entitlement, provisionId, component] of [
    [input.fixedAllowanceEntitlement, "SECTION_12_3", "care-allowance-12-3"],
    [input.careAllowanceEntitlement, "SECTION_12_4", "care-allowance-12-4"],
  ] as const) {
    if (entitlement === "NOT_ENTITLED") continue;
    const allowance = calculateCaritasCareDraftPersonalAllowance(
      pkg,
      bounds.from,
      variantId,
      regionId,
      groupId,
      stepId,
      weeklyMinutes,
      provisionId,
      entitlement,
    );
    if (allowance.kind === "unavailable") return { ...allowance, component };
    positions.push({
      component,
      amountCents: allowance.personalMonthlyCents,
      sourceIds: [...new Set([...allowance.rateSourceIds, ...allowance.basisSourceIds])],
    });
  }

  const knownSubtotalCents = positions.reduce((sum, position) => sum + position.amountCents, 0);
  if (!Number.isSafeInteger(knownSubtotalCents))
    return { kind: "unavailable", reason: "AMOUNT_OVERFLOW" };
  return {
    kind: "draft-known-monthly-components",
    completeGross: false,
    knownSubtotalCents,
    packageId: pkg.packageId,
    versionId: pkg.versionId,
    month: input.month,
    excludedComponents: [
      "SHIFT_ALLOWANCES",
      "TIME_PREMIUMS",
      "OVERTIME",
      "ANNUAL_PAYMENT",
      "OTHER_LOCAL_TERMS",
    ],
    positions,
  };
}
