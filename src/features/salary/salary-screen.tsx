import { Ionicons } from "@expo/vector-icons";
import { Temporal } from "@js-temporal/polyfill";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Text, View } from "react-native";
import { usePflegeShiftTestData } from "@/application/pflegeshift-provider";
import { formatMonthTitle } from "@/engine/calendar";
import { useMonthlyRemuneration } from "@/features/analysis/use-monthly-remuneration";
import { RuleComputationNotice } from "@/features/analysis/rule-computation";
import {
  premiumDetailsRoute,
  settingsEditorRoute,
  tariffAssessmentRoute,
  overtimeAllocationRoute,
  tvlShiftWorkRoute,
  sueMonthRoute,
  annexAMonthRoute,
  caritasMonthFactsRoute,
  annexAPremiumFactsRoute,
  paidAbsenceRoute,
  annualPaymentRoute,
} from "@/navigation/routes";
import { parseMonthRouteParam, type RouteParam } from "@/navigation/route-params";
import { useActiveMonthCoordinator } from "@/navigation/active-month";
import { usePalette } from "@/theme/palette";
import { TEXT_MAX_SCALE, TYPOGRAPHY } from "@/theme/typography";
import { SPACING } from "@/theme/tokens";
import { SurfaceCard } from "@/ui/design-system";
import { PrimaryButton, SecondaryButton } from "@/ui/form-controls";
import { LoadFailureView, LoadingView } from "@/ui/loading-view";
import { MonthNavigator } from "@/ui/month-navigator";
import { selectionFeedback } from "@/ui/haptics";
import {
  ReportFootnote,
  ReportPeriodContent,
  ReportScrollView,
  ReportTestBadge,
} from "@/ui/report-layout";
import { RemunerationComponentCard, RemunerationText } from "./remuneration-positions";
import { remunerationEuro, remunerationIssues } from "./remuneration-presentation";

export function SalaryScreen() {
  const palette = usePalette();
  const coordinator = useActiveMonthCoordinator();
  const params = useLocalSearchParams<{ month?: RouteParam }>();
  const { testMonths } = usePflegeShiftTestData();
  const [month, setMonth] = useState(() => coordinator.getMonth());
  const [additionalMonth, setAdditionalMonth] = useState<string | null>(null);
  const parsedMonth = parseMonthRouteParam(params.month);
  const routeMonth = parsedMonth.status === "valid" ? parsedMonth.value : null;
  useEffect(() => {
    if (routeMonth !== null) {
      coordinator.setMonth(routeMonth);
      setMonth(routeMonth);
    }
  }, [coordinator, routeMonth]);
  useFocusEffect(
    useCallback(() => {
      setMonth(coordinator.getMonth());
    }, [coordinator]),
  );
  const { calculation, error, reload } = useMonthlyRemuneration(
    month,
    parsedMonth.status !== "invalid",
  );
  function moveMonth(delta: number) {
    const next = Temporal.PlainDate.from(`${month}-01`)
      .add({ months: delta })
      .toString()
      .slice(0, 7);
    coordinator.setMonth(next);
    setMonth(next);
    selectionFeedback();
  }
  if (parsedMonth.status === "invalid")
    return (
      <LoadFailureView
        title="Gehalt kann nicht geöffnet werden"
        message="Der Link zur Gehaltsauswertung enthält keinen gültigen Monat."
        actionLabel="Schließen"
        onRetry={() => router.back()}
      />
    );
  if (error) return <LoadFailureView message={error} onRetry={() => void reload()} />;
  if (calculation === null) return <LoadingView />;
  const needsSetup =
    calculation.ok &&
    calculation.value.base.positions.length > 0 &&
    calculation.value.base.positions.every((position) =>
      ["PROFILE_MISSING", "REMUNERATION_UNCONFIGURED", "EFFECTIVE_DATE_UNKNOWN"].includes(
        position.issue?.code ?? "",
      ),
    );
  return (
    <ReportScrollView>
      <MonthNavigator
        label={formatMonthTitle(month)}
        onNext={() => moveMonth(1)}
        onPrevious={() => moveMonth(-1)}
      />
      <ReportPeriodContent>
        {testMonths.includes(month) ? <ReportTestBadge /> : null}
        {!calculation.ok ? (
          <RuleComputationNotice
            failure={calculation}
            onRetry={() => void reload()}
            title="Gehalt nicht verfügbar"
          />
        ) : needsSetup ? (
          <SurfaceCard style={{ padding: SPACING.xl, gap: SPACING.md }}>
            <RemunerationText>Dein Gehalt</RemunerationText>
            <RemunerationText muted>
              Prüfe und bestätige deine Gehaltsangaben einmal. Ein anderer Beginn ist optional.
            </RemunerationText>
            <PrimaryButton onPress={() => router.push(settingsEditorRoute("TARIFF"))}>
              Angaben bestätigen
            </PrimaryButton>
          </SurfaceCard>
        ) : (
          <View key={month} style={{ gap: SPACING.lg }}>
            <SurfaceCard
              style={{
                gap: SPACING.md,
                padding: SPACING.xl,
              }}
            >
              <View style={{ gap: SPACING.sm }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: SPACING.sm }}>
                  <Ionicons
                    accessibilityElementsHidden
                    color={palette.textMuted}
                    name="wallet-outline"
                    size={18}
                  />
                  <Text
                    maxFontSizeMultiplier={TEXT_MAX_SCALE}
                    selectable
                    style={{ color: palette.textMuted, ...TYPOGRAPHY.overline }}
                  >
                    {calculation.value.complete ? "BRUTTO-SCHÄTZUNG" : "BERECHNUNG UNVOLLSTÄNDIG"}
                  </Text>
                </View>
                <Text
                  selectable
                  maxFontSizeMultiplier={TEXT_MAX_SCALE}
                  style={{
                    color: palette.text,
                    ...TYPOGRAPHY.hero,
                    fontVariant: ["tabular-nums"],
                  }}
                >
                  {calculation.value.complete
                    ? remunerationEuro(calculation.value.estimatedGrossCents)
                    : calculation.value.knownSubtotalCents > 0
                      ? remunerationEuro(calculation.value.knownSubtotalCents)
                      : "Angaben fehlen"}
                </Text>
              </View>
              {!calculation.value.complete ? (
                <RemunerationText>
                  Bekannter Teilbetrag: {remunerationEuro(calculation.value.knownSubtotalCents)} ·
                  kein Gesamtbrutto
                </RemunerationText>
              ) : null}
            </SurfaceCard>
            {remunerationIssues(calculation.value).length > 0 ? (
              <SurfaceCard style={{ padding: SPACING.lg, gap: SPACING.sm }}>
                <RemunerationText>Offene Angaben & Regeln</RemunerationText>
                {remunerationIssues(calculation.value).map((issue) => (
                  <RemunerationText key={issue} muted>
                    {issue}
                  </RemunerationText>
                ))}
              </SurfaceCard>
            ) : null}
            <RemunerationText>Zusammensetzung</RemunerationText>
            <RemunerationComponentCard title="Grundentgelt" component={calculation.value.base} />
            {calculation.value.base.positions.some(
              (position) => position.basis.hourly !== undefined,
            ) ? (
              <SecondaryButton onPress={() => router.push(paidAbsenceRoute(month))}>
                Bezahlte Abwesenheitsstunden bestätigen
              </SecondaryButton>
            ) : null}
            <RemunerationComponentCard
              title="Zeitzuschläge"
              component={calculation.value.timePremiums}
              onPress={() => router.push(premiumDetailsRoute(month))}
            />
            <RemunerationComponentCard title="Zulagen" component={calculation.value.allowances} />
            {calculation.value.base.positions.length === 1 &&
            calculation.value.base.positions[0].source.requestedPackageId?.startsWith(
              "avr-caritas-p-",
            ) ? (
              <SecondaryButton onPress={() => router.push(caritasMonthFactsRoute(month))}>
                Caritas-Monatsangaben (Entwurf) bestätigen
              </SecondaryButton>
            ) : null}
            {calculation.value.base.positions.length === 1 &&
            calculation.value.base.positions[0].source.packageId === "tvoed-vka-sue-bt-b" ? (
              <SecondaryButton onPress={() => router.push(sueMonthRoute(month))}>
                SuE-Monatsangaben (Entwurf) bestätigen
              </SecondaryButton>
            ) : null}
            {calculation.value.base.positions.length === 1 &&
            calculation.value.base.positions[0].source.packageId === "tvoed-vka-anlage-a" ? (
              <>
                <SecondaryButton onPress={() => router.push(annexAMonthRoute(month))}>
                  TVöD-Anlage-A-Monatsangaben (Entwurf) bestätigen
                </SecondaryButton>
                <SecondaryButton onPress={() => router.push(annexAPremiumFactsRoute(month))}>
                  TVöD-Anlage-A-Zuschlagsangaben (Entwurf) bestätigen
                </SecondaryButton>
              </>
            ) : null}
            {calculation.value.base.positions.some((p) =>
              ["tvl-kr-tdl", "tval-pflege-tdl"].includes(p.source.requestedPackageId ?? ""),
            ) ? (
              <SecondaryButton onPress={() => router.push(tvlShiftWorkRoute(month))}>
                {calculation.value.base.positions.some(
                  (p) => p.source.requestedPackageId === "tval-pflege-tdl",
                )
                  ? "TVA-L-Dienstangaben bestätigen"
                  : "TV-L-Dienstangaben bestätigen"}
              </SecondaryButton>
            ) : null}
            <RemunerationComponentCard title="Überstunden" component={calculation.value.overtime} />
            {calculation.value.annualPayments.positions.length > 0 ? (
              <RemunerationComponentCard
                title="Jahressonderzahlung"
                component={calculation.value.annualPayments}
              />
            ) : null}
            <SecondaryButton onPress={() => router.push(settingsEditorRoute("TARIFF"))}>
              Gehaltsangaben
            </SecondaryButton>
            <SecondaryButton
              onPress={() => setAdditionalMonth((current) => (current === month ? null : month))}
            >
              {additionalMonth === month ? "Zusatzangaben schließen" : "Zusatzangaben"}
            </SecondaryButton>
            {additionalMonth === month ? (
              <View style={{ gap: SPACING.md }}>
                <SecondaryButton onPress={() => router.push(overtimeAllocationRoute(month))}>
                  Überstunden den Tagen zuordnen
                </SecondaryButton>
                <SecondaryButton onPress={() => router.push(annualPaymentRoute(month))}>
                  Jahressonderzahlungen bearbeiten
                </SecondaryButton>
                <SecondaryButton onPress={() => router.push(tariffAssessmentRoute(month))}>
                  Schichtzulage prüfen & bestätigen
                </SecondaryButton>
              </View>
            ) : null}
            <ReportFootnote>
              Unverbindliche Brutto-Schätzung aus den für den Zeitraum gespeicherten Angaben.
              Fehlende Bestandteile sind nicht mit null Euro angesetzt. Keine Lohnabrechnung.
            </ReportFootnote>
          </View>
        )}
      </ReportPeriodContent>
    </ReportScrollView>
  );
}
