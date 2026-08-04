import { AnalysisScreen } from "@/features/analysis/analysis-screen";
import { AccessibleTabScreen } from "@/ui/accessible-tab-screen";

export default function AnalysisRoute() {
  return (
    <AccessibleTabScreen>
      <AnalysisScreen />
    </AccessibleTabScreen>
  );
}
