export type BuildEnvironment = "development" | "production" | "test" | string;

export function isDevToolsBuild(
  environment: BuildEnvironment | undefined,
  explicitInternalFlag: string | undefined,
): boolean {
  return environment === "development" || environment === "test" || explicitInternalFlag === "1";
}

export function assertDevToolsAvailable(
  environment: BuildEnvironment | undefined = process.env.NODE_ENV,
  explicitInternalFlag: string | undefined = process.env.EXPO_PUBLIC_ENABLE_DEV_TOOLS,
): void {
  if (!isDevToolsBuild(environment, explicitInternalFlag)) {
    throw new Error("Das Testlabor ist ausschließlich in Entwicklungs-Builds verfügbar.");
  }
}

export const DEV_TOOLS_AVAILABLE = isDevToolsBuild(
  process.env.NODE_ENV,
  process.env.EXPO_PUBLIC_ENABLE_DEV_TOOLS,
);

export function shouldLoadDevToolState(
  available: boolean,
  ready: boolean,
  revision: number,
): boolean {
  return available && ready && revision > 0;
}
