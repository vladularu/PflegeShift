import {
  calculateCaritasCareDraftMonthlyComponents,
  type CaritasCareDraftMonthlyComponentsInput,
  type CaritasCareDraftMonthlyComponentsResult,
} from "./caritas-care-draft-monthly-components";
import {
  calculateCaritasPersonalTimePremium,
  type CaritasPersonalTimePremiumInput,
  type CaritasPersonalTimePremiumResult,
} from "./caritas-care-draft-personal-time-premium";

export interface CaritasConfirmedTimePremiumLine extends Pick<
  CaritasPersonalTimePremiumInput,
  | "serviceDate"
  | "premiumType"
  | "entitlement"
  | "payableWholeHours"
  | "hoursConfirmed"
  | "categoryAndOverlapConfirmed"
> {
  /** Stable identity of an externally reviewed line, distinct even for two services on one day. */
  readonly lineId: string;
}

export interface CaritasCareDraftMonthlyWithTimePremiumsInput extends CaritasCareDraftMonthlyComponentsInput {
  readonly confirmedPremiums: readonly CaritasConfirmedTimePremiumLine[];
}

type BaseResult = Extract<
  CaritasCareDraftMonthlyComponentsResult,
  { kind: "draft-known-monthly-components" }
>;
type BaseUnavailable = Extract<CaritasCareDraftMonthlyComponentsResult, { kind: "unavailable" }>;
type PremiumResult = Extract<CaritasPersonalTimePremiumResult, { kind: "personal-time-premium" }>;
type PremiumUnavailable = Extract<CaritasPersonalTimePremiumResult, { kind: "unavailable" }>;

type PremiumPosition = {
  readonly component: "confirmed-time-premium";
  readonly lineId: string;
  readonly serviceDate: string;
  readonly premiumType: PremiumResult["premiumType"];
  readonly payableWholeHours: number;
  readonly rateCentsPerHour: number;
  readonly amountCents: number;
  readonly sourceIds: readonly string[];
  readonly tableSourceIds: readonly string[];
  readonly workingTimeSourceIds: readonly string[];
  readonly rateSourceIds: readonly string[];
};

export type CaritasCareDraftMonthlyWithTimePremiumsResult =
  | {
      readonly kind: "draft-known-monthly-components-with-time-premiums";
      readonly completeGross: false;
      readonly knownSubtotalCents: number;
      readonly knownTimePremiumSubtotalCents: number;
      readonly packageId: string;
      readonly versionId: string;
      readonly month: string;
      readonly excludedComponents: readonly [
        "SHIFT_ALLOWANCES",
        "OTHER_TIME_PREMIUMS",
        "OVERTIME",
        "ANNUAL_PAYMENT",
        "OTHER_LOCAL_TERMS",
      ];
      readonly positions: readonly (BaseResult["positions"][number] | PremiumPosition)[];
    }
  | BaseUnavailable
  | (PremiumUnavailable & { readonly component: "confirmed-time-premium"; readonly lineId: string })
  | {
      readonly kind: "unavailable";
      readonly reason:
        | "NO_CONFIRMED_PREMIUM_LINES"
        | "INVALID_PREMIUM_LINE_ID"
        | "DUPLICATE_PREMIUM_LINE"
        | "PREMIUM_OUTSIDE_MONTH"
        | "AMOUNT_OVERFLOW";
      readonly component: "confirmed-time-premium";
      readonly lineId?: string;
    };

/** Candidate subtotal of monthly positions and individually confirmed cash premiums. */
export function calculateCaritasCareDraftMonthlyWithTimePremiums(
  input: CaritasCareDraftMonthlyWithTimePremiumsInput,
): CaritasCareDraftMonthlyWithTimePremiumsResult {
  const base = calculateCaritasCareDraftMonthlyComponents(input);
  if (base.kind === "unavailable") return base;
  if (input.confirmedPremiums.length === 0)
    return {
      kind: "unavailable",
      reason: "NO_CONFIRMED_PREMIUM_LINES",
      component: "confirmed-time-premium",
    };

  const seenLineIds = new Set<string>();
  const positions: (BaseResult["positions"][number] | PremiumPosition)[] = [...base.positions];
  let knownTimePremiumSubtotalCents = 0;
  for (const line of input.confirmedPremiums) {
    if (typeof line.lineId !== "string" || line.lineId.trim() === "")
      return {
        kind: "unavailable",
        reason: "INVALID_PREMIUM_LINE_ID",
        component: "confirmed-time-premium",
      };
    if (seenLineIds.has(line.lineId))
      return {
        kind: "unavailable",
        reason: "DUPLICATE_PREMIUM_LINE",
        component: "confirmed-time-premium",
        lineId: line.lineId,
      };
    seenLineIds.add(line.lineId);
    if (!line.serviceDate.startsWith(`${input.month}-`))
      return {
        kind: "unavailable",
        reason: "PREMIUM_OUTSIDE_MONTH",
        component: "confirmed-time-premium",
        lineId: line.lineId,
      };

    const premium = calculateCaritasPersonalTimePremium({
      pkg: input.pkg,
      serviceDate: line.serviceDate,
      variantId: input.variantId,
      regionId: input.regionId,
      groupId: input.groupId,
      premiumType: line.premiumType,
      entitlement: line.entitlement,
      payableWholeHours: line.payableWholeHours,
      hoursConfirmed: line.hoursConfirmed,
      categoryAndOverlapConfirmed: line.categoryAndOverlapConfirmed,
    });
    if (premium.kind === "unavailable")
      return { ...premium, component: "confirmed-time-premium", lineId: line.lineId };

    knownTimePremiumSubtotalCents += premium.personalAmountCents;
    if (!Number.isSafeInteger(knownTimePremiumSubtotalCents))
      return {
        kind: "unavailable",
        reason: "AMOUNT_OVERFLOW",
        component: "confirmed-time-premium",
        lineId: line.lineId,
      };
    const reference = premium.hourlyValues.ratio.reference;
    positions.push({
      component: "confirmed-time-premium",
      lineId: line.lineId,
      serviceDate: premium.serviceDate,
      premiumType: premium.premiumType,
      payableWholeHours: premium.payableWholeHours,
      rateCentsPerHour: premium.rateCentsPerHour,
      amountCents: premium.personalAmountCents,
      sourceIds: [
        ...new Set([
          ...reference.tableSourceIds,
          ...reference.workingTimeSourceIds,
          ...reference.rateSourceIds,
        ]),
      ],
      tableSourceIds: reference.tableSourceIds,
      workingTimeSourceIds: reference.workingTimeSourceIds,
      rateSourceIds: reference.rateSourceIds,
    });
  }

  const knownSubtotalCents = base.knownSubtotalCents + knownTimePremiumSubtotalCents;
  if (!Number.isSafeInteger(knownSubtotalCents))
    return {
      kind: "unavailable",
      reason: "AMOUNT_OVERFLOW",
      component: "confirmed-time-premium",
    };
  return {
    kind: "draft-known-monthly-components-with-time-premiums",
    completeGross: false,
    knownSubtotalCents,
    knownTimePremiumSubtotalCents,
    packageId: base.packageId,
    versionId: base.versionId,
    month: base.month,
    excludedComponents: [
      "SHIFT_ALLOWANCES",
      "OTHER_TIME_PREMIUMS",
      "OVERTIME",
      "ANNUAL_PAYMENT",
      "OTHER_LOCAL_TERMS",
    ],
    positions,
  };
}
