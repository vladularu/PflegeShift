import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const UI_FILES = [
  "src/ui/form-controls.tsx",
  "src/features/calendar/calendar-view-screen.tsx",
  "src/features/calendar/quick-entry-action-tile.tsx",
  "src/features/calendar/quick-entry-popup.tsx",
  "src/features/day-editor/day-editor-screen.tsx",
  "src/features/day-editor/quick-add-screen.tsx",
  "src/features/templates/template-editor-screen.tsx",
];

describe("semantic design token usage", () => {
  it("keeps shared UI colors out of feature implementations", () => {
    const violations = UI_FILES.filter((file) =>
      /#[0-9A-Fa-f]{6}|rgba\(/.test(readFileSync(join(process.cwd(), file), "utf8")),
    );
    expect(violations).toEqual([]);
  });
});
