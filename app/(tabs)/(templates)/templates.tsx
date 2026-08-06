import { TemplatesManagerScreen } from "@/features/templates/templates-manager-screen";
import { AccessibleTabScreen } from "@/ui/accessible-tab-screen";

export default function TemplatesRoute() {
  return (
    <AccessibleTabScreen>
      <TemplatesManagerScreen />
    </AccessibleTabScreen>
  );
}
