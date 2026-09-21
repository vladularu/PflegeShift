import { ShiftAnalysisDetails } from "./shift-analysis-details";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { useMemo } from "react";
import {
  usePflegeShiftEntries,
  usePflegeShiftProfile,
  usePflegeShiftStatus,
  usePflegeShiftTariff,
} from "@/application/pflegeshift-provider";
import { useRuleCatalogRuntime } from "@/application/rule-catalog-runtime-provider";
import { currentMonth, formatMonthTitle } from "@/engine/calendar";
import { formatMinutes, formatSignedMinutes } from "@/engine/working-time";
import {
  parseMonthRouteParam,
  parseEnumRouteParam,
  type RouteParam,
} from "@/navigation/route-params";
import { usePalette } from "@/theme/palette";
import { EmptyState, SurfaceCard } from "@/ui/design-system";
import { LoadFailureView, LoadingView } from "@/ui/loading-view";
import { ReportScrollView } from "@/ui/report-layout";
import { AnalysisDetailSummaryCard } from "./analysis-detail-layout";
import { AnalysisCoverageNote } from "./analysis-coverage-note";
import { WorktimeCard } from "./analysis-report-cards";
import { calculateMonthlyAnalysis } from "./monthly-analysis";

export function WorktimeDetailsScreen() {
  const palette = usePalette();
  const params = useLocalSearchParams<{ month?: RouteParam; section?: RouteParam }>();
  const parsed = parseMonthRouteParam(params.month);
  const parsedSection = parseEnumRouteParam(params.section, ["WORK", "SHIFTS"]);
  const shiftsOnly = parsedSection.status === "valid" && parsedSection.value === "SHIFTS";
  const { profile } = usePflegeShiftProfile();
  const { entries } = usePflegeShiftEntries();
  const { ready, error, reload } = usePflegeShiftStatus();
  const { tariffDecisions, workPatternSettings } = usePflegeShiftTariff();
  const { resolver } = useRuleCatalogRuntime();
  const month = parsed.status === "valid" ? parsed.value : currentMonth(profile?.timeZone);
  const data = useMemo(
    () =>
      parsed.status === "valid" && ready && !error && profile
        ? calculateMonthlyAnalysis(
            month,
            entries,
            profile,
            tariffDecisions,
            workPatternSettings,
            resolver,
          )
        : null,
    [
      parsed.status,
      ready,
      error,
      month,
      entries,
      profile,
      tariffDecisions,
      workPatternSettings,
      resolver,
    ],
  );
  if (parsed.status !== "valid" || parsedSection.status === "invalid")
    return (
      <LoadFailureView
        title="Stunden können nicht geöffnet werden"
        message="Der Link enthält keinen gültigen Monat."
        actionLabel="Schließen"
        onRetry={() => router.back()}
      />
    );
  if (ready && error) return <LoadFailureView message={error} onRetry={() => void reload()} />;
  if (!data) return <LoadingView />;
  const { summary, shiftTypeAnalysis } = data;
  if (shiftsOnly)
    return (
      <>
        <Stack.Screen options={{ title: "Schichten" }} />
        <ReportScrollView>
          <AnalysisDetailSummaryCard
            title="Deine Schichten"
            period={formatMonthTitle(month)}
            caption="Anzahl und Stunden pro Schichtart."
          />
          <ShiftAnalysisDetails analysis={shiftTypeAnalysis} creditsAvailable={summary.ok} />
        </ReportScrollView>
      </>
    );
  return (
    <ReportScrollView>
      <Stack.Screen options={{ title: "Stunden" }} />
      <AnalysisDetailSummaryCard
        title="Deine Stunden"
        period={formatMonthTitle(month)}
        caption="Arbeitszeit und Schichten für diesen Monat."
      />
      <WorktimeCard
        actual={formatMinutes(
          summary.ok ? summary.value.actualMinutes : shiftTypeAnalysis.totalMinutes,
        )}
        target={summary.ok ? formatMinutes(summary.value.targetMinutes) : "Nicht verfügbar"}
        balance={summary.ok ? formatSignedMinutes(summary.value.balanceMinutes) : "Nicht verfügbar"}
        balanceAccent={
          summary.ok
            ? summary.value.balanceMinutes < 0
              ? palette.danger
              : palette.success
            : palette.textMuted
        }
      />
      {!summary.ok ? (
        <AnalysisCoverageNote message="Soll, Saldo und Abwesenheitsgutschriften benötigen einen gültigen Feiertagsstand. Angezeigt werden erfasste Arbeits- und Fortbildungszeiten." />
      ) : null}
      {shiftTypeAnalysis.totalCount === 0 ? (
        <SurfaceCard>
          <EmptyState
            title="Noch keine Dienste"
            message="Trage Dienste ein, um den Monat auszuwerten."
          />
        </SurfaceCard>
      ) : (
        <>
          <ShiftAnalysisDetails analysis={shiftTypeAnalysis} creditsAvailable={summary.ok} />
        </>
      )}
    </ReportScrollView>
  );
}
