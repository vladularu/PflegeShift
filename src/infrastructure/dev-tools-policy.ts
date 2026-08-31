import { devToolsRuntimeChannel } from "@/infrastructure/dev-tools-runtime-channel";

export type BuildEnvironment = "development" | "production" | "test" | string;

export function isDevToolsBuild(
  environment: BuildEnvironment | undefined,
  configuredChannel: string | null | undefined = devToolsRuntimeChannel,
): boolean {
  return environment === "development" || environment === "test" || configuredChannel === "preview";
}

export function assertDevToolsAvailable(
  environment: BuildEnvironment | undefined = process.env.NODE_ENV,
  configuredChannel: string | null | undefined = devToolsRuntimeChannel,
): void {
  if (!isDevToolsBuild(environment, configuredChannel)) {
    throw new Error(
      "Das Testlabor ist ausschließlich in Entwicklungs-Builds oder Preview-Builds verfügbar.",
    );
  }
}

export const DEV_TOOLS_AVAILABLE = isDevToolsBuild(process.env.NODE_ENV, devToolsRuntimeChannel);

export function shouldLoadDevToolState(
  available: boolean,
  ready: boolean,
  revision: number,
): boolean {
  return available && ready && revision > 0;
}
