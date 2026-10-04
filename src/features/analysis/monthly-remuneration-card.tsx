import { router } from "expo-router";
import { salaryRoute, settingsEditorRoute } from "@/navigation/routes";
import { remunerationEuro } from "@/features/salary/remuneration-presentation";
import { AnalysisListCard, AnalysisValueRow } from "./analysis-list-card";
import { useMonthlyRemuneration } from "./use-monthly-remuneration";

/** Mounted only when the monthly pay card is visible; never blocks work-time cards. */
export function MonthlyRemunerationCard({ month }: { readonly month: string }) {
  const { calculation, error } = useMonthlyRemuneration(month);
  const pay = calculation?.ok ? calculation.value : null;
  const unconfigured =
    pay !== null &&
    pay.base.positions.every(
      (position) =>
        position.issue?.code === "PROFILE_MISSING" ||
        position.issue?.code === "REMUNERATION_UNCONFIGURED",
    );
  const status =
    error || (calculation !== null && !calculation.ok)
      ? "Nicht verfügbar"
      : calculation === null
        ? "Wird berechnet …"
        : unconfigured
          ? "Gehalt einrichten"
          : !pay?.complete
            ? "Nicht verfügbar"
            : null;
  const caption = error
    ? "Vergütungsdaten konnten nicht geladen werden. Details zum erneuten Laden öffnen."
    : calculation === null
      ? "Vergütungsdaten werden geladen."
      : unconfigured
        ? "Tarif oder eigene Vergütung mit Gültigkeitsdatum hinterlegen."
        : !pay?.complete
          ? "Berechnung unvollständig · Teilbeträge sind kein Gesamtbrutto."
          : "Unverbindliche Brutto-Schätzung · datierte Vergütungsgrundlage";
  const value = status ?? remunerationEuro(pay?.estimatedGrossCents ?? null);
  return (
    <AnalysisListCard
      title="Gehalt"
      label={`Gehalt, ${value}`}
      caption={caption}
      onPress={() => router.push(unconfigured ? settingsEditorRoute("TARIFF") : salaryRoute(month))}
    >
      {status ? <AnalysisValueRow first reserveDisclosure label="Status" value={status} /> : null}
      {pay ? (
        <>
          <AnalysisValueRow
            first={!status}
            reserveDisclosure
            label="Grundgehalt"
            value={remunerationEuro(pay.base.totalCents)}
          />
          <AnalysisValueRow
            reserveDisclosure
            label="Zeitzuschläge"
            value={remunerationEuro(pay.timePremiums.totalCents)}
          />
          <AnalysisValueRow
            reserveDisclosure
            label="Weitere Zulagen"
            value={remunerationEuro(pay.allowances.totalCents)}
          />
          {pay.overtime.totalCents !== 0 || !pay.overtime.complete ? (
            <AnalysisValueRow
              reserveDisclosure
              label="Überstundenvergütung"
              value={remunerationEuro(pay.overtime.totalCents)}
            />
          ) : null}
          <AnalysisValueRow
            reserveDisclosure
            total
            label={pay.complete ? "Brutto gesamt" : "Bekannter Teilbetrag"}
            value={remunerationEuro(
              pay.complete ? pay.estimatedGrossCents : pay.knownSubtotalCents,
            )}
          />
        </>
      ) : null}
    </AnalysisListCard>
  );
}
