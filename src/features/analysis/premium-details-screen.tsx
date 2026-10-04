import { router, useLocalSearchParams } from "expo-router";
import { formatMonthTitle } from "@/engine/calendar";
import { parseMonthRouteParam, type RouteParam } from "@/navigation/route-params";
import { LoadFailureView, LoadingView } from "@/ui/loading-view";
import { ReportFootnote, ReportScrollView } from "@/ui/report-layout";
import { AnalysisDetailSummaryCard } from "./analysis-detail-layout";
import { RuleComputationNotice } from "./rule-computation";
import { useMonthlyRemuneration } from "./use-monthly-remuneration";
import { RemunerationPositions } from "@/features/salary/remuneration-positions";
import { remunerationEuro, REMUNERATION_STATUS } from "@/features/salary/remuneration-presentation";

export function PremiumDetailsScreen() {
  const params = useLocalSearchParams<{ month?: RouteParam }>();
  const parsed = parseMonthRouteParam(params.month);
  // Disabled sentinel cannot be evaluated and is never shown.
  const month = parsed.status === "valid" ? parsed.value : "2000-01";
  const { calculation, error, reload } = useMonthlyRemuneration(month, parsed.status === "valid");
  if (parsed.status !== "valid")
    return (
      <LoadFailureView
        actionLabel="Schließen"
        title="Zuschlagsdetails können nicht geöffnet werden"
        message="Der Link zu den Zuschlagsdetails enthält keinen gültigen Monat."
        onRetry={() => router.back()}
      />
    );
  if (error) return <LoadFailureView message={error} onRetry={() => void reload()} />;
  if (calculation === null) return <LoadingView />;
  if (!calculation.ok)
    return (
      <ReportScrollView>
        <RuleComputationNotice
          failure={calculation}
          onRetry={() => void reload()}
          title="Zuschlagsdetails nicht verfügbar"
        />
      </ReportScrollView>
    );
  const premiums = calculation.value.timePremiums;
  const noOwnPositions =
    premiums.positions.length === 0 &&
    calculation.value.base.positions.every((position) => position.source.kind === "profile");
  return (
    <ReportScrollView>
      <AnalysisDetailSummaryCard
        title={noOwnPositions ? "Keine Zuschlagspositionen" : remunerationEuro(premiums.totalCents)}
        period={formatMonthTitle(month)}
        caption={
          noOwnPositions
            ? "Für diesen Zeitraum sind keine Zeitzuschläge erfasst."
            : `Zeitzuschläge · ${REMUNERATION_STATUS[premiums.status]}${!premiums.complete ? ` · bekannter Teilbetrag: ${remunerationEuro(premiums.knownSubtotalCents)}` : ""}`
        }
      />
      <RemunerationPositions key={month} positions={premiums.positions} />
      <ReportFootnote>
        Die Grundlage kann je Dienst und Zeitraum wechseln. Fehlende oder geschätzte Pausenlagen
        werden in der jeweiligen Berechnungsgrundlage erklärt. Grundentgelt, Zulagen und Überstunden
        sind hier nicht enthalten.
      </ReportFootnote>
    </ReportScrollView>
  );
}
