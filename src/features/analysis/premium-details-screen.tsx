import { router, useLocalSearchParams } from "expo-router";
import { useMemo, useState } from "react";

import {
  usePflegeShiftEntries,
  usePflegeShiftProfile,
  usePflegeShiftStatus,
  usePflegeShiftTariff,
} from "@/application/pflegeshift-provider";
import { useRuleCatalogRuntime } from "@/application/rule-catalog-runtime-provider";
import { currentMonth, formatMonthTitle } from "@/engine/calendar";
import { calculateMonthlyPayEstimate } from "@/engine/pay";
import { PremiumBreakdownList } from "./premium-breakdown-list";
import {
  selectAllowanceShifts,
  selectMonthlyAnalysisEntries,
} from "@/features/analysis/analysis-data";
import { AnalysisCoverageNote } from "@/features/analysis/analysis-coverage-note";
import { AnalysisDetailSummaryCard } from "@/features/analysis/analysis-detail-layout";
import {
  captureRuleComputation,
  RuleComputationNotice,
} from "@/features/analysis/rule-computation";
import { parseMonthRouteParam, type RouteParam } from "@/navigation/route-params";
import { LoadFailureView, LoadingView } from "@/ui/loading-view";
import { ReportScrollView } from "@/ui/report-layout";

export function PremiumDetailsScreen() {
  const params = useLocalSearchParams<{ month?: RouteParam }>();
  const { error, ready, reload } = usePflegeShiftStatus();
  const { profile } = usePflegeShiftProfile();
  const { entries } = usePflegeShiftEntries();
  const { tariffDecisions, workPatternSettings } = usePflegeShiftTariff();
  const { resolver: ruleResolver } = useRuleCatalogRuntime();
  const [ruleRetryRevision, setRuleRetryRevision] = useState(0);
  const parsedMonth = parseMonthRouteParam(params.month);
  const month =
    parsedMonth.status === "valid" ? parsedMonth.value : currentMonth(profile?.timeZone);
  const calculation = useMemo(() => {
    void ruleRetryRevision;
    if (parsedMonth.status !== "valid" || !ready || error || profile === null) return null;
    return captureRuleComputation(() => {
      const monthlyEntries = selectMonthlyAnalysisEntries(entries, month);
      const allowanceShifts =
        profile.tariff === null
          ? monthlyEntries.monthShifts
          : selectAllowanceShifts(entries, month, ruleResolver);
      const decision = tariffDecisions.find((item) => item.month === month) ?? null;
      return {
        monthShifts: monthlyEntries.monthShifts,
        pay: calculateMonthlyPayEstimate(
          month,
          monthlyEntries.monthShifts,
          profile,
          decision,
          allowanceShifts,
          workPatternSettings,
          ruleResolver,
        ),
      };
    });
  }, [
    entries,
    error,
    month,
    parsedMonth.status,
    profile,
    ready,
    ruleResolver,
    ruleRetryRevision,
    tariffDecisions,
    workPatternSettings,
  ]);

  if (parsedMonth.status !== "valid") {
    return (
      <LoadFailureView
        actionLabel="Schließen"
        message="Der Link zu den Zuschlagsdetails enthält keinen gültigen Monat."
        onRetry={() => router.back()}
        title="Zuschlagsdetails können nicht geöffnet werden"
      />
    );
  }
  if (ready && error) {
    return <LoadFailureView message={error} onRetry={() => void reload()} />;
  }
  if (calculation !== null && !calculation.ok) {
    return (
      <ReportScrollView>
        <AnalysisDetailSummaryCard
          caption="Die übrige Auswertung bleibt verfügbar."
          period={formatMonthTitle(month)}
          title="Nicht verfügbar"
        />
        <RuleComputationNotice
          failure={calculation}
          onRetry={() => setRuleRetryRevision((value) => value + 1)}
          title="Zuschlagsdetails nicht verfügbar"
        />
      </ReportScrollView>
    );
  }
  if (!ready || profile === null || calculation === null) return <LoadingView />;

  const { monthShifts, pay } = calculation.value;
  if (profile.tariff === null)
    return (
      <ReportScrollView>
        <AnalysisDetailSummaryCard
          title="Keine tarifliche Berechnung"
          period={formatMonthTitle(month)}
          caption="Für manuell hinterlegtes Gehalt werden keine Zeitzuschläge berechnet."
        />
      </ReportScrollView>
    );
  if (!pay.available) {
    return (
      <ReportScrollView>
        <AnalysisDetailSummaryCard
          caption="Für diesen Zeitraum liegt kein geprüfter Tarifstand vor."
          period={formatMonthTitle(month)}
          title="Nicht verfügbar"
        />
        <AnalysisCoverageNote message="Zuschlagsdetails werden erst mit einem gültigen Tarifstand angezeigt." />
      </ReportScrollView>
    );
  }
  return (
    <ReportScrollView>
      <PremiumBreakdownList key={month} pay={pay} shifts={monthShifts} />
    </ReportScrollView>
  );
}
