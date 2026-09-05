const {
  applyNativeTabTransitionPatch,
  assertSupportedVersion,
} = require("./plugins/with-native-tab-transitions");

// Each Expo stream owns a source object; keep concurrent streams independent.
const pendingChunks = new WeakMap();
const tabControllerPath = "node_modules/react-native-screens/ios/tabs/host/RNSTabBarController.mm";

/** @type {import('expo/fingerprint').Config} */
module.exports = {
  // The transform itself must participate in compatibility decisions too.
  extraSources: [
    { type: "file", filePath: "fingerprint.config.js", reasons: ["fingerprintConfig"] },
  ],
  fileHookTransform(source, chunk, isEndOfFile, encoding) {
    if (source.type !== "file" || source.filePath.replaceAll("\\", "/") !== tabControllerPath) {
      return chunk;
    }

    const chunks = pendingChunks.get(source) ?? [];
    if (chunk !== null) {
      chunks.push(typeof chunk === "string" ? Buffer.from(chunk, encoding) : chunk);
    }
    if (!isEndOfFile) {
      pendingChunks.set(source, chunks);
      return null;
    }
    pendingChunks.delete(source);

    assertSupportedVersion(require("react-native-screens/package.json").version);
    // Prebuild applies this exact idempotent patch. Hash its result both before
    // and after prebuild, without changing installed files or hiding native code.
    return applyNativeTabTransitionPatch(Buffer.concat(chunks).toString("utf8"));
  },
};
