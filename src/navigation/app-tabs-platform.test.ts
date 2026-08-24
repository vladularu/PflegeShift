import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const NAVIGATION_ROOT = join(process.cwd(), "src", "navigation");

describe("app tab platform shell", () => {
  it("uses the system-native tab bar on iOS and Android", () => {
    const nativeSource = readFileSync(join(NAVIGATION_ROOT, "app-tabs.native.tsx"), "utf8");

    expect(nativeSource).toContain('from "expo-router/unstable-native-tabs"');
    expect(nativeSource).toContain("requestCalendarTodayOnReselect");
    expect(nativeSource).toContain('minimizeBehavior="never"');
    expect(existsSync(join(NAVIGATION_ROOT, "app-tabs.ios.tsx"))).toBe(false);
    expect(existsSync(join(NAVIGATION_ROOT, "app-tabs.android.tsx"))).toBe(false);
  });

  it("keeps the JavaScript tab shell as the non-native fallback", () => {
    const fallbackSource = readFileSync(join(NAVIGATION_ROOT, "app-tabs.tsx"), "utf8");

    expect(fallbackSource).toContain('from "@/navigation/app-tabs-js"');
  });
});
