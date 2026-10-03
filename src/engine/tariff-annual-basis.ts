import { Temporal } from "@js-temporal/polyfill";
import type { AnnualBasisMonth, TariffAnnualClaim } from "@/domain/tariff-annual-claim";
import type { AnnualCalculationRule, AnnualClaimEligibility } from "./tariff-annual-eligibility";

export interface TariffAnnualBasis {
  readonly numerator: bigint;
  readonly denominator: bigint;
  readonly method:
    | "REFERENCE_AVERAGE"
    | "PAID_CALENDAR_DAYS"
    | "LAST_FULL_PAY_MONTH"
    | "FIRST_FULL_MONTH"
    | "BT_K_LAST_MONTH"
    | "CARITAS_LAST_MONTH"
    | "PARENTAL_ADJUSTMENT"
    | "TAKEOVER_CONFIRMED"
    | "NOVEMBER_TRAINING_PAY";
  readonly months: readonly string[];
}
export function tariffAnnualBasis(
  claim: TariffAnnualClaim,
  rule: AnnualCalculationRule,
  eligibility: AnnualClaimEligibility,
): { basis: TariffAnnualBasis | null; missing: readonly string[] } {
  const missing: string[] = [];
  const amount = (row: AnnualBasisMonth | undefined, fixedOnly = false): bigint | null => {
    if (!row || !row.componentsConfirmed) {
      missing.push("basis.months.confirmation");
      return null;
    }
    const fields = fixedOnly
      ? [row.baseCents, row.fixedCents]
      : [row.baseCents, row.fixedCents, row.variableCents, row.scheduledOvertimeCents];
    if (fields.some((value) => value === null)) {
      missing.push("basis." + row.month + ".components");
      return null;
    }
    return fields.reduce<bigint>((sum, value) => sum + BigInt(value!), 0n);
  };
  const single = (
    month: string,
    method: TariffAnnualBasis["method"],
    fixedOnly = false,
    fullPay = false,
  ): TariffAnnualBasis | null => {
    const ym = Temporal.PlainYearMonth.from(month);
    const first = ym.toPlainDate({ day: 1 }).toString();
    const last = ym.toPlainDate({ day: ym.daysInMonth }).toString();
    if (
      claim.employment.start === null ||
      first < claim.employment.start ||
      (claim.employment.end !== null && last > claim.employment.end)
    ) {
      missing.push("basis.fullEmploymentMonth");
      return null;
    }
    const row = claim.basis.months.find((entry) => entry.month === month);
    if (fullPay && row?.paidCalendarDays !== ym.daysInMonth) {
      missing.push("basis.lastFullPayMonth");
      return null;
    }
    const sum = amount(row, fixedOnly);
    return sum === null ? null : { numerator: sum, denominator: 1n, method, months: [month] };
  };
  const confirmed = (
    cents: number | null,
    method: TariffAnnualBasis["method"],
    field: string,
  ): TariffAnnualBasis | null => {
    if (cents === null) {
      missing.push(field);
      return null;
    }
    return { numerator: BigInt(cents), denominator: 1n, method, months: [] };
  };
  if (eligibility.takeover)
    return {
      basis: confirmed(
        claim.basis.takeoverMonthlyCents,
        "TAKEOVER_CONFIRMED",
        "basis.takeoverMonthlyCents",
      ),
      missing,
    };
  if (rule.basisPolicy === "TVAL_PFLEGE_16") {
    const month = claim.year + "-11";
    const row = claim.basis.months.find((m) => m.month === month);
    if (!row?.componentsConfirmed || row.baseCents === null) {
      missing.push("basis.novemberTrainingPay");
      return { basis: null, missing };
    }
    if (
      [row.fixedCents, row.variableCents, row.scheduledOvertimeCents].some(
        (n) => n !== null && n !== 0,
      )
    ) {
      missing.push("basis.novemberTrainingPay.excludedComponents");
      return { basis: null, missing };
    }
    return {
      basis: {
        numerator: BigInt(row.baseCents),
        denominator: 1n,
        method: "NOVEMBER_TRAINING_PAY",
        months: [month],
      },
      missing,
    };
  }
  const employeeBasis =
    rule.basisPolicy === "TVOED_VKA_20" ||
    rule.basisPolicy === "TVL_20" ||
    rule.basisPolicy === "CARITAS_16";
  if (employeeBasis) {
    if (claim.basis.parentalPartTime === null) {
      missing.push("basis.parentalPartTime");
      return { basis: null, missing };
    }
    if (claim.basis.parentalPartTime) {
      if (claim.exceptions.birthYear === null) {
        missing.push("exceptions.parentalLeave");
        return { basis: null, missing };
      }
      if (claim.exceptions.birthYear !== claim.year) {
        missing.push("basis.parentalPartTime.birthYearConflict");
        return { basis: null, missing };
      }
      return {
        basis: confirmed(
          claim.basis.adjustedMonthlyCents,
          "PARENTAL_ADJUSTMENT",
          "basis.adjustedMonthlyCents",
        ),
        missing,
      };
    }
  }
  const tvlLegacyExit = eligibility.earlyExit && rule.earlyExitBasis === "LAST_THREE_MONTHS_TVL";
  if (eligibility.earlyExit && !tvlLegacyExit) {
    const end = Temporal.PlainDate.from(claim.employment.end!);
    const ym = end.toPlainYearMonth().subtract({ months: end.day === end.daysInMonth ? 0 : 1 });
    return {
      basis: single(
        ym.toString(),
        rule.basisPolicy === "CARITAS_16" ? "CARITAS_LAST_MONTH" : "BT_K_LAST_MONTH",
        true,
      ),
      missing,
    };
  }
  const start = Temporal.PlainDate.from(claim.employment.start!);
  const cutoff = Temporal.PlainYearMonth.from({
    year: claim.year,
    month: rule.lateEntryAfterMonth,
  });
  if (
    !tvlLegacyExit &&
    Temporal.PlainDate.compare(start, cutoff.toPlainDate({ day: cutoff.daysInMonth })) > 0
  ) {
    const ym = start.toPlainYearMonth().add({ months: start.day === 1 ? 0 : 1 });
    return { basis: single(ym.toString(), "FIRST_FULL_MONTH"), missing };
  }
  const end = tvlLegacyExit ? Temporal.PlainDate.from(claim.employment.end!) : null;
  const finalMonth = end
    ?.toPlainYearMonth()
    .subtract({ months: end.day === end.daysInMonth ? 0 : 1 });
  const months = finalMonth
    ? [2, 1, 0].map((offset) => finalMonth.subtract({ months: offset }).toString())
    : rule.referenceMonths.map((m) =>
        Temporal.PlainYearMonth.from({ year: claim.year, month: m }).toString(),
      );
  let sum = 0n,
    paidDays = 0,
    totalDays = 0;
  for (const month of months) {
    const ym = Temporal.PlainYearMonth.from(month);
    const first = ym.toPlainDate({ day: 1 }),
      last = ym.toPlainDate({ day: ym.daysInMonth });
    totalDays += ym.daysInMonth;
    const row = claim.basis.months.find((entry) => entry.month === month);
    if (
      last.toString() < claim.employment.start! ||
      (claim.employment.end !== null && first.toString() > claim.employment.end)
    ) {
      if (
        row &&
        [
          row.baseCents,
          row.fixedCents,
          row.variableCents,
          row.scheduledOvertimeCents,
          row.paidCalendarDays,
        ].some((n) => n !== null && n !== 0)
      )
        missing.push("basis." + month + ".periodConflict");
      continue;
    }
    const value = amount(row);
    if (value !== null) sum += value;
    if (!employeeBasis) continue;
    if (row?.paidCalendarDays == null) {
      missing.push("basis." + month + ".paidCalendarDays");
      continue;
    }
    const overlapStart =
      first.toString() < claim.employment.start!
        ? Temporal.PlainDate.from(claim.employment.start!)
        : first;
    const overlapEnd =
      claim.employment.end !== null && last.toString() > claim.employment.end
        ? Temporal.PlainDate.from(claim.employment.end)
        : last;
    if (row.paidCalendarDays > overlapStart.until(overlapEnd).days + 1)
      missing.push("basis." + month + ".paidDaysConflict");
    paidDays += row.paidCalendarDays;
  }
  if (missing.length) return { basis: null, missing };
  if (employeeBasis && paidDays < 30) {
    const fallback = claim.basis.lastFullPayMonth;
    if (fallback === null || fallback > months[2]) {
      missing.push("basis.lastFullPayMonth");
      return { basis: null, missing };
    }
    return { basis: single(fallback, "LAST_FULL_PAY_MONTH", false, true), missing };
  }
  return {
    basis:
      employeeBasis && paidDays < totalDays
        ? {
            numerator: sum * 3067n,
            denominator: BigInt(paidDays) * 100n,
            method: "PAID_CALENDAR_DAYS",
            months,
          }
        : { numerator: sum, denominator: 3n, method: "REFERENCE_AVERAGE", months },
    missing,
  };
}
