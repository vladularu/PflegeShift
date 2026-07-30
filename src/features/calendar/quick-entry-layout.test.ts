import { describe, expect, it } from "vitest";

import { calculateQuickEntryLayout } from "@/features/calendar/quick-entry-layout";

describe("calculateQuickEntryLayout", () => {
  it("shows the popover below a day in the upper calendar area", () => {
    const layout = calculateQuickEntryLayout(390, 844, 196, 220);

    expect(layout.showAbove).toBe(false);
    expect(layout.cardTop).toBeGreaterThan(220);
    expect(layout.cardLeft).toBe(16);
  });

  it("moves the popover above a day near the bottom edge", () => {
    const layout = calculateQuickEntryLayout(390, 844, 360, 760);

    expect(layout.showAbove).toBe(true);
    expect(layout.cardTop + layout.cardHeight).toBeLessThan(760);
    expect(layout.pointerLeft).toBeLessThan(
      layout.cardLeft + layout.cardWidth - 18,
    );
  });
});
