import { describe, expect, it } from "vitest";

import { shiftOverlapsHoliday } from "@/features/day-editor/holiday-premium";

describe("holiday premium overlap", () => {
  it("detects a shift directly on a public holiday", () => {
    expect(shiftOverlapsHoliday("2026-12-25", "08:00", "16:00", "NW")).toBe(true);
  });

  it("detects an overnight shift ending on a public holiday", () => {
    expect(shiftOverlapsHoliday("2026-12-24", "21:00", "07:00", "NW")).toBe(true);
  });

  it("ignores an ordinary day", () => {
    expect(shiftOverlapsHoliday("2026-12-23", "08:00", "16:00", "NW")).toBe(false);
  });
});
