import { Temporal } from "@js-temporal/polyfill";
import {
  validateActualOwnAnnualPayments,
  type ActualOwnAnnualPayment,
  type AnnualPaymentPosition,
  type AnnualPaymentResult,
} from "@/domain/annual-payment";
import type { OwnSpecialPayment } from "@/domain/own-remuneration";
import {
  requireRemunerationDate,
  type DatedRemunerationProfile,
} from "@/domain/remuneration-profile";
import type { RemunerationSource } from "@/domain/remuneration-result";
import { bundledRuleResolver, type RuleResolver } from "@/rules/rule-resolver";
import { remunerationMonthStart, resolveRemunerationContext } from "./remuneration-context";
import { roundRemunerationCents } from "./remuneration-money";

interface Candidate {
  payment: OwnSpecialPayment;
  source: RemunerationSource;
  payoutMonth: string;
  ambiguous: boolean;
}
const terms = (p: OwnSpecialPayment) =>
  JSON.stringify([p.title, p.payoutMonth, p.entitlementMonths, p.amount]);

/** Profile boundaries, not daily work hours: never apply another part-time or day factor. */
function candidates(
  year: number,
  history: readonly DatedRemunerationProfile[],
  resolver: RuleResolver,
) {
  const first = `${year}-01-01`,
    last = `${year}-12-31`;
  const boundaries = [
    ...new Set([
      first,
      ...history.flatMap((p) => {
        if (p.effectiveFrom === null) return [];
        const date = requireRemunerationDate(p.effectiveFrom);
        return date > first && date <= last ? [date] : [];
      }),
    ]),
  ].sort();
  const result = new Map<string, Candidate>();
  for (const [index, from] of boundaries.entries()) {
    const through = boundaries[index + 1]
      ? Temporal.PlainDate.from(boundaries[index + 1])
          .subtract({ days: 1 })
          .toString()
      : last;
    const context = resolveRemunerationContext(from, history, resolver);
    if (context.kind !== "own-configured") continue;
    for (const payment of context.configuration.specialPayments) {
      const payoutMonth = `${year}-${String(payment.payoutMonth).padStart(2, "0")}`;
      const start = remunerationMonthStart(payoutMonth);
      const begin = [from, payment.validFrom, start.toString()].sort().at(-1)!;
      const end = [
        through,
        payment.validTo ?? last,
        start.with({ day: start.daysInMonth }).toString(),
      ].sort()[0];
      if (begin > end) continue;
      const previous = result.get(payment.id);
      if (previous) {
        previous.ambiguous ||= terms(previous.payment) !== terms(payment);
        // Exactly one unresolved position even when the payout month was changed.
        if (payoutMonth < previous.payoutMonth) previous.payoutMonth = payoutMonth;
      } else
        result.set(payment.id, { payment, source: context.source, payoutMonth, ambiguous: false });
    }
  }
  return result;
}

/** Own payments only. Tariff annual-payment rules are a separate VG-04 delivery. */
export function calculateOwnAnnualPayments(
  month: string,
  history: readonly DatedRemunerationProfile[],
  actualPayments: readonly ActualOwnAnnualPayment[] = [],
  resolver: RuleResolver = bundledRuleResolver,
): AnnualPaymentResult {
  const first = remunerationMonthStart(month);
  const actuals = validateActualOwnAnnualPayments(actualPayments);
  const positions: AnnualPaymentPosition[] = [];
  const period = {
    from: first.toString(),
    through: first.with({ day: first.daysInMonth }).toString(),
  };
  const configured = candidates(first.year, history, resolver);
  for (const { payment: p, source, payoutMonth, ambiguous } of configured.values()) {
    if (
      payoutMonth !== month ||
      actuals.some((a) => a.paymentId === p.id && a.entitlementYear === first.year)
    )
      continue;
    const basisCents = p.amount.kind === "percent" ? p.amount.confirmedBasisCents : null;
    const missing =
      p.entitlementMonths === null || (p.amount.kind === "percent" && basisCents === null);
    const amountCents =
      ambiguous || missing
        ? null
        : p.amount.kind === "fixed"
          ? roundRemunerationCents(p.amount.cents * p.entitlementMonths!, 12)
          : roundRemunerationCents(
              basisCents! * p.amount.basisPoints * p.entitlementMonths!,
              120_000,
            );
    positions.push({
      id: `own-annual:${first.year}:${p.id}`,
      kind: "annual-payment",
      label: p.title,
      ...period,
      amountCents,
      source,
      status: amountCents === null ? "unavailable" : "estimated",
      basis: {
        paymentId: p.id,
        entitlementYear: first.year,
        method: p.amount.kind,
        fullAmountCents: p.amount.kind === "fixed" ? p.amount.cents : null,
        confirmedBasisCents: basisCents,
        percentageBasisPoints: p.amount.kind === "percent" ? p.amount.basisPoints : null,
        entitlementMonths: p.entitlementMonths,
        actualRevision: null,
      },
      issue: ambiguous
        ? {
            code: "ANNUAL_TERMS_AMBIGUOUS",
            message: `Die Angaben für „${p.title}“ wechseln im Auszahlungszeitraum. Bitte die Sonderzahlung für dieses Jahr eindeutig bestätigen.`,
          }
        : missing
          ? {
              code: "ANNUAL_INPUT_MISSING",
              message: `Für „${p.title}“ fehlen bestätigte Anspruchsmonate oder die Berechnungsgrundlage.`,
            }
          : null,
    });
  }
  for (const actual of actuals.filter((a) => a.payoutMonth === month)) {
    positions.push({
      id: `own-annual:${actual.entitlementYear}:${actual.paymentId}`,
      kind: "annual-payment",
      label: actual.title,
      ...period,
      amountCents: actual.grossCents,
      status: "calculated",
      issue: null,
      source: {
        kind: "profile",
        profileEffectiveFrom: null,
        profileRevision: null,
        requestedPackageId: null,
        packageId: null,
        versionId: null,
        packageValidFrom: null,
        packageValidTo: null,
        references: [],
      },
      basis: {
        paymentId: actual.paymentId,
        entitlementYear: actual.entitlementYear,
        method: "actual",
        fullAmountCents: null,
        confirmedBasisCents: null,
        percentageBasisPoints: null,
        entitlementMonths: null,
        actualRevision: actual.revision,
      },
    });
  }
  const complete = positions.every((p) => p.amountCents !== null);
  const knownSubtotalCents = positions.reduce((sum, p) => sum + (p.amountCents ?? 0), 0);
  return {
    positions,
    complete,
    knownSubtotalCents,
    totalCents: complete ? knownSubtotalCents : null,
    status: !complete
      ? "unavailable"
      : positions.some((p) => p.status === "estimated")
        ? "estimated"
        : "calculated",
  };
}
