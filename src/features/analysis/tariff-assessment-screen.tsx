import { router, Stack, useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  usePflegeShiftEntries,
  usePflegeShiftProfile,
  usePflegeShiftStatus,
  usePflegeShiftTariff,
} from "@/application/pflegeshift-provider";
import { useRemunerationHistory } from "@/application/remuneration-provider";
import { useRuleCatalogRuntime } from "@/application/rule-catalog-runtime-provider";
import type {
  ShiftEntry,
  TvoedAssignment,
  TvoedWorkPatternSettings,
  TvoedWorkplaceCoverage,
} from "@/domain/types";
import { userFacingErrorMessage } from "@/domain/errors";
import { currentMonth, formatMonthTitle } from "@/engine/calendar";
import { deriveDatedAllowanceAssessments } from "@/engine/remuneration-assessment";
import { AnalysisCoverageNote } from "./analysis-coverage-note";
import { AnalysisDetailSummaryCard } from "./analysis-detail-layout";
import { captureRuleComputation, RuleComputationNotice } from "./rule-computation";
import { DatedAllowanceCard, datedAllowanceTitle } from "./dated-allowance-card";
import { TariffQuestion } from "./tariff-question";
import { resolveEditorSession } from "@/features/editor-session";
import { parseMonthRouteParam, type RouteParam } from "@/navigation/route-params";
import { usePalette } from "@/theme/palette";
import { FormStatus } from "@/ui/form-layout";
import { PrimaryButton, SecondaryButton } from "@/ui/form-controls";
import { AllowanceConfirmationScreen } from "./allowance-confirmation-screen";
import { LoadFailureView, LoadingView } from "@/ui/loading-view";
import { successFeedback } from "@/ui/haptics";
import { ReportFootnote, ReportScrollView } from "@/ui/report-layout";
import { SheetBackFooter } from "@/ui/sheet-back-footer";

export function TariffAssessmentScreen() {
  const palette = usePalette();
  return (
    <>
      <Stack.Screen
        options={{
          title: "Schichtzulage",
          headerStyle: { backgroundColor: palette.background },
          headerTintColor: palette.text,
          headerTitleStyle: { color: palette.text },
          statusBarStyle: palette.dark ? "light" : "dark",
        }}
      />
      <TariffAssessmentContent />
    </>
  );
}

function TariffAssessmentContent() {
  const [confirmationMonth, setConfirmationMonth] = useState<string | null>(null);
  const params = useLocalSearchParams<{ month?: RouteParam }>();
  const { error, ready, reload } = usePflegeShiftStatus();
  const { profile } = usePflegeShiftProfile();
  const { workPatternSettings } = usePflegeShiftTariff();
  const parsedMonth = parseMonthRouteParam(params.month);
  const month =
    parsedMonth.status === "valid" ? parsedMonth.value : currentMonth(profile?.timeZone);
  if (parsedMonth.status !== "valid") {
    return (
      <LoadFailureView
        actionLabel="Schließen"
        message="Der Link zur Tarifprüfung enthält keinen gültigen Monat."
        onRetry={() => router.back()}
        title="Tarifprüfung kann nicht geöffnet werden"
      />
    );
  }
  if (ready && error) {
    return <LoadFailureView message={error} onRetry={() => void reload()} />;
  }
  const session = resolveEditorSession(ready && profile !== null, month, () => workPatternSettings);
  if (session === null || profile === null) return <LoadingView />;
  if (confirmationMonth === month)
    return (
      <AllowanceConfirmationScreen
        key={month}
        month={month}
        onClose={() => setConfirmationMonth(null)}
      />
    );
  return (
    <TariffAssessmentForm
      key={session.key}
      initialSettings={session.initialValue}
      month={month}
      onConfirmRange={() => setConfirmationMonth(month)}
    />
  );
}

function TariffAssessmentForm({
  initialSettings,
  month,
  onConfirmRange,
}: {
  readonly initialSettings: TvoedWorkPatternSettings;
  readonly month: string;
  readonly onConfirmRange: () => void;
}) {
  const { resolver } = useRuleCatalogRuntime();
  const { entries } = usePflegeShiftEntries();
  const { profile } = usePflegeShiftProfile();
  const history = useRemunerationHistory();
  const { tariffDecisions, workPatternSettings, updateWorkPatternSettings } =
    usePflegeShiftTariff();
  const [coverage, setCoverage] = useState<TvoedWorkplaceCoverage>(
    initialSettings.workplaceCoverage,
  );
  const [assignment, setAssignment] = useState<TvoedAssignment>(initialSettings.assignment);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ruleRetryRevision, setRuleRetryRevision] = useState(0);
  const busy = useRef(false);
  const active = useRef(true);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  const draft =
    coverage !== workPatternSettings.workplaceCoverage ||
    assignment !== workPatternSettings.assignment;
  const calculation = useMemo(() => {
    void ruleRetryRevision;
    if (profile === null || history.status !== "ready") return null;
    return captureRuleComputation(() =>
      deriveDatedAllowanceAssessments({
        month,
        workProfile: profile,
        shifts: entries.filter(
          (entry): entry is ShiftEntry => entry.kind === "SHIFT" && entry.deletedAt === null,
        ),
        history: history.profiles,
        resolver,
        settings: {
          workplaceCoverage: coverage,
          assignment,
          updatedAt: draft ? null : workPatternSettings.updatedAt,
        },
        decisions: history.allowanceDecisions.find((item) => item.month === month)?.decisions,
        legacyDecision: tariffDecisions.find((item) => item.month === month) ?? null,
      }),
    );
  }, [
    profile,
    history.status,
    history.profiles,
    history.allowanceDecisions,
    entries,
    month,
    resolver,
    coverage,
    assignment,
    draft,
    workPatternSettings.updatedAt,
    tariffDecisions,
    ruleRetryRevision,
  ]);

  async function saveSettings() {
    if (busy.current) return;
    busy.current = true;
    setSaving(true);
    setError(null);
    try {
      await updateWorkPatternSettings({ workplaceCoverage: coverage, assignment });
      if (active.current) {
        successFeedback();
        router.back();
      }
    } catch (saveError) {
      if (active.current)
        setError(userFacingErrorMessage(saveError, "Angaben konnten nicht gespeichert werden."));
    } finally {
      busy.current = false;
      if (active.current) setSaving(false);
    }
  }
  if (history.status === "error")
    return (
      <LoadFailureView
        title="Zulagenerklärung nicht verfügbar"
        message={history.error ?? "Vergütungsdaten konnten nicht geladen werden."}
        onRetry={() => void history.reload().catch(() => undefined)}
      />
    );
  if (calculation === null || profile === null)
    return <LoadingView label="Vergütungsdaten werden geladen …" />;
  if (!calculation.ok)
    return (
      <ReportScrollView>
        <RuleComputationNotice
          failure={calculation}
          onRetry={() => setRuleRetryRevision((value) => value + 1)}
          title="Tarifprüfung nicht verfügbar"
        />
        <SecondaryButton onPress={onConfirmRange}>Zulage zeitbezogen bestätigen</SecondaryButton>
        <SheetBackFooter onPress={() => router.back()} />
      </ReportScrollView>
    );
  const result = calculation.value;
  const periods = result.periods;
  const hasAssessment = periods.some((period) => period.assessment !== null);
  return (
    <ReportScrollView>
      <AnalysisDetailSummaryCard
        period={formatMonthTitle(month)}
        title={
          !hasAssessment
            ? "Nicht verfügbar"
            : periods.length === 1
              ? datedAllowanceTitle(periods[0])
              : "Mehrere Vergütungszeiträume"
        }
        caption={
          draft
            ? "Vorschau · ungespeicherte Arbeitsplatzangaben. Das gespeicherte Gehalt bleibt bis zum Speichern unverändert."
            : "Datierte Vergütungsgrundlage und aktuelle gespeicherte Arbeitsplatzangaben · keine Anspruchsbestätigung."
        }
      />
      {periods.length > 0 &&
      periods.every((period) => period.issue?.code === "RULE_PACKAGE_NOT_FOUND") ? (
        <AnalysisCoverageNote message="Die Tarifprüfung ist für diesen Monat ohne gültigen Tarifstand deaktiviert." />
      ) : null}
      {periods.map((period) => (
        <DatedAllowanceCard
          key={`${period.from}:${period.through}:${period.source.versionId}`}
          period={period}
          month={month}
          entries={entries}
          timeZone={profile.timeZone}
          multiple={periods.length > 1}
        />
      ))}
      {hasAssessment ? (
        <>
          <TariffQuestion
            title="Wird dein Arbeitsbereich rund um die Uhr betrieben?"
            caption="Zum Beispiel Station, Intensivbereich oder Notaufnahme mit 24/7-Besetzung."
            options={[
              { value: "AROUND_THE_CLOCK", label: "Ja" },
              { value: "NOT_AROUND_THE_CLOCK", label: "Nein" },
              { value: "UNKNOWN", label: "Unsicher" },
            ]}
            value={coverage}
            onChange={(value) => {
              if (!busy.current) setCoverage(value as TvoedWorkplaceCoverage);
            }}
          />
          <TariffQuestion
            title="Gehört das Schichtmodell dauerhaft zu deiner Stelle?"
            caption="Nicht nur einzelne Vertretungen oder gelegentliche Zusatzdienste."
            options={[
              { value: "PERMANENT", label: "Dauerhaft" },
              { value: "TEMPORARY", label: "Gelegentlich" },
              { value: "UNKNOWN", label: "Unsicher" },
            ]}
            value={assignment}
            onChange={(value) => {
              if (!busy.current) setAssignment(value as TvoedAssignment);
            }}
          />
          {draft ? (
            <AnalysisCoverageNote message="Die Vorschau verändert keine gespeicherten Zulagenbestätigungen." />
          ) : null}
          <FormStatus error={error} />
          <PrimaryButton
            busy={saving}
            busyLabel="Angaben werden gespeichert"
            onPress={() => void saveSettings()}
          >
            Angaben speichern
          </PrimaryButton>
        </>
      ) : null}
      <SecondaryButton disabled={saving} onPress={onConfirmRange}>
        Zulage zeitbezogen bestätigen
      </SecondaryButton>
      <ReportFootnote>
        Automatische Plausibilitätsprüfung · keine Rechts- oder Lohnberatung
      </ReportFootnote>
      <SheetBackFooter disabled={saving} onPress={() => router.back()} />
    </ReportScrollView>
  );
}
