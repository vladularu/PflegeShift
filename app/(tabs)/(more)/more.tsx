import { SettingsScreen } from "@/features/settings/settings-screen";
import { AccessibleTabScreen } from "@/ui/accessible-tab-screen";

export default function MoreRoute() {
  return <AccessibleTabScreen><SettingsScreen /></AccessibleTabScreen>;
}
