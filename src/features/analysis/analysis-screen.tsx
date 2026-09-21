import { Temporal } from "@js-temporal/polyfill";
import { router, useFocusEffect, useIsFocused, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { View } from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";

import {
  usePflegeShiftEntries,
  usePflegeShiftProfile,
  usePflegeShiftStatus,
  usePflegeShiftTariff,
  usePflegeShiftTestData,
} from "@/application/pflegeshift-provider";
import { useRuleCatalogRuntime } from "@/application/rule-catalog-runtime-provider";
import type { MonthlyComplianceResult, ShiftEntry } from "@/domain/types";
import { AnalysisViewControls } from "./analysis-view-controls";
import { MonthOverview } from "./month-overview";
import { calculateMonthlyAnalysis } from "@/features/analysis/monthly-analysis";
import { AnnualReportRuleFailure } from "@/features/analysis/annual-report-failure";
import { AnalysisYearHeader } from "@/features/analysis/analysis-period-header";
import { AnalysisCoverageNote } from "@/features/analysis/analysis-coverage-note";
import {
  AnalysisMonthHeader,
  ExpandableHighlightCard,
  formatMonthRangeLabel,
} from "@/features/analysis/analysis-overview-cards";
import { AnnualReportScreen, type AnalysisPeriod } from "@/features/analysis/annual-report-view";
import { useAnnualReportInputs } from "@/features/analysis/use-annual-report-inputs";
import { useDeferredAnnualReport } from "@/features/analysis/use-annual-report";
import { useDeferredMonthlyCompliance } from "@/features/analysis/use-monthly-compliance";
import { useCheckPreferences } from "@/features/settings/check-preferences";
import { PLANNING_HIDDEN_NOTICE, selectVisibleCompliance } from "./check-visibility";
import { complianceDetailsRoute, salaryRoute } from "@/navigation/routes";
import { parseMonthRouteParam, type RouteParam } from "@/navigation/route-params";
import { useActiveMonthCoordinator } from "@/navigation/active-month";
import { usePalette } from "@/theme/palette";
import { MOTION } from "@/theme/motion";
import { LoadFailureView, LoadingView } from "@/ui/loading-view";
import { selectionFeedback } from "@/ui/haptics";
import {
  ReportFootnote,
  ReportPeriodContent,
  ReportScrollView,
  ReportTestBadge,
} from "@/ui/report-layout";

import { ComplianceDetails } from "./compliance-details";
export type AnalysisExpandedCard = "CHECK" | "PAY";
export { ComplianceDetails } from "./compliance-details";

const EMPTY_SHIFTS: readonly ShiftEntry[] = Object.freeze([]);

export function AnalysisScreen({
  initialExpandedCard = null,
}: {
  readonly initialExpandedCard?: AnalysisExpandedCard | null;
}) {
  const palette = usePalette();
  const isFocused = useIsFocused();
  const checkPreferences = useCheckPreferences();
  const activeMonthCoordinator = useActiveMonthCoordinator();
  const params = useLocalSearchParams<{ month?: RouteParam }>();
  const { error, ready, reload } = usePflegeShiftStatus();
  const { profile } = usePflegeShiftProfile();
  const { entries } = usePflegeShiftEntries();
  const { tariffDecisions, workPatternSettings } = usePflegeShiftTariff();
  const { testMonths } = usePflegeShiftTestData();
  const { resolver: ruleResolver } = useRuleCatalogRuntime();
  const [month, setMonth] = useState(() => activeMonthCoordinator.getMonth());
  const [period, setPeriod] = useState<AnalysisPeriod>("MONTH");
  const [year, setYear] = useState(() => Number(activeMonthCoordinator.getMonth().slice(0, 4)));
  const parsedMonth = parseMonthRouteParam(params.month);
  const routeMonth = parsedMonth.status === "valid" ? parsedMonth.value : null;

  useEffect(() => {
    if (routeMonth !== null) {
      activeMonthCoordinator.setMonth(routeMonth);
      setMonth(routeMonth);
    }
  }, [activeMonthCoordinator, routeMonth]);

  useEffect(() => {
    if (initialExpandedCard) {
      const targetMonth = routeMonth ?? activeMonthCoordinator.getMonth();
      router.push(
        initialExpandedCard === "PAY"
          ? salaryRoute(targetMonth)
          : complianceDetailsRoute(targetMonth),
      );
    }
  }, [initialExpandedCard, routeMonth, activeMonthCoordinator]);

  useFocusEffect(
    useCallback(() => {
      const activeMonth = activeMonthCoordinator.getMonth();
      setMonth((current) => (current === activeMonth ? current : activeMonth));
      setYear((current) =>
        current === Number(activeMonth.slice(0, 4)) ? current : Number(activeMonth.slice(0, 4)),
      );
    }, [activeMonthCoordinator]),
  );

  const monthlyCalculation = useMemo(() => {
    if (period !== "MONTH" || !ready || error !== null || profile === null) return null;
    return calculateMonthlyAnalysis(
      month,
      entries,
      profile,
      tariffDecisions,
      workPatternSettings,
      ruleResolver,
    );
  }, [
    entries,
    error,
    month,
    period,
    profile,
    ready,
    ruleResolver,
    tariffDecisions,
    workPatternSettings,
  ]);
  const monthlyData = monthlyCalculation;
  const monthlyCompliance = useDeferredMonthlyCompliance({
    enabled:
      isFocused && period === "MONTH" && monthlyData !== null && monthlyData.complianceShifts.ok,
    month,
    profile,
    ruleResolver,
    shifts:
      monthlyData?.complianceShifts.ok === true ? monthlyData.complianceShifts.value : EMPTY_SHIFTS,
  });
  const compliance = monthlyCompliance.result;
  const annualInputs = useAnnualReportInputs(
    year,
    entries,
    tariffDecisions,
    ruleResolver,
    period === "YEAR",
    0,
    profile?.tariff !== null,
  );
  const annualReport = useDeferredAnnualReport({
    enabled: ready && !error && isFocused && period === "YEAR" && annualInputs !== null,
    entries: annualInputs?.ok ? annualInputs.value.entries : entries,
    profile,
    ruleResolver,
    tariffDecisions: annualInputs?.ok ? annualInputs.value.tariffDecisions : tariffDecisions,
    workPatternSettings,
    year,
  });

  if (ready && error) {
    return <LoadFailureView message={error} onRetry={() => void reload()} />;
  }

  function changePeriod(nextPeriod: AnalysisPeriod) {
    setPeriod(nextPeriod);
    if (nextPeriod === "YEAR") setYear(Number(month.slice(0, 4)));
    selectionFeedback();
  }

  if (period === "YEAR") {
    if (annualReport.fatalError !== null) throw annualReport.fatalError;
    if (annualReport.ruleFailure !== null) {
      return (
        <AnnualReportRuleFailure
          failure={annualReport.ruleFailure}
          onBackToMonth={() => changePeriod("MONTH")}
          onMoveYear={moveYear}
          onRetry={annualReport.retry}
          year={year}
        />
      );
    }
    if (annualReport.error) {
      return (
        <LoadFailureView
          message={annualReport.error}
          onRetry={annualReport.retry}
          title="Jahresauswertung nicht verfügbar"
        />
      );
    }
    const visibleReport = annualReport.report ?? annualReport.coreReport;
    if (!ready || visibleReport === null)
      return (
        <View style={{ flex: 1, backgroundColor: palette.groupedBackground }}>
          <AnalysisYearHeader
            year={year}
            onPrevious={() => moveYear(-1)}
            onNext={() => moveYear(1)}
            onOpenMonth={() => changePeriod("MONTH")}
          />
          <LoadingView label="Jahresauswertung wird berechnet …" />
        </View>
      );
    return (
      <AnnualReportScreen
        report={visibleReport}
        pending={annualReport.report === null}
        testMonths={testMonths}
        onBackToMonth={() => changePeriod("MONTH")}
        onMoveYear={moveYear}
      />
    );
  }

  if (!ready || profile === null || monthlyData === null) return <LoadingView />;

  function moveMonth(delta: number) {
    const nextMonth = Temporal.PlainDate.from(`${month}-01`)
      .add({ months: delta })
      .toString()
      .slice(0, 7);
    activeMonthCoordinator.setMonth(nextMonth);
    setMonth(nextMonth);
    selectionFeedback();
  }

  function moveYear(delta: number) {
    const nextYear = year + delta;
    const nextMonth = `${nextYear}-${month.slice(5, 7)}`;
    activeMonthCoordinator.setMonth(nextMonth);
    setMonth(nextMonth);
    setYear(nextYear);
    selectionFeedback();
  }

  return (
    <View style={{ flex: 1, backgroundColor: palette.groupedBackground }}>
      <AnalysisMonthHeader
        label={formatMonthRangeLabel(month)}
        onOpenYear={() => changePeriod("YEAR")}
        onNext={() => moveMonth(1)}
        onPrevious={() => moveMonth(-1)}
      />
      <ReportScrollView>
        <Animated.View
          key={`month-analysis-${month}`}
          entering={FadeIn.duration(MOTION.duration.normal).reduceMotion(MOTION.reduceMotion)}
        >
          <ReportPeriodContent>
            {testMonths.includes(month) ? <ReportTestBadge /> : null}
            {checkPreferences.enabled === false ? (
              <AnalysisCoverageNote message={PLANNING_HIDDEN_NOTICE} />
            ) : null}
            {checkPreferences.error ? (
              <AnalysisCoverageNote message={checkPreferences.error} />
            ) : null}
            {checkPreferences.enabled === null && !checkPreferences.error ? (
              <AnalysisCoverageNote message="Prüfungseinstellungen werden geladen … Hinweise sind vorläufig vollständig sichtbar." />
            ) : null}

            <MonthOverview
              month={month}
              data={monthlyData}
              profile={profile}
              compliance={compliance}
              checkError={monthlyCompliance.error}
              showPlanning={checkPreferences.enabled !== false}
            />

            <AnalysisViewControls />
            <ReportFootnote>Unverbindliche Schätzung · keine Lohnabrechnung</ReportFootnote>
          </ReportPeriodContent>
        </Animated.View>
      </ReportScrollView>
    </View>
  );
}

export function AssessmentSummaryCard({
  compliance: sourceCompliance,
  showPlanning = true,
  shifts,
  expanded,
  onToggle,
}: {
  readonly compliance: MonthlyComplianceResult;
  readonly showPlanning?: boolean;
  readonly shifts: readonly ShiftEntry[];
  readonly expanded: boolean;
  readonly onToggle: () => void;
}) {
  const palette = usePalette();
  const compliance = selectVisibleCompliance(sourceCompliance, showPlanning);
  const messageCount = compliance.criticalCount + compliance.warningCount + compliance.infoCount;
  const clear = messageCount === 0;
  const accent = clear
    ? palette.success
    : compliance.criticalCount > 0
      ? palette.danger
      : compliance.warningCount > 0
        ? palette.warning
        : palette.primary;

  return (
    <ExpandableHighlightCard
      accent={accent}
      countBadge={messageCount}
      expanded={expanded}
      icon={clear ? "shield-checkmark-outline" : "warning-outline"}
      onToggle={onToggle}
      title="Prüfung"
      value={messageCount === 1 ? "Meldung" : "Meldungen"}
    >
      <ComplianceDetails
        compliance={sourceCompliance}
        showPlanning={showPlanning}
        embedded
        shifts={shifts}
      />
    </ExpandableHighlightCard>
  );
}
