import type { SQLiteDatabase } from "expo-sqlite";
import { deriveCaritasDraftEntitlements } from "@/engine/caritas-care-draft-entitlements";
import { calculateCaritasCareDraftMonthFromCatalog } from "@/engine/caritas-care-draft-from-saved";
import { calculateCaritasDraftOvertimePayoutMonth } from "@/engine/caritas-care-draft-overtime-payout";
import { calculateCaritasAnnualPayoutMonth } from "@/engine/caritas-annual-payout-month";
import { loadCaritasDraftSnapshot } from "@/infrastructure/database/caritas-draft-snapshot";
import { bundledRuleResolver, type RuleResolver } from "@/rules/rule-resolver";

type Snapshot = Omit<Awaited<ReturnType<typeof loadCaritasDraftSnapshot>>, "historyComplete"> & {
  readonly historyComplete: boolean;
};
type Monthly = ReturnType<typeof calculateCaritasCareDraftMonthFromCatalog>;
type MonthlySuccess = Extract<Monthly, { kind: "draft-known-subtotal" }>;
type Overtime = ReturnType<typeof calculateCaritasDraftOvertimePayoutMonth>;
type Annual = ReturnType<typeof calculateCaritasAnnualPayoutMonth>;
type MonthlyUnavailable = {
  readonly kind: "unavailable";
  readonly stage: "allowance-decisions" | "monthly-pay";
  readonly reason: string;
  readonly detail?: Monthly;
};

export type CaritasDraftCandidateResult =
  | {
      readonly kind: "unavailable";
      readonly stage: "work-profile" | "allowance-decisions" | "monthly-pay";
      readonly reason: string;
      readonly detail?: Monthly;
    }
  | {
      readonly kind: "draft-known-subtotal";
      readonly month: string;
      readonly status: "estimated";
      /** A candidate subtotal only; never a complete monthly gross or payroll result. */
      readonly knownSubtotalCents: number;
      readonly completeGross: false;
      readonly excludedComponents: readonly string[];
      readonly monthly: MonthlySuccess;
      readonly overtime: Overtime;
      readonly annual: Annual;
    }
  | {
      readonly kind: "draft-known-cash";
      readonly month: string;
      /** Confirmed or estimable cash only; current-month base pay could not be derived. */
      readonly knownSubtotalCents: number;
      readonly completeGross: false;
      readonly excludedComponents: readonly string[];
      readonly monthly: MonthlyUnavailable;
      readonly overtime: Overtime;
      readonly annual: Annual;
    };

/** Bridges one persisted local snapshot to the candidate calculation without promoting DRAFT tariffs. */
export function calculateCaritasDraftCandidateFromSnapshot(
  snapshot: Snapshot,
  month: string,
  resolver: RuleResolver = bundledRuleResolver,
): CaritasDraftCandidateResult {
  if (!snapshot.profile)
    return { kind: "unavailable", stage: "work-profile", reason: "PROFILE_MISSING" };
  // Cash from earlier Caritas work may arrive after the current remuneration profile changed.
  const overtime = calculateCaritasDraftOvertimePayoutMonth({
    month,
    timeZone: snapshot.profile.timeZone,
    historyComplete: snapshot.historyComplete,
    shifts: snapshot.shifts,
    allocations: snapshot.overtimeAllocations,
    confirmations: snapshot.overtimeConfirmations,
    profiles: snapshot.remunerationProfiles,
    resolver,
  });
  const annual = calculateCaritasAnnualPayoutMonth({
    month,
    claims: snapshot.tariffAnnualClaims,
    resolver,
  });
  const knownCashCents =
    (overtime.kind === "draft-confirmed-payouts" ? overtime.cashSubtotalCents : 0) +
    (annual.kind === "draft-known-payments" ? annual.knownSubtotalCents : 0);
  if (!Number.isSafeInteger(knownCashCents))
    return { kind: "unavailable", stage: "monthly-pay", reason: "AMOUNT_OVERFLOW" };
  const hasCashPosition =
    (overtime.kind === "draft-confirmed-payouts" && overtime.positions.length > 0) ||
    (annual.kind === "draft-known-payments" && annual.positions.length > 0);
  const cashExclusions = [
    ...(overtime.kind === "unavailable" ? ["OVERTIME"] : []),
    annual.kind === "unavailable" ? "ANNUAL_PAYMENT_UNAVAILABLE" : "ANNUAL_PAYMENT_UNCONFIRMED",
    "OTHER_LOCAL_TERMS",
  ];
  const unavailableMonthly = (issue: MonthlyUnavailable): CaritasDraftCandidateResult =>
    hasCashPosition
      ? {
          kind: "draft-known-cash",
          month,
          knownSubtotalCents: knownCashCents,
          completeGross: false,
          excludedComponents: ["MONTHLY_PAY", ...cashExclusions],
          monthly: issue,
          overtime,
          annual,
        }
      : issue;
  const allowance = deriveCaritasDraftEntitlements(
    month,
    snapshot.remunerationProfiles,
    snapshot.allowanceDecisions,
  );
  if (allowance.kind === "unavailable")
    return unavailableMonthly({
      kind: "unavailable",
      stage: "allowance-decisions",
      reason: allowance.reason,
    });

  const monthly = calculateCaritasCareDraftMonthFromCatalog({
    month,
    resolver,
    workProfile: snapshot.profile,
    shifts: snapshot.shifts,
    pauseDetails: snapshot.pauseDetails,
    entriesComplete: snapshot.entriesComplete,
    workDayConfirmations: snapshot.workDayConfirmations,
    remunerationProfiles: snapshot.remunerationProfiles,
    monthFacts: snapshot.monthFacts,
    shiftEntitlements: allowance.entitlements,
  });
  if (monthly.kind === "unavailable")
    return unavailableMonthly({
      kind: "unavailable",
      stage: "monthly-pay",
      reason: monthly.reason,
      detail: monthly,
    });

  const knownSubtotalCents = monthly.knownSubtotalCents + knownCashCents;
  if (!Number.isSafeInteger(knownSubtotalCents))
    return { kind: "unavailable", stage: "monthly-pay", reason: "AMOUNT_OVERFLOW" };
  return {
    kind: "draft-known-subtotal",
    month,
    status: "estimated",
    knownSubtotalCents,
    completeGross: false,
    // Saved claims are only known positions; missing claims never establish a zero annual entitlement.
    excludedComponents: cashExclusions,
    monthly,
    overtime,
    annual,
  };
}

/** Database entry point for a future explicit candidate view; never feeds regular gross-pay totals. */
export async function loadCaritasDraftCandidate(
  db: SQLiteDatabase,
  month: string,
  resolver: RuleResolver = bundledRuleResolver,
): Promise<CaritasDraftCandidateResult> {
  const snapshot = await loadCaritasDraftSnapshot(db);
  return calculateCaritasDraftCandidateFromSnapshot(snapshot, month, resolver);
}
