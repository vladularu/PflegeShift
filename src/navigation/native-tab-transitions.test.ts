import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const plugin = require("../../plugins/with-native-tab-transitions") as {
  applyNativeTabTransitionPatch: (source: string) => string;
  assertSupportedVersion: (version: string) => void;
  markers: { animator: string; delegate: string };
};

const reactNativeScreensRoot = join(process.cwd(), "node_modules", "react-native-screens");
const appConfig = JSON.parse(readFileSync(join(process.cwd(), "app.json"), "utf8")) as {
  expo: { plugins: string[] };
};
const nativeControllerSource = readFileSync(
  join(reactNativeScreensRoot, "ios", "tabs", "host", "RNSTabBarController.mm"),
  "utf8",
);

describe("native iOS tab transitions", () => {
  it("registers the native transition patch in the Expo prebuild", () => {
    expect(appConfig.expo.plugins).toContain("./plugins/with-native-tab-transitions");
  });

  it("patches the SDK 57 native tab controller with the reference push contract", () => {
    const patched = plugin.applyNativeTabTransitionPatch(nativeControllerSource);

    expect(patched).toContain(plugin.markers.animator);
    expect(patched).toContain(plugin.markers.delegate);
    expect(patched).toContain("kPflegeShiftTabTransitionDuration = 0.40");
    expect(patched).toContain("kPflegeShiftTabTransitionParallax = 0.30");
    expect(patched).toContain("CGPointMake(0.22, 1.0)");
    expect(patched).toContain("CGPointMake(0.36, 1.0)");
    expect(patched).toContain("toIndex > fromIndex");
    expect(patched).not.toContain("toView.alpha");
  });

  it("disables the horizontal scene transition for reduced motion", () => {
    const patched = plugin.applyNativeTabTransitionPatch(nativeControllerSource);

    expect(patched).toContain("UIAccessibilityIsReduceMotionEnabled()");
    expect(patched).toContain("return nil;");
  });

  it("is idempotent across repeated prebuilds", () => {
    const once = plugin.applyNativeTabTransitionPatch(nativeControllerSource);
    const twice = plugin.applyNativeTabTransitionPatch(once);

    expect(twice).toBe(once);
    expect(twice.match(new RegExp(plugin.markers.animator, "g"))).toHaveLength(1);
    expect(twice.match(new RegExp(plugin.markers.delegate, "g"))).toHaveLength(1);
  });

  it("guards the react-native-screens source contract", () => {
    expect(() => plugin.assertSupportedVersion("4.26.2")).not.toThrow();
    expect(() => plugin.assertSupportedVersion("4.27.0")).toThrow(/unsupported/);
    expect(() => plugin.applyNativeTabTransitionPatch("changed upstream source")).toThrow(
      /anchors changed/,
    );
  });
});
