import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { getConfig } = require("expo/config");

export function validateIosRuntimePolicy(config, label) {
  // Expo gives a platform-specific runtime precedence over the root policy.
  const runtime =
    config.ios?.runtimeVersion === undefined ? config.runtimeVersion : config.ios.runtimeVersion;
  return runtime?.policy === "fingerprint"
    ? []
    : [`${label}: Die effektive iOS-Runtime muss die Fingerprint-Policy verwenden.`];
}

export function validateResolvedIosRuntimePolicies(projectRoot) {
  const previousVariant = process.env.APP_VARIANT;
  try {
    return ["internal", "production"].flatMap((variant) => {
      process.env.APP_VARIANT = variant;
      const { exp } = getConfig(projectRoot, { skipPlugins: true });
      return validateIosRuntimePolicy(exp, `APP_VARIANT=${variant}`);
    });
  } finally {
    if (previousVariant === undefined) delete process.env.APP_VARIANT;
    else process.env.APP_VARIANT = previousVariant;
  }
}
