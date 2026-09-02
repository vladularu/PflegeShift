import type { ConfigContext, ExpoConfig } from "expo/config";

export default function configureApp({ config }: ConfigContext): ExpoConfig {
  const internal = process.env.APP_VARIANT === "internal";
  return {
    ...config,
    name: internal ? "LUNA Shift Internal" : "LUNA Shift",
    slug: config.slug ?? "pflegeshift",
    scheme: internal ? "pflegeshift-internal" : "pflegeshift",
    ios: {
      ...config.ios,
      bundleIdentifier: internal ? "com.pflegeshift.app.internal" : "com.pflegeshift.app",
    },
    android: {
      ...config.android,
      package: internal ? "com.pflegeshift.app.internal" : "com.pflegeshift.app",
    },
  };
}
