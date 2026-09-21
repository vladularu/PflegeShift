import { formatMonthTitle } from "@/engine/calendar";
import type { AnnualReport } from "./annual-report";
import { AnalysisListCard, AnalysisValueRow } from "./analysis-list-card";
import { formatEuro } from "./salary-summary-card";
import { ReportPeriodContent, ReportScrollView } from "@/ui/report-layout";

export function AnnualPremiumReport({
  report,
  pending,
  onSelectMonth,
}: {
  readonly report: AnnualReport;
  readonly pending: boolean;
  readonly onSelectMonth: (month: string) => void;
}) {
  const available =
    !pending && report.salarySource === "TARIFF" && report.availablePayMonthCount > 0;
  const months = report.months.filter((month) => month.timePremiumAmount != null);
  return (
    <ReportScrollView>
      <ReportPeriodContent>
        <AnalysisListCard
          title={"Zeitzuschläge " + report.year}
          caption={available ? months.length + " von 12 Monaten · Brutto-Schätzung" : undefined}
        >
          <AnalysisValueRow
            first
            total
            label={available ? "Gesamt" : "Status"}
            value={
              pending
                ? "Wird berechnet …"
                : report.salarySource === "MANUAL" || report.salarySource === "UNSET"
                  ? "Keine tarifliche Berechnung"
                  : available
                    ? formatEuro(report.premiumAmount)
                    : "Nicht verfügbar"
            }
          />
        </AnalysisListCard>
        {available ? (
          <AnalysisListCard
            title="Nach Monaten"
            caption={
              report.premiumAmount === 0
                ? "Für die berechneten Monate fallen keine Zeitzuschläge an."
                : undefined
            }
          >
            {report.months.map((month, index) => (
              <AnalysisValueRow
                key={month.month}
                first={index === 0}
                label={formatMonthTitle(month.month)}
                value={
                  month.timePremiumAmount == null
                    ? "Nicht verfügbar"
                    : formatEuro(month.timePremiumAmount)
                }
                onPress={
                  month.timePremiumAmount == null ? undefined : () => onSelectMonth(month.month)
                }
              />
            ))}
          </AnalysisListCard>
        ) : null}
      </ReportPeriodContent>
    </ReportScrollView>
  );
}
