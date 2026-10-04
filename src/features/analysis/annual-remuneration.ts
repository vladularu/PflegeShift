import type { MonthlyAllowanceDecisions } from "@/domain/allowance-decisions";
import type { SavedTvlShiftWork } from "@/domain/saved-tvl-shift-work";
import type { SavedOvertimeAllocation } from "@/domain/overtime-allocation";
import type { SavedPaidAbsence } from "@/domain/paid-absence";
import type { ActualOwnAnnualPayment } from "@/domain/annual-payment";
import type { SavedTariffAnnualClaim } from "@/domain/saved-tariff-annual-claim";
import type { SavedTvoedAnnexAMonthConfirmation } from "@/domain/saved-tvoed-annex-a-month-confirmation";
import type { SavedTvoedAnnexAPremiumFacts } from "@/domain/saved-tvoed-annex-a-premium-facts";
import type { SavedShiftTraining } from "@/domain/training-data";
import type { SavedTvoedSueMonthConfirmation } from "@/domain/saved-tvoed-sue-month-confirmation";
import type { SavedTvoedSueAllowanceConfirmation } from "@/domain/saved-tvoed-sue-allowance-confirmation";
import type { DatedRemunerationProfile } from "@/domain/remuneration-profile";
import type { ShiftEntry } from "@/domain/types";
import type { calculateAssessedMonthlyRemuneration } from "@/engine/remuneration-month";

export type AnnualMonthlyRemuneration = ReturnType<typeof calculateAssessedMonthlyRemuneration>;
export interface AnnualRemunerationInput {
  readonly tvlShiftWork?: readonly SavedTvlShiftWork[];
  readonly savedAnnexAConfirmations?: readonly SavedTvoedAnnexAMonthConfirmation[];
  readonly savedAnnexAPremiumFacts?: readonly SavedTvoedAnnexAPremiumFacts[];
  readonly annexAPauseDetails?: readonly SavedShiftTraining[];
  readonly annexAPauseDetailsComplete?: boolean;
  readonly savedSueConfirmations?: readonly SavedTvoedSueMonthConfirmation[];
  readonly savedSueAllowanceConfirmations?: readonly SavedTvoedSueAllowanceConfirmation[];
  readonly actualAnnualPayments?: readonly ActualOwnAnnualPayment[];
  readonly tariffAnnualClaims?: readonly SavedTariffAnnualClaim[];
  readonly paidAbsences: readonly SavedPaidAbsence[];
  readonly status: "ready" | "loading" | "error";
  readonly profiles: readonly DatedRemunerationProfile[];
  readonly allowanceDecisions: readonly MonthlyAllowanceDecisions[];
  readonly overtimeAllocations: readonly SavedOvertimeAllocation[];
  /** Complete loaded shift snapshot, not a legacy tariff's preselected window. */
  readonly shifts: readonly ShiftEntry[];
}
export interface AnnualRemunerationMonth {
  readonly month: string;
  readonly result: AnnualMonthlyRemuneration | null;
}
export interface AnnualRemunerationComponent {
  readonly hasKnownAmounts: boolean;
  readonly completeMonthCount: number;
  readonly knownSubtotalCents: number;
  readonly totalCents: number | null;
}
export interface AnnualRemuneration {
  readonly hasKnownAmounts: boolean;
  readonly status: AnnualRemunerationInput["status"];
  readonly months: readonly AnnualRemunerationMonth[];
  readonly completeMonthCount: number;
  readonly knownSubtotalCents: number;
  readonly estimatedGrossCents: number | null;
  readonly base: AnnualRemunerationComponent;
  readonly timePremiums: AnnualRemunerationComponent;
  readonly allowances: AnnualRemunerationComponent;
  readonly overtime: AnnualRemunerationComponent;
  readonly annualPayments: AnnualRemunerationComponent;
}

/** Sum integer cents exactly once per calendar month. A missing month never means zero. */
export function summarizeAnnualRemuneration(
  year: number,
  status: AnnualRemunerationInput["status"],
  months: readonly AnnualRemunerationMonth[],
): AnnualRemuneration {
  if (!Number.isInteger(year) || year < 1900 || year > 4099)
    throw new Error("Ungültiges Berichtsjahr.");
  const ordered = Array.from({ length: 12 }, (_, index) => {
    const month = `${year}-${String(index + 1).padStart(2, "0")}`;
    const matches = months.filter((item) => item.month === month);
    if (matches.length > 1) throw new Error("Doppelter Vergütungsmonat.");
    const result = status === "ready" ? (matches[0]?.result ?? null) : null;
    if (result !== null && result.month !== month) throw new Error("Abweichender Vergütungsmonat.");
    return Object.freeze({ month, result });
  });
  if (months.some((item) => !ordered.some((expected) => expected.month === item.month)))
    throw new Error("Vergütungsmonat außerhalb des Berichtsjahres.");
  const sum = (values: readonly number[]) => {
    const cents = values.reduce((total, value) => {
      if (!Number.isSafeInteger(value) || !Number.isSafeInteger(total + value))
        throw new Error("Ungültige Vergütungssumme.");
      return total + value;
    }, 0);
    return cents;
  };
  const component = (
    key: "base" | "timePremiums" | "allowances" | "overtime" | "annualPayments",
  ): AnnualRemunerationComponent => {
    const completeMonthCount = ordered.filter((item) => item.result?.[key].complete).length;
    const knownSubtotalCents = sum(
      ordered.map((item) => item.result?.[key].knownSubtotalCents ?? 0),
    );
    return Object.freeze({
      hasKnownAmounts: ordered.some(
        (item) =>
          item.result?.[key].complete ||
          item.result?.[key].positions.some((position) => position.amountCents !== null),
      ),
      completeMonthCount,
      knownSubtotalCents,
      totalCents: completeMonthCount === 12 ? knownSubtotalCents : null,
    });
  };
  const completeMonthCount = ordered.filter((item) => item.result?.complete).length;
  const knownSubtotalCents = sum(ordered.map((item) => item.result?.knownSubtotalCents ?? 0));
  return Object.freeze({
    hasKnownAmounts: ordered.some(
      (item) =>
        item.result?.complete ||
        item.result?.positions.some((position) => position.amountCents !== null),
    ),
    status,
    months: Object.freeze(ordered),
    completeMonthCount,
    knownSubtotalCents,
    estimatedGrossCents: completeMonthCount === 12 ? knownSubtotalCents : null,
    base: component("base"),
    timePremiums: component("timePremiums"),
    allowances: component("allowances"),
    overtime: component("overtime"),
    annualPayments: component("annualPayments"),
  });
}
