import { InsightsScreen } from "@/features/analysis/insights-screen";
import { AccessibleTabScreen } from "@/ui/accessible-tab-screen";

export default function AnalysisRoute() {
  return (
    <AccessibleTabScreen>
      <InsightsScreen />
    </AccessibleTabScreen>
  );
}
