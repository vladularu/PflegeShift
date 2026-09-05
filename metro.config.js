// Fail closed even when dependency lifecycle scripts were skipped.
require("./scripts/image-size-guard.cjs").guardImageSize(__dirname, { check: true });

const { getDefaultConfig } = require("expo/metro-config");

/** @type {import("expo/metro-config").MetroConfig} */
const config = getDefaultConfig(__dirname);

// expo-sqlite uses a WebAssembly worker in the browser.
if (!config.resolver.assetExts.includes("wasm")) {
  config.resolver.assetExts.push("wasm");
}
config.resolver.unstable_enablePackageExports = false;

module.exports = config;
