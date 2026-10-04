import { router } from "expo-router";
import { formatMonthTitle } from "@/engine/calendar";
import { annualDetailsRoute } from "@/navigation/routes";
import { remunerationEuro } from "@/features/salary/remuneration-presentation";
import { AnalysisListCard, AnalysisValueRow } from "./analysis-list-card";
import type { AnnualRemuneration, AnnualRemunerationComponent } from "./annual-remuneration";

function stateLabel(pay: AnnualRemuneration, pending: boolean) {
  return pending || pay.status === "loading"
    ? "Wird berechnet …"
    : pay.status === "error"
      ? "Nicht verfügbar"
      : pay.estimatedGrossCents === null
        ? "Berechnung unvollständig"
        : remunerationEuro(pay.estimatedGrossCents);
}
function componentLabel(part: AnnualRemunerationComponent) {
  if (!part.hasKnownAmounts) return "Nicht berechenbar";
  return part.totalCents === null
    ? "Teilbetrag: " + remunerationEuro(part.knownSubtotalCents)
    : remunerationEuro(part.totalCents);
}
export function AnnualRemunerationCard({
  pay,
  year,
  pending = false,
  details = false,
}: {
  readonly pay: AnnualRemuneration;
  readonly year: number;
  readonly pending?: boolean;
  readonly details?: boolean;
}) {
  const ready = !pending && pay.status === "ready";
  const complete = pay.estimatedGrossCents !== null;
  const state = stateLabel(pay, pending);
  return (
    <AnalysisListCard
      title="Gehalt"
      label={`Gehalt, ${state}`}
      onPress={details ? undefined : () => router.push(annualDetailsRoute(year, "PAY"))}
      caption={
        ready
          ? `${pay.completeMonthCount} von 12 Monaten vollständig · ${complete ? "Unverbindliche Brutto-Schätzung" : "Teilbeträge sind kein Jahresbrutto"}`
          : pay.status === "error"
            ? "Vergütungsdaten konnten nicht geladen werden. Einen Monat öffnen und dort erneut laden."
            : "Vergütungsdaten werden geladen."
      }
    >
      <AnalysisValueRow
        first
        total
        label={ready && complete ? "Jahresbrutto" : "Status"}
        value={state}
      />
      {ready ? (
        <>
          {!complete && pay.hasKnownAmounts ? (
            <AnalysisValueRow
              label="Bekannter Teilbetrag"
              value={remunerationEuro(pay.knownSubtotalCents)}
            />
          ) : null}
          <AnalysisValueRow label="Grundgehalt" value={componentLabel(pay.base)} />
          <AnalysisValueRow
            label="Zeitzuschläge"
            value={componentLabel(pay.timePremiums)}
            onPress={details ? () => router.push(annualDetailsRoute(year, "PREMIUM")) : undefined}
          />
          <AnalysisValueRow label="Weitere Zulagen" value={componentLabel(pay.allowances)} />
          <AnalysisValueRow label="Überstundenvergütung" value={componentLabel(pay.overtime)} />
          {pay.months.some((item) => item.result?.annualPayments.positions.length) ? (
            <AnalysisValueRow
              label="Jahressonderzahlung"
              value={componentLabel(pay.annualPayments)}
            />
          ) : null}
        </>
      ) : null}
    </AnalysisListCard>
  );
}
export function AnnualRemunerationDetails({
  pay,
  year,
  onSelectMonth,
}: {
  readonly pay: AnnualRemuneration;
  readonly year: number;
  readonly onSelectMonth: (month: string) => void;
}) {
  return (
    <>
      <AnnualRemunerationCard pay={pay} year={year} details />
      <AnalysisListCard
        title="Nach Monaten"
        caption="Monat öffnen: Berechnungsgrundlagen, Quellen und fehlende Angaben."
      >
        {pay.months.map(({ month, result }, index) => (
          <AnalysisValueRow
            key={month}
            first={index === 0}
            label={formatMonthTitle(month)}
            value={
              pay.status !== "ready" || result === null
                ? "Nicht verfügbar"
                : !result.positions.some((position) => position.amountCents !== null) &&
                    !result.complete
                  ? "Nicht berechenbar"
                  : result.estimatedGrossCents === null
                    ? "Teilbetrag: " + remunerationEuro(result.knownSubtotalCents)
                    : remunerationEuro(result.estimatedGrossCents)
            }
            onPress={() => onSelectMonth(month)}
          />
        ))}
      </AnalysisListCard>
    </>
  );
}
export function AnnualRemunerationPremiums({
  pay,
  year,
  pending,
  onSelectMonth,
}: {
  readonly pay: AnnualRemuneration;
  readonly year: number;
  readonly pending: boolean;
  readonly onSelectMonth: (month: string) => void;
}) {
  const ready = !pending && pay.status === "ready";
  return (
    <>
      <AnalysisListCard
        title={"Zeitzuschläge " + year}
        caption={
          ready
            ? `${pay.timePremiums.completeMonthCount} von 12 Monaten vollständig · Brutto-Schätzung`
            : undefined
        }
      >
        <AnalysisValueRow
          first
          total
          label={
            ready
              ? pay.timePremiums.totalCents === null
                ? "Bekannter Teilbetrag"
                : "Gesamt"
              : "Status"
          }
          value={
            ready
              ? pay.timePremiums.hasKnownAmounts
                ? remunerationEuro(
                    pay.timePremiums.totalCents ?? pay.timePremiums.knownSubtotalCents,
                  )
                : "Nicht berechenbar"
              : pending || pay.status === "loading"
                ? "Wird berechnet …"
                : "Nicht verfügbar"
          }
        />
      </AnalysisListCard>
      <AnalysisListCard title="Nach Monaten">
        {pay.months.map(({ month, result }, index) => (
          <AnalysisValueRow
            key={month}
            first={index === 0}
            label={formatMonthTitle(month)}
            value={
              !ready || result === null
                ? "Nicht verfügbar"
                : componentLabel({
                    ...result.timePremiums,
                    hasKnownAmounts:
                      result.timePremiums.complete ||
                      result.timePremiums.positions.some(
                        (position) => position.amountCents !== null,
                      ),
                    completeMonthCount: result.timePremiums.complete ? 1 : 0,
                  })
            }
            onPress={() => onSelectMonth(month)}
          />
        ))}
      </AnalysisListCard>
    </>
  );
}
