import type { RemunerationPosition, RemunerationStatus } from "@/domain/remuneration-result";
import type { calculateAssessedMonthlyRemuneration } from "@/engine/remuneration-month";
import { formatRemunerationDate } from "@/features/settings/remuneration-editor-values";

export type MonthlyRemuneration = ReturnType<typeof calculateAssessedMonthlyRemuneration>;
export const REMUNERATION_STATUS: Readonly<Record<RemunerationStatus, string>> = {
  calculated: "Berechnet",
  estimated: "Geschätzt",
  unavailable: "Nicht berechenbar",
};
export function remunerationEuro(cents: number | null): string {
  return cents === null
    ? "Nicht berechenbar"
    : new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(cents / 100);
}
export function remunerationPeriod(from: string, through: string): string {
  return from === through
    ? formatRemunerationDate(from)
    : `${formatRemunerationDate(from)} – ${formatRemunerationDate(through)}`;
}
const decimal = (value: number) =>
  new Intl.NumberFormat("de-DE", { maximumFractionDigits: 4 }).format(value);
const annualBasisMethods: Readonly<Record<string, string>> = {
  REFERENCE_AVERAGE: "Durchschnitt der Bemessungsmonate",
  NOVEMBER_TRAINING_PAY: "Zustehendes November-Ausbildungsentgelt",
  PAID_CALENDAR_DAYS: "Bemessung nach bezahlten Kalendertagen",
  LAST_FULL_PAY_MONTH: "Letzter voller Entgeltmonat",
  FIRST_FULL_MONTH: "Erster voller Beschäftigungsmonat",
  BT_K_LAST_MONTH: "Letzter voller Entgeltmonat vor Ausscheiden (BT-K)",
  PARENTAL_ADJUSTMENT: "Bestätigte Anpassung wegen Elternteilzeit",
  TAKEOVER_CONFIRMED: "Bestätigte Ausbildungsgrundlage bei Übernahme",
};
export function remunerationBasis(position: RemunerationPosition): readonly string[] {
  if (position.kind === "annual-payment") {
    const b = position.basis;
    return [
      `Anspruchsjahr: ${b.entitlementYear}`,
      ...(b.method === "actual"
        ? [
            `Tatsächlicher Bruttobetrag bestätigt (Revision ${b.actualRevision}); ersetzt die Schätzung.`,
          ]
        : [
            ...(b.fullAmountCents !== null
              ? [`Persönlicher Jahresbetrag vor Anteil: ${remunerationEuro(b.fullAmountCents)}`]
              : []),
            ...(b.confirmedBasisCents !== null
              ? [
                  `${b.tariff ? "Tarifliche Bemessungsgrundlage" : "Bestätigte Grundlage"}: ${remunerationEuro(b.confirmedBasisCents)}`,
                ]
              : []),
            ...(b.percentageBasisPoints !== null
              ? [`Anteil: ${decimal(b.percentageBasisPoints / 100)} %`]
              : []),
            ...(b.tariff
              ? [
                  b.tariff.twelfths === null
                    ? "Anspruchsanteil noch nicht bestimmt."
                    : `Anspruchsanteil: ${b.tariff.twelfths.numerator} ÷ ${b.tariff.twelfths.denominator} Zwölftel`,
                  ...(b.tariff.basisMethod
                    ? [
                        `Bemessungsverfahren: ${annualBasisMethods[b.tariff.basisMethod] ?? "Noch nicht unterstützt"}`,
                      ]
                    : []),
                  ...(b.tariff.basisMonths.length
                    ? [
                        `Bemessungsmonate: ${b.tariff.basisMonths.map((m) => `${m.slice(5)}.${m.slice(0, 4)}`).join(", ")}`,
                      ]
                    : []),
                  ...(b.tariff.ruleId ? [`Jahresregel: ${b.tariff.ruleId}`] : []),
                  ...(b.tariff.versions.length
                    ? [`Regelfassungen: ${b.tariff.versions.join(", ")}`]
                    : []),
                ]
              : [
                  b.entitlementMonths === null
                    ? "Anspruchsmonate noch nicht bestätigt."
                    : `Anspruch: ${b.entitlementMonths} von 12 Monaten`,
                ]),
            b.tariff?.claimRevision === null
              ? "Noch keine Schätzung: persönliche Anspruchs- und Bemessungsangaben ergänzen."
              : "Schätzung aus persönlichen Angaben, keine zusätzliche Teilzeitkürzung.",
          ]),
    ];
  }
  if (position.kind === "base") {
    const b = position.basis;
    if (b.hourly)
      return [
        `Persönlicher Stundenlohn: ${remunerationEuro(b.hourly.rateCents)}`,
        b.hourly.paidMinutes === null
          ? "Bezahlte Stunden noch nicht bestätigt."
          : `${b.hourly.kind === "absence" ? "Bezahlte Abwesenheit" : "Bezahlte Arbeitszeit"}: ${decimal(b.hourly.paidMinutes / 60)} Stunden`,
        ...(b.hourly.confirmationRevision !== null
          ? [`Bestätigungsrevision: ${b.hourly.confirmationRevision}`]
          : []),
        ...(b.hourly.pauseEstimated
          ? ["Pausenlage für die zeitliche Aufteilung mittig geschätzt."]
          : []),
      ];
    return [
      ...(b.fullTimeMonthlyCents !== null
        ? [`Vollzeit-Monatsentgelt: ${remunerationEuro(b.fullTimeMonthlyCents)}`]
        : []),
      ...(b.personalMonthlyCents !== null
        ? [`Persönliches Monatsentgelt: ${remunerationEuro(b.personalMonthlyCents)}`]
        : []),
      ...(b.weeklyMinutes !== null
        ? [`Persönliche Wochenstunden: ${decimal(b.weeklyMinutes / 60)}`]
        : []),
      ...(b.fullTimeWeeklyMinutes !== null
        ? [`Vollzeit-Wochenstunden: ${decimal(b.fullTimeWeeklyMinutes / 60)}`]
        : []),
      b.proration === "unconfirmed"
        ? "Zeitanteil noch nicht bestätigt."
        : b.proration === "calendar-days"
          ? `Zeitanteil: ${b.calendarDays} von ${b.monthDays} Kalendertagen`
          : "Voller Monatsbetrag",
    ];
  }
  if (position.kind === "time-premium") {
    const b = position.basis;
    return [
      `Berücksichtigte Zeit: ${decimal(b.minutes / 60)} Stunden`,
      ...(b.hourlyRateCents !== null
        ? [
            `${b.percentageBasisPoints === null ? "Zuschlag pro Stunde" : "Stundenbasis"}: ${remunerationEuro(b.hourlyRateCents)}`,
          ]
        : []),
      ...(b.percentageBasisPoints !== null
        ? [`Zuschlag: ${decimal(b.percentageBasisPoints / 100)} %`]
        : []),
      ...(b.ruleId ? [`Regel: ${b.ruleId}`] : []),
      ...(b.pauseMethod === "centered-duration-estimate"
        ? ["Pausenlage mangels genauer Angabe mittig geschätzt."]
        : b.pauseMethod === "confirmed-intervals"
          ? ["Tatsächliche Pausenintervalle berücksichtigt."]
          : []),
    ];
  }
  const b = position.basis;
  if (b.ruleId === "tvl-part-iv:burn-month-full-hours")
    return [
      `Erfasste tatsächliche Tätigkeitszeit: ${b.minutes} Minuten`,
      `Monatliche Schätzung: ${Math.floor(b.minutes / 60)} volle Stunden; ${b.minutes % 60} Restminuten`,
      `Katalogbetrag je voller Stunde: ${remunerationEuro(b.rateCents)}`,
      "Keine zusätzliche Teilzeitkürzung; Pausen sind in den bestätigten Tätigkeitsabschnitten nicht enthalten.",
      "Die Zusammenfassung auf volle Monatsstunden bedarf vor Freigabe fachlicher Prüfung.",
    ];
  if (b.ruleId === "tvl-part-iv:burn-month-offset")
    return [
      "Monatliche Anrechnung der Schwerbrandpflege auf die besondere Tätigkeitszulage nach Nr. 9/10.",
      "Höchstens die zustehende Tätigkeitszulage wird abgezogen; der Schwerbrandpflegebetrag wird nicht gekürzt.",
      `Anrechnung: ${remunerationEuro(position.amountCents)}`,
    ];
  return [
    ...(b.rateCents !== null ? [`Regelbetrag: ${remunerationEuro(b.rateCents)}`] : []),
    ...(b.personalMonthlyCents !== null
      ? [`Persönlicher Monatsbetrag: ${remunerationEuro(b.personalMonthlyCents)}`]
      : []),
    ...(b.percentageBasisPoints !== null
      ? [`Zuschlag: ${decimal(b.percentageBasisPoints / 100)} %`]
      : []),
    ...(b.proration === "worked-minutes"
      ? [`Berücksichtigte Zeit: ${decimal(b.minutes / 60)} Stunden`]
      : []),
    ...(b.proration === "calendar-days"
      ? [`Zeitanteil: ${b.calendarDays} von ${b.monthDays} Kalendertagen`]
      : []),
    ...(b.proration === "unconfirmed" ? ["Zeitanteil noch nicht bestätigt."] : []),
    ...(b.entitlement
      ? [
          b.entitlement.origin === "confirmed"
            ? "Zulagenart persönlich bestätigt"
            : "Zulagenart aus Muster und Angaben geschätzt",
        ]
      : []),
    ...(b.ruleId ? [`Regel: ${b.ruleId}`] : []),
    ...(b.pauseMethod === "centered-duration-estimate"
      ? ["Pausenlage mangels genauer Angabe mittig geschätzt."]
      : []),
  ];
}
export function remunerationIssues(result: MonthlyRemuneration): readonly string[] {
  return [
    ...new Set([
      ...result.positions.flatMap((position) => (position.issue ? [position.issue.message] : [])),
      ...result.allowanceAssessment.periods.flatMap((period) =>
        period.issue ? [period.issue.message] : [],
      ),
    ]),
  ];
}
