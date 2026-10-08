import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";
import calendarDayIcons from "./calendar-tab-icons.json";

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
  it("bundles 31 distinct transparent high-resolution PNGs for every calendar day", () => {
    expect(calendarDayIcons).toHaveLength(31);
    expect(new Set(calendarDayIcons).size).toBe(31);
    for (const image of calendarDayIcons) {
      const png = Buffer.from(image, "base64");
      expect([...png.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
      expect(png.readUInt32BE(16)).toBe(84);
      expect(png.readUInt32BE(20)).toBe(84);
      expect(png[25]).toBe(6); // RGBA, including transparency for native template tint.
    }
  });
});
