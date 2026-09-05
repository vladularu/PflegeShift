import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

// This check generates ios/ and patches node_modules: use a disposable checkout.
const projectRoot = resolve(import.meta.dirname, "..");
assert.notEqual(process.platform, "win32", "The full iOS prebuild check requires Linux or macOS.");
assert.ok(!existsSync(resolve(projectRoot, "ios")), "Use a fresh checkout without generated ios/.");
const controllerPath = resolve(
  projectRoot,
  "node_modules/react-native-screens/ios/tabs/host/RNSTabBarController.mm",
);
assert.ok(
  !readFileSync(controllerPath, "utf8").includes("PFLEGESHIFT_NATIVE_TAB_TRANSITION_ANIMATOR"),
  "Use freshly installed dependencies so the before/after comparison exercises the patch.",
);

function run(args) {
  const result = spawnSync(process.execPath, args, {
    cwd: projectRoot,
    env: { ...process.env, APP_VARIANT: "internal", CI: "1" },
    encoding: "utf8",
    maxBuffer: 20 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  assert.equal(result.status, 0, result.stderr + result.stdout);
  return result.stdout;
}

function runtime() {
  return JSON.parse(
    run([
      resolve(projectRoot, "node_modules/expo-updates/bin/cli.js"),
      "runtimeversion:resolve",
      "--platform",
      "ios",
    ]),
  );
}

const before = runtime();
console.log("iOS runtime before prebuild:", before.runtimeVersion);
console.log(
  run([
    resolve(projectRoot, "node_modules/expo/bin/cli"),
    "prebuild",
    "--platform",
    "ios",
    "--no-install",
  ]),
);
assert.ok(
  readFileSync(controllerPath, "utf8").includes("PFLEGESHIFT_NATIVE_TAB_TRANSITION_ANIMATOR"),
);
const after = runtime();
console.log("iOS runtime after prebuild:", after.runtimeVersion);
assert.equal(
  after.runtimeVersion,
  before.runtimeVersion,
  "Native prebuild changed the iOS runtime.",
);
for (const filePath of ["fingerprint.config.js", "node_modules/react-native-screens"]) {
  assert.ok(
    after.fingerprintSources.some((source) => source.filePath === filePath && source.hash),
    `${filePath} must remain part of the fingerprint.`,
  );
}
assert.ok(
  after.fingerprintSources
    .filter((source) => source.filePath === "ios")
    .every((source) => source.hash === null),
  "Generated ios/ must not affect the managed project fingerprint.",
);
console.log("iOS fingerprint is stable across the full native prebuild.");
