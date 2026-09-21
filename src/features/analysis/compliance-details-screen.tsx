import { router, useLocalSearchParams } from "expo-router";
import { useMemo, useState } from "react";

import {
  usePflegeShiftEntries,
  usePflegeShiftProfile,
  usePflegeShiftStatus,
} from "@/application/pflegeshift-provider";
import { useRuleCatalogRuntime } from "@/application/rule-catalog-runtime-provider";
import { currentMonth, formatMonthTitle } from "@/engine/calendar";
import { selectComplianceShifts } from "@/features/analysis/analysis-data";
import { captureRuleComputation, RuleComputationNotice } from "./rule-computation";
import { requireResolvedPackage } from "@/rules/rule-resolver";
import type { ShiftEntry } from "@/domain/types";
import { ComplianceDayList } from "./compliance-day-list";
import { useDeferredMonthlyCompliance } from "@/features/analysis/use-monthly-compliance";
import { useCheckPreferences } from "@/features/settings/check-preferences";
import { selectVisibleCompliance } from "./check-visibility";
import { AnalysisCoverageNote } from "./analysis-coverage-note";
import { CheckExplanation, CheckPeriod } from "./check-summary-card";
import { parseMonthRouteParam, type RouteParam } from "@/navigation/route-params";
import { LoadFailureView, LoadingView } from "@/ui/loading-view";
import { ScreenScrollView } from "@/ui/screen-layout";
import { ReportScrollView } from "@/ui/report-layout";

const EMPTY_SHIFTS: readonly ShiftEntry[] = Object.freeze([]);

export function ComplianceDetailsScreen() {
  const preferences = useCheckPreferences();
  const params = useLocalSearchParams<{ month?: RouteParam }>();
  const { error, ready, reload } = usePflegeShiftStatus();
  const { profile } = usePflegeShiftProfile();
  const { entries } = usePflegeShiftEntries();
  const { resolver: ruleResolver } = useRuleCatalogRuntime();
  const parsedMonth = parseMonthRouteParam(params.month);
  const month =
    parsedMonth.status === "valid" ? parsedMonth.value : currentMonth(profile?.timeZone);
  const [retryRevision, setRetryRevision] = useState(0);
  const window = useMemo(() => {
    void retryRevision;
    if (!ready || error || !profile || parsedMonth.status !== "valid") return null;
    return captureRuleComputation(() => {
      requireResolvedPackage(ruleResolver.resolveHoliday(`${month}-01`));
      return selectComplianceShifts(entries, month, ruleResolver);
    });
  }, [entries, month, ruleResolver, retryRevision, ready, error, profile, parsedMonth.status]);
  const monthlyCompliance = useDeferredMonthlyCompliance({
    enabled: window?.ok === true,
    month,
    profile,
    ruleResolver,
    shifts: window?.ok ? window.value : EMPTY_SHIFTS,
  });
  const sourceCompliance = monthlyCompliance.result;
  const compliance =
    sourceCompliance === null
      ? null
      : selectVisibleCompliance(sourceCompliance, preferences.enabled !== false);

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
  if (window && !window.ok)
    return (
      <ReportScrollView>
        <CheckPeriod period={formatMonthTitle(month)} />
        <RuleComputationNotice
          failure={window}
          onRetry={() => setRetryRevision((value) => value + 1)}
          title="Arbeitszeitprüfung nicht verfügbar"
        />
      </ReportScrollView>
    );
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

  return (
    <ScreenScrollView
      surface="groupedBackground"
      style={{ flex: 1 }}
      contentContainerStyle={{ flexGrow: 1 }}
    >
      {preferences.error ? <AnalysisCoverageNote message={preferences.error} /> : null}
      {preferences.enabled === null && !preferences.error ? (
        <AnalysisCoverageNote message="Prüfungseinstellungen werden geladen … Hinweise sind vorläufig vollständig sichtbar." />
      ) : null}
      <CheckPeriod period={formatMonthTitle(month)} />
      <ComplianceDayList
        compliance={sourceCompliance!}
        showPlanning={preferences.enabled !== false}
        shifts={window?.ok ? window.value : EMPTY_SHIFTS}
      />
      <CheckExplanation />
    </ScreenScrollView>
  );
}
