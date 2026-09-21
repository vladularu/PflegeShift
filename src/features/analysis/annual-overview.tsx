import { router } from "expo-router";
import { formatMinutes, formatSignedMinutes } from "@/engine/working-time";
import { annualDetailsRoute } from "@/navigation/routes";
import type { AnnualReport } from "./annual-report";
import { useCheckPreferences } from "@/features/settings/check-preferences";
import { addCheckCounts, type CheckCounts } from "./check-visibility";
import { AnalysisDashboard, CheckListCard, PayListCard, WorkListCard } from "./dashboard-cards";
import { ShiftAnalysisCard } from "./shift-analysis-card";
import { AnalysisListCard, AnalysisValueRow } from "./analysis-list-card";

export function AnnualOverview({
  report,
  pending,
}: {
  readonly report: AnnualReport;
  readonly pending: boolean;
}) {
  const checkPreferences = useCheckPreferences();
  const empty: CheckCounts = { criticalCount: 0, warningCount: 0, infoCount: 0 };
  const categories =
    report.months.length > 0 && report.months.every((m) => m.checkCounts)
      ? report.months.reduce(
          (sum, m) => ({
            legal: addCheckCounts(sum.legal, m.checkCounts!.legal),
            planning: addCheckCounts(sum.planning, m.checkCounts!.planning),
          }),
          { legal: empty, planning: empty },
        )
      : undefined;
  const checkStatus = pending
    ? "Wird geprüft …"
    : !report.complianceCoverageComplete
      ? "Nicht verfügbar"
      : undefined;
  const payReady = !pending && report.availablePayMonthCount > 0;
  const tariff = report.salarySource === "TARIFF";
  const base = tariff
    ? Math.round(
        (report.estimatedGrossAmount -
          report.premiumAmount -
          report.overtimeAmount -
          report.allowanceAmount) *
          100,
      ) / 100
    : undefined;
  return (
    <AnalysisDashboard
      cards={{
        WORK: (
          <WorkListCard
            actual={formatMinutes(report.actualMinutes) + " h"}
            target={
              pending
                ? "Wird berechnet"
                : report.targetMinutes === null
                  ? "Nicht verfügbar"
                  : formatMinutes(report.targetMinutes) + " h"
            }
            balance={
              pending
                ? "Wird berechnet"
                : report.balanceMinutes === null
                  ? "Nicht verfügbar"
                  : formatSignedMinutes(report.balanceMinutes) + " h"
            }
            caption={
              pending || !report.worktimeCoverageComplete
                ? "Erfasste Zeiten · Soll und Saldo benötigen vollständige Regelstände."
                : undefined
            }
          />
        ),
        CHECK: (
          <CheckListCard
            counts={{
              criticalCount: report.criticalCount,
              warningCount: report.warningCount,
              infoCount: report.infoCount ?? 0,
            }}
            categories={categories}
            showPlanning={checkPreferences.enabled !== false}
            status={checkStatus}
            onPress={() => router.push(annualDetailsRoute(report.year, "CHECK"))}
            caption={
              !pending && !report.complianceCoverageComplete
                ? "Die Jahresprüfung benötigt vollständige Regelstände."
                : undefined
            }
          />
        ),
        PAY: (
          <PayListCard
            onPress={() => router.push(annualDetailsRoute(report.year, "PAY"))}
            status={pending ? "Wird berechnet …" : !payReady ? "Nicht verfügbar" : undefined}
            base={base}
            premiums={tariff ? report.premiumAmount : undefined}
            overtime={tariff ? report.overtimeAmount : undefined}
            allowances={tariff ? report.allowanceAmount : undefined}
            gross={report.estimatedGrossAmount}
            manual={report.salarySource === "MANUAL"}
            caption={
              payReady
                ? "Brutto-Schätzung · " + report.availablePayMonthCount + " von 12 Monaten"
                : "Keine unterstützte Monatsschätzung verfügbar"
            }
          />
        ),
        SHIFTS: report.shiftTypeAnalysis ? (
          <ShiftAnalysisCard
            analysis={report.shiftTypeAnalysis}
            caption={
              pending || !report.worktimeCoverageComplete
                ? "Stunden ohne Abwesenheitsgutschriften."
                : undefined
            }
          />
        ) : (
          <AnalysisListCard title="Schichten">
            <AnalysisValueRow
              first
              label="Auswertung"
              value={pending ? "Wird berechnet …" : "Nicht verfügbar"}
            />
          </AnalysisListCard>
        ),
      }}
    />
  );
}
