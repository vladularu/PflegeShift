import Constants from "expo-constants";

import { appRuntimeLabel } from "@/infrastructure/app-version-label";

export const APP_RUNTIME_LABEL = appRuntimeLabel(
  Constants.expoConfig?.version,
  Constants.expoConfig?.sdkVersion,
);
