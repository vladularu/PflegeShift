export function appRuntimeLabel(
  version: string | undefined,
  sdkVersion: string | undefined,
): string {
  const safeVersion =
    typeof version === "string" && /^\d+\.\d+\.\d+/.test(version) ? version : "unbekannt";
  const sdkMajor =
    typeof sdkVersion === "string" && /^\d+/.test(sdkVersion)
      ? sdkVersion.match(/^\d+/)?.[0]
      : "54";
  return `Version ${safeVersion} · Expo SDK ${sdkMajor}`;
}
