import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

import { describe, expect, it } from "vitest";

import { COMPACT_TEXT_MAX_SCALE, TEXT_MAX_SCALE } from "@/theme/typography";

const COMPACT_SCALE_ALLOWLIST = new Set([
  "features/calendar/calendar-view-screen.tsx",
  "features/calendar/month-card.tsx",
  "features/calendar/year-overview.tsx",
  "ui/shift-symbol.tsx",
]);

const TEXT_SHRINK_ALLOWLIST = new Set(["features/calendar/month-card.tsx", "ui/shift-symbol.tsx"]);

const SINGLE_LINE_ALLOWLIST = new Set([
  "features/calendar/month-card.tsx",
  "features/calendar/shift-selection-panel.tsx",
  "ui/shift-symbol.tsx",
]);

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return entry.name.endsWith(".tsx") ? [path] : [];
  });
}

describe("font scaling policy", () => {
  it("leaves semantic text unlimited and permits 200% for compact glyphs", () => {
    expect(TEXT_MAX_SCALE).toBe(0);
    expect(COMPACT_TEXT_MAX_SCALE).toBeGreaterThanOrEqual(2);
  });

  it("does not introduce restrictive literal font caps", () => {
    const root = join(process.cwd(), "src");
    for (const file of sourceFiles(root)) {
      const source = readFileSync(file, "utf8");
      const caps = source.matchAll(/maxFontSizeMultiplier=\{([\d.]+)\}/g);
      for (const match of caps) {
        const value = Number(match[1]);
        expect(value === 0 || value >= 2, relative(root, file)).toBe(true);
      }
    }
  });

  it("limits compact scaling to redundant visual glyphs", () => {
    const root = join(process.cwd(), "src");
    const users = sourceFiles(root)
      .filter((file) => readFileSync(file, "utf8").includes("COMPACT_TEXT_MAX_SCALE"))
      .map((file) => relative(root, file).replaceAll("\\", "/"));

    expect(new Set(users)).toEqual(COMPACT_SCALE_ALLOWLIST);
  });

  it("limits shrinking and single-line text to compact visual contexts", () => {
    const root = join(process.cwd(), "src");
    const files = sourceFiles(root);
    const shrinkingUsers = files
      .filter((file) => readFileSync(file, "utf8").includes("adjustsFontSizeToFit"))
      .map((file) => relative(root, file).replaceAll("\\", "/"));
    const singleLineUsers = files
      .filter((file) => /numberOfLines=\{1\}/.test(readFileSync(file, "utf8")))
      .map((file) => relative(root, file).replaceAll("\\", "/"));

    expect(new Set(shrinkingUsers)).toEqual(TEXT_SHRINK_ALLOWLIST);
    expect(new Set(singleLineUsers)).toEqual(SINGLE_LINE_ALLOWLIST);
  });
});
