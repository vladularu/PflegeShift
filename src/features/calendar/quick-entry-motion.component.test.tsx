import { describe, expect, it } from "@jest/globals";

import { quickEntryAnchorMotion, quickEntryTransitionDuration } from "./quick-entry-motion";
import { calculateCalendarPopupPlacement } from "./calendar-layout";
import { MOTION } from "@/theme/motion";
import { CALENDAR_METRICS, SPACING } from "@/theme/tokens";

describe("quick-entry anchor motion", () => {
  it.each([
    { x: 0, y: 180, height: 116, popupHeight: 106 },
    { x: 310, y: 690, height: 116, popupHeight: 214 },
    { x: 130, y: 180, height: 116, popupHeight: 330 },
  ])("collapses at the selected date header for %o", ({ x, y, height, popupHeight }) => {
    const anchor = { x, y, width: 56, height };
    const popupWidth = 378;
    const placement = calculateCalendarPopupPlacement({
      anchor,
      viewportWidth: 390,
      viewportHeight: 844,
      popupWidth,
      popupHeight,
      topInset: 47,
      bottomInset: 96,
      edgeInset: 6,
    });
    const motion = quickEntryAnchorMotion(anchor, placement, popupWidth, popupHeight);
    expect(placement.left + popupWidth / 2 + motion.translateX).toBe(x + 28);
    expect(placement.top + popupHeight / 2 + motion.translateY).toBe(
      y + (CALENDAR_METRICS.dayNumberHeight + SPACING.sm) / 2,
    );
    expect(motion.scale * popupWidth).toBeLessThanOrEqual(anchor.width);
    expect(motion.scale * popupHeight).toBeLessThanOrEqual(
      CALENDAR_METRICS.dayNumberHeight + SPACING.sm,
    );
    expect(motion.scale).toBeGreaterThan(0);
    expect(motion.translateY < 0).toBe(placement.direction === "BELOW");
  });

  it("does not shift the date origin when extra services make a cell taller", () => {
    const placement = { left: 6, top: 300, direction: "BELOW" as const };
    const short = quickEntryAnchorMotion(
      { x: 20, y: 120, width: 55, height: 90 },
      placement,
      378,
      106,
    );
    const tall = quickEntryAnchorMotion(
      { x: 20, y: 120, width: 55, height: 160 },
      placement,
      378,
      214,
    );
    expect(300 + 106 / 2 + short.translateY).toBe(300 + 214 / 2 + tall.translateY);
    expect(short.translateX).toBe(tall.translateX);
  });

  it("keeps small fallback anchors finite and shares the planner timings", () => {
    const motion = quickEntryAnchorMotion(
      { x: 5, y: 8, width: 1, height: 1 },
      { left: 6, top: 20, direction: "BELOW" },
      308,
      106,
    );
    expect(Object.values(motion).every(Number.isFinite)).toBe(true);
    expect(motion.scale).toBeGreaterThan(0);
    expect(quickEntryTransitionDuration(true, false)).toBe(MOTION.duration.scene);
    expect(quickEntryTransitionDuration(false, false)).toBe(MOTION.duration.deliberate);
    expect(quickEntryTransitionDuration(true, true)).toBe(MOTION.duration.instant);
    expect(quickEntryTransitionDuration(false, true)).toBe(MOTION.duration.instant);
  });
});
