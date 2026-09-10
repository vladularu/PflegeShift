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
import { formatMinutes, formatSignedMinutes } from "@/engine/working-time";
import { calculateMonthlyAnalysis } from "@/features/analysis/monthly-analysis";
import { AnnualReportRuleFailure } from "@/features/analysis/annual-report-failure";
import { AnalysisYearHeader } from "@/features/analysis/analysis-period-header";
import { AnalysisCoverageNote } from "@/features/analysis/analysis-coverage-note";
import {
  AnalysisMonthHeader,
  ExpandableHighlightCard,
  formatMonthRangeLabel,
  ReportCardTitle,
  SalarySummaryCard,
  ShiftTypeCountCard,
  ShiftTypeHoursCard,
  WorktimeCard,
} from "@/features/analysis/analysis-overview-cards";
import { AnnualReportScreen, type AnalysisPeriod } from "@/features/analysis/annual-report-view";
import { useAnnualReportInputs } from "@/features/analysis/use-annual-report-inputs";
import { useDeferredAnnualReport } from "@/features/analysis/use-annual-report";
import { useDeferredMonthlyCompliance } from "@/features/analysis/use-monthly-compliance";
import { useCheckPreferences } from "@/features/settings/check-preferences";
import { PLANNING_HIDDEN_NOTICE, selectVisibleCompliance } from "./check-visibility";
import { settingsEditorRoute, tariffAssessmentRoute } from "@/navigation/routes";
import { parseMonthRouteParam, type RouteParam } from "@/navigation/route-params";
import { useActiveMonthCoordinator } from "@/navigation/active-month";
import { usePalette } from "@/theme/palette";
import { MOTION } from "@/theme/motion";
import { CardSeparator, EmptyState, SurfaceCard } from "@/ui/design-system";
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
  const [expandedCard, setExpandedCard] = useState<AnalysisExpandedCard | null>(
    initialExpandedCard,
  );
  const parsedMonth = parseMonthRouteParam(params.month);
  const routeMonth = parsedMonth.status === "valid" ? parsedMonth.value : null;

  useEffect(() => {
    if (routeMonth !== null) {
      activeMonthCoordinator.setMonth(routeMonth);
      setMonth(routeMonth);
    }
  }, [activeMonthCoordinator, routeMonth]);

  useEffect(() => {
    setExpandedCard(initialExpandedCard);
  }, [initialExpandedCard]);

  useFocusEffect(
    useCallback(() => {
      const activeMonth = activeMonthCoordinator.getMonth();
      setMonth((current) => (current === activeMonth ? current : activeMonth));
      setYear((current) =>
        current === Number(activeMonth.slice(0, 4)) ? current : Number(activeMonth.slice(0, 4)),
      );
      return () => setExpandedCard(null);
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

  function selectAnnualMonth(nextMonth: string, nextExpandedCard?: "CHECK") {
    activeMonthCoordinator.setMonth(nextMonth);
    setMonth(nextMonth);
    if (nextExpandedCard) setExpandedCard(nextExpandedCard);
    setPeriod("MONTH");
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
        onSelectMonth={selectAnnualMonth}
      />
    );
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

  if (
    !ready ||
    profile === null ||
    monthlyData === null ||
    (monthlyData.complianceShifts.ok && compliance === null)
  ) {
    return <LoadingView />;
  }

  const { complianceShifts, pay, shiftTypeAnalysis, summary } = monthlyData;
  const actualMinutes = summary.ok ? summary.value.actualMinutes : shiftTypeAnalysis.totalMinutes;
  const balanceMinutes = summary.ok ? summary.value.balanceMinutes : null;

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

  function toggleExpandedCard(nextCard: AnalysisExpandedCard) {
    setExpandedCard((current) => (current === nextCard ? null : nextCard));
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

            {complianceShifts.ok && compliance !== null ? (
              <AssessmentSummaryCard
                showPlanning={checkPreferences.enabled !== false}
                compliance={compliance}
                expanded={expandedCard === "CHECK"}
                onToggle={() => toggleExpandedCard("CHECK")}
                shifts={complianceShifts.value}
              />
            ) : (
              <AnalysisCoverageNote message="Die Arbeitszeitprüfung benötigt gültige ArbZG- und Feiertagsstände. Erfasste Zeiten und Schichten bleiben sichtbar." />
            )}

            <SalarySummaryCard
              expanded={expandedCard === "PAY"}
              onOpenAllowance={() => router.push(tariffAssessmentRoute(month))}
              onSetup={() => router.push(settingsEditorRoute("TARIFF"))}
              onToggle={() => toggleExpandedCard("PAY")}
              pay={pay.ok ? pay.value : null}
              ruleFailure={pay.ok ? null : pay.failure}
              salaryReady={profile.tariff !== null || profile.manualMonthlyGrossCents != null}
            />

            <WorktimeCard
              actual={formatMinutes(actualMinutes)}
              balance={
                balanceMinutes === null ? "Nicht verfügbar" : formatSignedMinutes(balanceMinutes)
              }
              balanceAccent={
                balanceMinutes === null
                  ? palette.textMuted
                  : balanceMinutes < 0
                    ? palette.danger
                    : palette.success
              }
              target={summary.ok ? formatMinutes(summary.value.targetMinutes) : "Nicht verfügbar"}
            />

            {!summary.ok ? (
              <AnalysisCoverageNote message="Soll, Saldo und Abwesenheitsgutschriften benötigen einen gültigen Feiertagsstand. Angezeigt werden erfasste Arbeits- und Fortbildungszeiten." />
            ) : null}

            {shiftTypeAnalysis.totalCount === 0 ? (
              <SurfaceCard>
                <ReportCardTitle title="Schichten zählen" />
                <CardSeparator inset={0} />
                <EmptyState
                  message="Trage Dienste ein, um den Monat auszuwerten."
                  title="Noch keine Dienste"
                />
              </SurfaceCard>
            ) : (
              <>
                <ShiftTypeCountCard analysis={shiftTypeAnalysis} />
                {summary.ok || shiftTypeAnalysis.totalMinutes > 0 ? (
                  <ShiftTypeHoursCard analysis={shiftTypeAnalysis} />
                ) : null}
              </>
            )}

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
