import type { CalendarAnchorRect, CalendarPopupPlacement } from "./calendar-layout";
import { MOTION } from "@/theme/motion";
import { CALENDAR_METRICS, SPACING } from "@/theme/tokens";

export function quickEntryTransitionDuration(open: boolean, reduceMotion: boolean): number {
  if (reduceMotion) return MOTION.duration.instant;
  return open ? MOTION.duration.scene : MOTION.duration.deliberate;
}

export interface QuickEntryAnchorMotion {
  readonly translateX: number;
  readonly translateY: number;
  readonly scale: number;
}

export function quickEntryAnchorMotion(
  anchor: CalendarAnchorRect,
  placement: CalendarPopupPlacement,
  popupWidth: number,
  popupHeight: number,
): QuickEntryAnchorMotion {
  // The day number occupies the top of the measured cell, above its shift chips.
  const dayHeadingHeight = Math.min(anchor.height, CALENDAR_METRICS.dayNumberHeight + SPACING.sm);
  return {
    translateX: anchor.x + anchor.width / 2 - (placement.left + popupWidth / 2),
    translateY: anchor.y + dayHeadingHeight / 2 - (placement.top + popupHeight / 2),
    scale: Math.min(
      1,
      Math.max(1, anchor.width) / popupWidth,
      Math.max(1, dayHeadingHeight) / popupHeight,
    ),
  };
}
