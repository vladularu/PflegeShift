import { Temporal } from "@js-temporal/polyfill";
import type { AnnualBasisMonth, TariffAnnualClaim } from "@/domain/tariff-annual-claim";
import { annualPaymentCandidate } from "./annual-core-test-fixtures";

export type Mutable<T> = T extends readonly (infer U)[]
  ? Mutable<U>[]
  : T extends object
    ? { -readonly [K in keyof T]: Mutable<T[K]> }
    : T;
export function annualBasisMonth(month: string, cents = 300_000): Mutable<AnnualBasisMonth> {
  return {
    month,
    componentsConfirmed: true,
    baseCents: cents,
    fixedCents: 0,
    variableCents: 0,
    scheduledOvertimeCents: 0,
    paidCalendarDays: Temporal.PlainYearMonth.from(month).daysInMonth,
  };
}
export function tariffAnnualFixture(training = false) {
  const pkg = annualPaymentCandidate(training);
  const claim: Mutable<TariffAnnualClaim> = {
    version: 1,
    id: "annual-2026",
    year: 2026,
    selection: {
      packageId: pkg.packageId,
      variant: "BT_K",
      region: "OTHER",
      group: training ? "b" : "p5",
      confirmed: true,
    },
    employment: {
      start: "2025-01-01",
      end: null,
      confirmed: true,
      takeover: { immediate: null, sameEmployer: null, employedDecember1: null },
    },
    entitlements: Array.from({ length: 12 }, (_, index) => ({ month: index + 1, reason: "PAY" })),
    exceptions: {
      birthYear: null,
      payBeforeParentalLeave: null,
      militaryReturnBeforeDecember1: null,
    },
    allocation: { required: false, twelfthsNumerator: null, twelfthsDenominator: null },
    basis: {
      months: (training ? [8, 9, 10] : [7, 8, 9]).map((m) =>
        annualBasisMonth("2026-" + String(m).padStart(2, "0"), training ? 150_000 : 300_000),
      ),
      lastFullPayMonth: null,
      parentalPartTime: false,
      adjustedMonthlyCents: null,
      takeoverMonthlyCents: null,
    },
  };
  return { pkg, claim };
}
export function confirmAnnualEmployment(
  claim: Mutable<TariffAnnualClaim>,
  start: string,
  end: string | null,
) {
  claim.employment.start = start;
  claim.employment.end = end;
  for (const row of claim.entitlements) {
    const ym = Temporal.PlainYearMonth.from({ year: claim.year, month: row.month });
    if (
      ym.toPlainDate({ day: ym.daysInMonth }).toString() < start ||
      (end !== null && ym.toPlainDate({ day: 1 }).toString() > end)
    )
      row.reason = "NONE";
  }
}
