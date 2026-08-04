import type { ConfigContext, ExpoConfig } from "expo/config";

export default function configureApp({ config }: ConfigContext): ExpoConfig {
  const internal = process.env.APP_VARIANT === "internal";
  return {
    ...config,
    name: internal ? "MediShift Internal" : "MediShift",
    slug: config.slug ?? "medishift",
    scheme: internal ? "medishift-internal" : "medishift",
    ios: {
      ...config.ios,
      bundleIdentifier: internal ? "com.medishift.app.internal" : "com.medishift.app",
    },
    android: {
      ...config.android,
      package: internal ? "com.medishift.app.internal" : "com.medishift.app",
    },
  };
}
