import { router, useLocalSearchParams } from "expo-router";
import { useMemo } from "react";

import {
  usePflegeShiftEntries,
  usePflegeShiftProfile,
  usePflegeShiftStatus,
} from "@/application/pflegeshift-provider";
import { useRuleCatalogRuntime } from "@/application/rule-catalog-runtime-provider";
import { currentMonth, formatMonthTitle } from "@/engine/calendar";
import { AnalysisDetailSummaryCard } from "@/features/analysis/analysis-detail-layout";
import { selectAnalysisEntryWindow } from "@/features/analysis/analysis-data";
import { ComplianceDetails } from "@/features/analysis/analysis-screen";
import { useDeferredMonthlyCompliance } from "@/features/analysis/use-monthly-compliance";
import { parseMonthRouteParam, type RouteParam } from "@/navigation/route-params";
import { usePalette } from "@/theme/palette";
import { LoadFailureView, LoadingView } from "@/ui/loading-view";
import { ReportScrollView } from "@/ui/report-layout";

export function ComplianceDetailsScreen() {
  const palette = usePalette();
  const params = useLocalSearchParams<{ month?: RouteParam }>();
  const { error, ready, reload } = usePflegeShiftStatus();
  const { profile } = usePflegeShiftProfile();
  const { entries } = usePflegeShiftEntries();
  const { resolver: ruleResolver } = useRuleCatalogRuntime();
  const parsedMonth = parseMonthRouteParam(params.month);
  const month =
    parsedMonth.status === "valid" ? parsedMonth.value : currentMonth(profile?.timeZone);
  const window = useMemo(
    () => selectAnalysisEntryWindow(entries, month, ruleResolver),
    [entries, month, ruleResolver],
  );
  const monthlyCompliance = useDeferredMonthlyCompliance({
    enabled: true,
    month,
    profile,
    ruleResolver,
    shifts: window.complianceShifts,
  });
  const compliance = monthlyCompliance.result;

  if (parsedMonth.status !== "valid") {
    return (
      <LoadFailureView
        actionLabel="Schließen"
        message="Der Link zur Arbeitszeitprüfung enthält keinen gültigen Monat."
        onRetry={() => router.back()}
        title="Arbeitszeitprüfung kann nicht geöffnet werden"
      />
    );
  }
  if (ready && error) {
    return <LoadFailureView message={error} onRetry={() => void reload()} />;
  }
  if (monthlyCompliance.error) {
    return (
      <LoadFailureView
        message={monthlyCompliance.error}
        onRetry={monthlyCompliance.retry}
        title="Arbeitszeitprüfung fehlgeschlagen"
      />
    );
  }
  if (!ready || profile === null || compliance === null) return <LoadingView />;
  const messageCount = compliance.criticalCount + compliance.warningCount + compliance.infoCount;
  const accent =
    messageCount === 0
      ? palette.success
      : compliance.criticalCount > 0
        ? palette.danger
        : compliance.warningCount > 0
          ? palette.warning
          : palette.primary;

  return (
    <ReportScrollView>
      <AnalysisDetailSummaryCard
        accent={accent}
        caption="Automatische Prüfung deiner Dienste. Die Hinweise ersetzen keine Rechtsberatung."
        period={formatMonthTitle(month)}
        title={
          messageCount === 0
            ? "Alles im grünen Bereich"
            : `${messageCount} ${messageCount === 1 ? "Meldung" : "Meldungen"}`
        }
      />
      <ComplianceDetails
        compliance={compliance}
        heading="Meldungen"
        shifts={window.complianceShifts}
      />
    </ReportScrollView>
  );
}
