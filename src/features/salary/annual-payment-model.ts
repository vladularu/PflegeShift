import { ValidationError } from "@/domain/validation";
import type { DatedRemunerationProfile } from "@/domain/remuneration-profile";
import type {
  SavedActualOwnAnnualPayment,
  SaveActualOwnAnnualPaymentInput,
} from "@/domain/saved-annual-payment";
import { validateActualOwnAnnualPayments } from "@/domain/annual-payment";
import { ownNumber } from "@/features/settings/own-remuneration-form";

export interface AnnualPaymentChoice {
  readonly paymentId: string;
  readonly title: string;
  readonly defaultPayoutMonth: string;
  readonly saved: SavedActualOwnAnnualPayment | null;
}
export interface AnnualPaymentSession extends AnnualPaymentChoice {
  readonly entitlementYear: number;
  readonly profilesToken: string;
}

export function annualPaymentYear(value: string): number | null {
  return /^(19\d{2}|[23]\d{3}|40\d{2})$/u.test(value) ? Number(value) : null;
}

/** Only dated configurations overlapping the claim year; removed confirmations remain editable. */
export function annualPaymentChoices(
  profiles: readonly DatedRemunerationProfile[],
  saved: readonly SavedActualOwnAnnualPayment[],
  year: number,
): readonly AnnualPaymentChoice[] {
  if (annualPaymentYear(String(year)) === null) return [];
  const start = `${year}-01-01`;
  const end = `${year}-12-31`;
  const dated = profiles
    .filter((profile) => profile.effectiveFrom !== null)
    .sort((a, b) => a.effectiveFrom!.localeCompare(b.effectiveFrom!));
  const choices = new Map<string, AnnualPaymentChoice>();
  dated.forEach((profile, index) => {
    const selection = profile.data.selection;
    if (selection.kind !== "own-configured") return;
    const next = dated[index + 1]?.effectiveFrom ?? null;
    for (const payment of selection.configuration.specialPayments) {
      const from = [profile.effectiveFrom!, payment.validFrom, start].sort().at(-1)!;
      if (
        from > end ||
        (next !== null && from >= next) ||
        (payment.validTo !== null && from > payment.validTo)
      )
        continue;
      choices.set(payment.id, {
        paymentId: payment.id,
        title: payment.title,
        defaultPayoutMonth: `${year}-${String(payment.payoutMonth).padStart(2, "0")}`,
        saved: null,
      });
    }
  });
  for (const record of saved) {
    if (record.payment.entitlementYear !== year) continue;
    choices.set(record.payment.paymentId, {
      paymentId: record.payment.paymentId,
      title: record.payment.title,
      defaultPayoutMonth: record.payment.payoutMonth,
      saved: record,
    });
  }
  return [...choices.values()].sort((a, b) => a.paymentId.localeCompare(b.paymentId));
}

export const annualPayoutText = (month: string) => `${month.slice(5, 7)}.${month.slice(0, 4)}`;

export function prepareAnnualPayment(
  session: AnnualPaymentSession,
  amount: string,
  payout: string,
): SaveActualOwnAnnualPaymentInput {
  const match = /^(0[1-9]|1[0-2])\.(\d{4})$/u.exec(payout.trim());
  if (match === null || annualPaymentYear(match[2]) === null)
    throw new ValidationError("Auszahlungsmonat: Bitte MM.JJJJ eingeben, zum Beispiel 11.2026.");
  const payment = {
    paymentId: session.paymentId,
    entitlementYear: session.entitlementYear,
    payoutMonth: `${match[2]}-${match[1]}`,
    title: session.title,
    grossCents: ownNumber(amount, "Tatsächlicher Bruttobetrag", 1_000_000_000),
  };
  validateActualOwnAnnualPayments([
    { ...payment, version: 1, revision: (session.saved?.payment.revision ?? 0) + 1 },
  ]);
  return { payment, expected: session.saved };
}
