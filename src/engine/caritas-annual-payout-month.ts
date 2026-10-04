import { Temporal } from "@js-temporal/polyfill";
import {
  validateSavedTariffAnnualClaims,
  type SavedTariffAnnualClaim,
} from "@/domain/saved-tariff-annual-claim";
import type { RuleResolver } from "@/rules/rule-resolver";
import { calculateCaritasAnnualDraftFromResolver } from "./caritas-annual-draft";

export interface CaritasAnnualPayoutMonthInput {
  readonly month: string;
  readonly claims: readonly SavedTariffAnnualClaim[];
  readonly resolver: RuleResolver;
}

export type CaritasAnnualPayoutMonthResult =
  | {
      readonly kind: "draft-known-payments";
      readonly month: string;
      /** Only saved or estimable positions; absence of a claim never proves a zero annual payment. */
      readonly knownSubtotalCents: number;
      readonly complete: false;
      readonly positions: readonly {
        readonly claimId: string;
        readonly entitlementYear: number;
        readonly payoutMonth: string;
        readonly amountCents: number;
        readonly origin: "actual" | "estimated";
        readonly sourceIds: readonly string[];
      }[];
      readonly unresolvedClaimIds: readonly string[];
    }
  | {
      readonly kind: "unavailable";
      readonly reason: "INVALID_MONTH" | "INVALID_CLAIMS" | "AMOUNT_OVERFLOW";
    };

/** Actual payment replaces the estimate and is attributed once to its saved cash month. */
export function calculateCaritasAnnualPayoutMonth({
  month,
  claims,
  resolver,
}: CaritasAnnualPayoutMonthInput): CaritasAnnualPayoutMonthResult {
  try {
    if (
      !/^\d{4}-(0[1-9]|1[0-2])$/u.test(month) ||
      Temporal.PlainYearMonth.from(month).toString() !== month
    )
      return { kind: "unavailable", reason: "INVALID_MONTH" };
  } catch {
    return { kind: "unavailable", reason: "INVALID_MONTH" };
  }
  let validated: readonly SavedTariffAnnualClaim[];
  try {
    validated = validateSavedTariffAnnualClaims(claims);
  } catch {
    return { kind: "unavailable", reason: "INVALID_CLAIMS" };
  }

  const positions: Extract<
    CaritasAnnualPayoutMonthResult,
    { kind: "draft-known-payments" }
  >["positions"][number][] = [];
  const unresolvedClaimIds: string[] = [];
  for (const saved of validated) {
    if (
      saved.revoked ||
      saved.claim.version !== 3 ||
      !saved.claim.selection.packageId.startsWith("avr-caritas-p-")
    )
      continue;
    const claimId = saved.claim.id;
    if (saved.actualPayment !== null) {
      if (saved.actualPayment.payoutMonth === month)
        positions.push({
          claimId,
          entitlementYear: saved.claim.year,
          payoutMonth: month,
          amountCents: saved.actualPayment.grossCents,
          origin: "actual",
          sourceIds: [],
        });
      continue;
    }
    const estimate = calculateCaritasAnnualDraftFromResolver(resolver, saved.claim);
    if (
      estimate.status !== "estimated" ||
      estimate.amountCents === null ||
      estimate.payoutMonth === null
    ) {
      unresolvedClaimIds.push(claimId);
      continue;
    }
    if (estimate.payoutMonth === month)
      positions.push({
        claimId,
        entitlementYear: saved.claim.year,
        payoutMonth: month,
        amountCents: estimate.amountCents,
        origin: "estimated",
        sourceIds: estimate.sourceIds,
      });
  }
  const knownSubtotalCents = positions.reduce((sum, item) => sum + item.amountCents, 0);
  if (!Number.isSafeInteger(knownSubtotalCents))
    return { kind: "unavailable", reason: "AMOUNT_OVERFLOW" };
  return {
    kind: "draft-known-payments",
    month,
    knownSubtotalCents,
    complete: false,
    positions,
    unresolvedClaimIds,
  };
}
