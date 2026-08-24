import { readFileSync, readdirSync } from "node:fs";
import { extname, join, relative } from "node:path";

import { describe, expect, it } from "vitest";

const SOURCE_ROOTS = ["app", "src/features", "src/navigation", "src/ui"];

function collectSourceFiles(directory: string): string[] {
  return readdirSync(join(process.cwd(), directory), { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return collectSourceFiles(path);
    if (![".ts", ".tsx"].includes(extname(entry.name))) return [];
    if (/\.(?:component\.|integration\.)?test\.tsx?$/.test(entry.name)) return [];
    if (entry.name.endsWith(".d.ts")) return [];
    return [path];
  });
}

function normalized(path: string) {
  return relative(process.cwd(), join(process.cwd(), path)).replaceAll("\\", "/");
}

const SOURCE_FILES = SOURCE_ROOTS.flatMap(collectSourceFiles).map(normalized).sort();

function filesMatching(pattern: RegExp) {
  return SOURCE_FILES.filter((file) =>
    pattern.test(readFileSync(join(process.cwd(), file), "utf8")),
  );
}

const LEGACY_COLOR_LITERAL_FILES = ["src/features/calendar/quick-planner-appearance.ts"];

const LEGACY_TYPOGRAPHY_LITERAL_FILES = [
  "src/features/analysis/analysis-overview-cards.tsx",
  "src/features/analysis/annual-report-view.tsx",
  "src/features/calendar/calendar-view-screen.tsx",
  "src/features/calendar/month-card.tsx",
  "src/features/calendar/quick-entry-action-tile.tsx",
  "src/features/calendar/quick-entry-popup.tsx",
  "src/features/calendar/year-overview.tsx",
  "src/features/day-editor/appointment-edit-overlay.tsx",
  "src/features/day-editor/appointment-recurrence-overlay.tsx",
  "src/features/day-editor/day-editor-components.tsx",
  "src/features/day-editor/day-editor-form.tsx",
  "src/features/day-editor/entry-edit-overlay-frame.tsx",
  "src/features/day-editor/entry-options.tsx",
  "src/features/day-editor/shift-edit-overlay.tsx",
  "src/features/day-editor/shift-notification-overlay.tsx",
  "src/features/dev-tools/dev-tools-screen.tsx",
  "src/features/location/location-picker-screen.tsx",
  "src/features/settings/settings-info-details-screen.tsx",
  "src/ui/shift-color-picker-sheet.tsx",
  "src/ui/shift-symbol-picker.tsx",
].sort();

const LEGACY_RADIUS_LITERAL_FILES = [
  "src/features/analysis/annual-report-view.tsx",
  "src/features/calendar/calendar-view-screen.tsx",
  "src/features/calendar/month-card.tsx",
  "src/features/calendar/quick-entry-popup.tsx",
  "src/features/calendar/shift-selection-panel.tsx",
  "src/features/calendar/year-overview.tsx",
  "src/features/day-editor/appointment-edit-overlay.tsx",
  "src/features/day-editor/appointment-recurrence-overlay.tsx",
  "src/features/day-editor/day-editor-components.tsx",
  "src/features/day-editor/day-editor-form.tsx",
  "src/features/day-editor/entry-edit-overlay-frame.tsx",
  "src/features/day-editor/entry-options.tsx",
  "src/features/day-editor/shift-edit-overlay.tsx",
  "src/features/day-editor/shift-notification-overlay.tsx",
  "src/features/dev-tools/dev-tools-screen.tsx",
  "src/features/location/location-preview.tsx",
  "src/ui/color-picker.tsx",
  "src/ui/loading-view.tsx",
  "src/ui/shift-color-picker-sheet.tsx",
  "src/ui/shift-symbol-picker.tsx",
].sort();

const LEGACY_HORIZONTAL_PADDING_LITERAL_FILES = [
  "src/features/analysis/annual-report-view.tsx",
  "src/features/calendar/calendar-view-screen.tsx",
  "src/features/calendar/month-card.tsx",
  "src/features/calendar/quick-entry-action-strip.tsx",
  "src/features/calendar/quick-entry-popup.tsx",
  "src/features/calendar/quick-planner-dock.tsx",
  "src/features/calendar/year-overview.tsx",
  "src/features/day-editor/appointment-edit-overlay.tsx",
  "src/features/day-editor/appointment-recurrence-overlay.tsx",
  "src/features/day-editor/day-editor-components.tsx",
  "src/features/day-editor/day-editor-form.tsx",
  "src/features/day-editor/entry-edit-overlay-frame.tsx",
  "src/features/day-editor/entry-options.tsx",
  "src/features/day-editor/shift-edit-overlay.tsx",
  "src/features/day-editor/shift-notification-overlay.tsx",
  "src/features/location/location-picker-screen.tsx",
  "src/features/settings/settings-info-details-screen.tsx",
  "src/features/templates/templates-manager-screen.tsx",
  "src/ui/form-layout.tsx",
  "src/ui/loading-view.tsx",
].sort();

describe("semantic design token usage", () => {
  it("discovers every productive app and UI source recursively", () => {
    expect(SOURCE_FILES.length).toBeGreaterThanOrEqual(60);
    expect(SOURCE_FILES).toContain("src/ui/screen-layout.tsx");
  });

  it("does not grow the documented semantic color debt", () => {
    expect(filesMatching(/#[0-9A-Fa-f]{6}|rgba\(/)).toEqual(LEGACY_COLOR_LITERAL_FILES);
  });

  it("does not grow the documented typography token debt", () => {
    expect(filesMatching(/(?:fontSize|lineHeight)\s*:\s*[0-9]/)).toEqual(
      LEGACY_TYPOGRAPHY_LITERAL_FILES,
    );
  });

  it("does not grow the documented radius token debt", () => {
    expect(filesMatching(/borderRadius\s*:\s*[0-9]/)).toEqual(LEGACY_RADIUS_LITERAL_FILES);
  });

  it("does not grow the documented screen-gutter token debt", () => {
    expect(filesMatching(/paddingHorizontal\s*:\s*[0-9]/)).toEqual(
      LEGACY_HORIZONTAL_PADDING_LITERAL_FILES,
    );
  });

  it("routes shared form, report, and tab layouts through the screen shell", () => {
    const sharedLayouts = [
      "src/ui/form-layout.tsx",
      "src/ui/report-layout.tsx",
      "src/ui/tab-root-header.tsx",
    ];

    expect(
      sharedLayouts.filter((file) =>
        /ScreenScrollView|TabScreenHeader/.test(readFileSync(join(process.cwd(), file), "utf8")),
      ),
    ).toEqual(sharedLayouts);
  });
});
