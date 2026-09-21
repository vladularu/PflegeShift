import { router } from "expo-router";
import type { MonthlyComplianceResult, UserProfile } from "@/domain/types";
import { formatMinutes, formatSignedMinutes } from "@/engine/working-time";
import { classifyChecks, selectVisibleCompliance } from "./check-visibility";
import type { MonthlyAnalysisCalculation } from "./monthly-analysis";
import { complianceDetailsRoute, salaryRoute } from "@/navigation/routes";
import { AnalysisDashboard, CheckListCard, PayListCard, WorkListCard } from "./dashboard-cards";
import { ShiftAnalysisCard } from "./shift-analysis-card";

export function MonthOverview({
  month,
  data,
  profile,
  compliance,
  checkError,
  showPlanning,
}: {
  readonly month: string;
  readonly data: MonthlyAnalysisCalculation;
  readonly profile: UserProfile;
  readonly compliance: MonthlyComplianceResult | null;
  readonly checkError: string | null;
  readonly showPlanning: boolean;
}) {
  const { summary, pay, shiftTypeAnalysis } = data;
  const visible = compliance === null ? null : selectVisibleCompliance(compliance, showPlanning);
  const status =
    !data.complianceShifts.ok || checkError
      ? "Nicht verfügbar"
      : !visible
        ? "Wird geprüft …"
        : undefined;
  const salaryReady = profile.tariff !== null || profile.manualMonthlyGrossCents != null;
  const estimate = pay.ok && pay.value.available ? pay.value : null;
  return (
    <AnalysisDashboard
      cards={{
        WORK: (
          <WorkListCard
            actual={
              formatMinutes(
                summary.ok ? summary.value.actualMinutes : shiftTypeAnalysis.totalMinutes,
              ) + " h"
            }
            target={
              summary.ok ? formatMinutes(summary.value.targetMinutes) + " h" : "Nicht verfügbar"
            }
            balance={
              summary.ok
                ? formatSignedMinutes(summary.value.balanceMinutes) + " h"
                : "Nicht verfügbar"
            }
            caption={
              summary.ok
                ? undefined
                : "Erfasste Zeiten · Soll, Saldo und Abwesenheitsgutschriften benötigen einen gültigen Feiertagsstand."
            }
          />
        ),
        CHECK: (
          <CheckListCard
            counts={visible ?? { criticalCount: 0, warningCount: 0, infoCount: 0 }}
            categories={visible ? classifyChecks(visible.issues) : undefined}
            status={status}
            showPlanning={showPlanning}
            onPress={() => router.push(complianceDetailsRoute(month))}
            caption={
              !data.complianceShifts.ok
                ? "Die Arbeitszeitprüfung benötigt gültige Regelstände."
                : (checkError ?? undefined)
            }
          />
        ),
        PAY: (
          <PayListCard
            onPress={() => router.push(salaryRoute(month))}
            status={!salaryReady ? "Gehalt einrichten" : !estimate ? "Nicht verfügbar" : undefined}
            base={estimate?.personalBaseAmount}
            premiums={estimate?.timePremiumAmount}
            overtime={estimate?.overtimeAmount}
            allowances={
              estimate
                ? estimate.allowanceAmount +
                  estimate.tvoedAllowanceAmount +
                  estimate.careAllowanceAmount
                : undefined
            }
            gross={estimate?.estimatedGrossAmount}
            manual={profile.tariff === null}
            caption={
              !salaryReady
                ? "Tarif oder Monatsbrutto hinterlegen"
                : profile.tariff === null
                  ? "Manuell hinterlegtes Monatsbrutto"
                  : "Unverbindliche Brutto-Schätzung"
            }
          />
        ),
        SHIFTS: (
          <ShiftAnalysisCard
            analysis={shiftTypeAnalysis}
            caption={summary.ok ? undefined : "Stunden ohne Abwesenheitsgutschriften."}
          />
        ),
      }}
    />
  );
}
