import { View } from "react-native";

import { AnalysisYearHeader } from "@/features/analysis/analysis-overview-cards";
import {
  RuleComputationNotice,
  type RuleComputationFailure,
} from "@/features/analysis/rule-computation";
import { usePalette } from "@/theme/palette";
import { ReportPeriodContent, ReportScrollView } from "@/ui/report-layout";

export function AnnualReportRuleFailure({
  failure,
  onBackToMonth,
  onMoveYear,
  onRetry,
  year,
}: {
  readonly failure: RuleComputationFailure;
  readonly onBackToMonth: () => void;
  readonly onMoveYear: (delta: number) => void;
  readonly onRetry: () => void;
  readonly year: number;
}) {
  const palette = usePalette();
  return (
    <View style={{ flex: 1, backgroundColor: palette.groupedBackground }}>
      <AnalysisYearHeader
        activeMonthCount={0}
        onNext={() => onMoveYear(1)}
        onOpenMonth={onBackToMonth}
        onPrevious={() => onMoveYear(-1)}
        year={year}
      />
      <ReportScrollView>
        <ReportPeriodContent>
          <RuleComputationNotice
            failure={failure}
            onRetry={onRetry}
            title="Jahresauswertung nicht verfügbar"
          />
        </ReportPeriodContent>
      </ReportScrollView>
    </View>
  );
}
