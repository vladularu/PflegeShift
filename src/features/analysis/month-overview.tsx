import { router } from "expo-router";
import type { MonthlyComplianceResult } from "@/domain/types";
import { formatMinutes, formatSignedMinutes } from "@/engine/working-time";
import { classifyChecks, selectVisibleCompliance } from "./check-visibility";
import type { MonthlyAnalysisCalculation } from "./monthly-analysis";
import { complianceDetailsRoute } from "@/navigation/routes";
import { AnalysisDashboard, CheckListCard, WorkListCard } from "./dashboard-cards";
import { ShiftAnalysisCard } from "./shift-analysis-card";
import { MonthlyRemunerationCard } from "./monthly-remuneration-card";

export function MonthOverview({
  month,
  data,
  compliance,
  checkError,
  showPlanning,
}: {
  readonly month: string;
  readonly data: MonthlyAnalysisCalculation;
  readonly compliance: MonthlyComplianceResult | null;
  readonly checkError: string | null;
  readonly showPlanning: boolean;
}) {
  const { summary, shiftTypeAnalysis } = data;
  const visible = compliance === null ? null : selectVisibleCompliance(compliance, showPlanning);
  const status =
    !data.complianceShifts.ok || checkError
      ? "Nicht verfügbar"
      : !visible
        ? "Wird geprüft …"
        : undefined;
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
        PAY: <MonthlyRemunerationCard month={month} />,
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
