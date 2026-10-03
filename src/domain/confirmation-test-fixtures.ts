import { Temporal } from "@js-temporal/polyfill";
import type { ShiftEntry } from "./types";
import type { AnnualBasisMonth, TariffAnnualClaim } from "./tariff-annual-claim";

/** Synthetic personal records, independent of any public tariff amount or calculation adapter. */
export type Mutable<T> = T extends readonly (infer U)[]
  ? Mutable<U>[]
  : T extends object
    ? { -readonly [K in keyof T]: Mutable<T[K]> }
    : T;
export const work = {
  timeZone: "Europe/Berlin",
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
};
export function shift(change: Partial<ShiftEntry> = {}): ShiftEntry {
  return {
    kind: "SHIFT",
    id: "shift",
    date: "2026-09-15",
    templateId: null,
    title: "Nacht",
    type: "NIGHT",
    startTime: "23:00",
    endTime: "01:00",
    breakMinutes: 0,
    color: "#EA5B55",
    symbol: "N",
    note: null,
    overtimeMinutes: 0,
    tariffOvertimeConfirmed: false,
    holidayPremiumMode: "WITH_TIME_OFF",
    revision: 1,
    createdAt: work.createdAt,
    updatedAt: work.updatedAt,
    deletedAt: null,
    ...change,
  };
}
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
export function tariffAnnualFixture() {
  const claim: Mutable<TariffAnnualClaim> = {
    version: 1,
    id: "annual-2026",
    year: 2026,
    selection: {
      packageId: "tvoed-vka-bt-k",
      variant: "BT_K",
      region: "OTHER",
      group: "p5",
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
      months: [7, 8, 9].map((m) => annualBasisMonth("2026-" + String(m).padStart(2, "0"))),
      lastFullPayMonth: null,
      parentalPartTime: false,
      adjustedMonthlyCents: null,
      takeoverMonthlyCents: null,
    },
  };
  return { claim };
}
