import { router, useLocalSearchParams } from "expo-router";
import { formatMonthTitle } from "@/engine/calendar";
import { parseMonthRouteParam, type RouteParam } from "@/navigation/route-params";
import { LoadFailureView, LoadingView } from "@/ui/loading-view";
import { ReportFootnote, ReportScrollView } from "@/ui/report-layout";
import { AnalysisDetailSummaryCard } from "./analysis-detail-layout";
import { RuleComputationNotice } from "./rule-computation";
import { useMonthlyRemuneration } from "./use-monthly-remuneration";
import { usePflegeShiftEntries } from "@/application/pflegeshift-provider";
import type { ShiftEntry } from "@/domain/types";
import { RemunerationPremiumList } from "./remuneration-premium-list";

export function PremiumDetailsScreen() {
  const params = useLocalSearchParams<{ month?: RouteParam }>();
  const { entries } = usePflegeShiftEntries();
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
      {noOwnPositions ? (
        <AnalysisDetailSummaryCard
          title="Keine Zuschlagspositionen"
          period={formatMonthTitle(month)}
          caption="Für diesen Zeitraum sind keine Zeitzuschläge erfasst."
        />
      ) : (
        <RemunerationPremiumList
          key={month}
          month={month}
          result={premiums}
          shifts={entries.filter(
            (entry): entry is ShiftEntry => entry.kind === "SHIFT" && entry.deletedAt === null,
          )}
        />
      )}
      <ReportFootnote>
        Die Grundlage kann je Dienst und Zeitraum wechseln. Fehlende oder geschätzte Pausenlagen
        werden in der jeweiligen Berechnungsgrundlage erklärt. Grundentgelt, Zulagen und Überstunden
        sind hier nicht enthalten.
      </ReportFootnote>
    </ReportScrollView>
  );
}
