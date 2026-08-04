import { Redirect } from "expo-router";

import { DevToolsScreen } from "@/features/dev-tools/dev-tools-screen";
import { DEV_TOOLS_AVAILABLE } from "@/infrastructure/dev-tools-policy";

export default function DevToolsRoute() {
  if (!DEV_TOOLS_AVAILABLE) return <Redirect href="/" />;
  return <DevToolsScreen />;
}
