import { createMonthGrid } from "@/engine/calendar";
import type { CalendarAnchorRect } from "@/features/calendar/calendar-layout";

import { CALENDAR_MINI_METRICS as MINI_MONTH_MOTION_METRICS } from "@/theme/tokens";
export { CALENDAR_MINI_METRICS as MINI_MONTH_MOTION_METRICS } from "@/theme/tokens";
export type CalendarMode = "MONTH" | "YEAR";

export interface CalendarMorphNode {
  readonly kind: "DAY" | "MINI";
  readonly month: string;
  readonly date?: string;
  readonly fontSize: number;
  readonly color: string;
  readonly mutedColor: string;
  readonly today: string;
  readonly todayColor: string;
  readonly todayBackground: string;
}

export interface MeasuredCalendarMorphNode extends CalendarMorphNode {
  readonly rect: CalendarAnchorRect;
}

export interface MorphDay {
  readonly date: string;
  readonly day: number;
  readonly from: CalendarAnchorRect;
  readonly to: CalendarAnchorRect;
  readonly fromFont: number;
  readonly toFont: number;
  readonly color: string;
  readonly targetColor: string;
  readonly background: string;
  readonly targetBackground: string;
}

export interface CalendarMorphPlan {
  readonly days: readonly MorphDay[];
  readonly neighbors: readonly MeasuredCalendarMorphNode[];
  readonly anchor: CalendarAnchorRect;
  readonly destination: CalendarAnchorRect;
}

export function validMorphRect(rect: CalendarAnchorRect): boolean {
  return (
    [rect.x, rect.y, rect.width, rect.height].every(Number.isFinite) &&
    rect.width > 0 &&
    rect.height > 0
  );
}

/** Window measurements share one coordinate space, including the year scroll offset. */
export function buildCalendarMorphPlan(
  month: string,
  nodes: readonly MeasuredCalendarMorphNode[],
  viewport: CalendarAnchorRect,
): CalendarMorphPlan | null {
  if (!validMorphRect(viewport)) return null;
  const mini = nodes.find((node) => node.kind === "MINI" && node.month === month);
  if (!mini || !validMorphRect(mini.rect)) return null;
  const relative = (rect: CalendarAnchorRect): CalendarAnchorRect => ({
    ...rect,
    x: rect.x - viewport.x,
    y: rect.y - viewport.y,
  });
  const dayNodes = new Map(
    nodes
      .filter((node) => node.kind === "DAY" && node.month === month)
      .map((node) => [node.date, node]),
  );
  const days: MorphDay[] = [];
  const grid = createMonthGrid(month);
  for (let index = 0; index < grid.length; index += 1) {
    const cell = grid[index];
    if (!cell.inMonth) continue;
    const target = dayNodes.get(cell.date);
    if (!target || !validMorphRect(target.rect)) return null;
    const isToday = cell.date === mini.today;
    const size = MINI_MONTH_MOTION_METRICS.daySize;
    days.push({
      date: cell.date,
      day: cell.day,
      from: relative({
        x: mini.rect.x + (((index % 7) + 0.5) * mini.rect.width) / 7 - size / 2,
        y: mini.rect.y + Math.floor(index / 7) * MINI_MONTH_MOTION_METRICS.rowHeight,
        width: size,
        height: size,
      }),
      to: relative(target.rect),
      fromFont: mini.fontSize,
      toFont: target.fontSize,
      color: isToday ? mini.todayColor : cell.weekend ? mini.mutedColor : mini.color,
      targetColor: isToday ? target.todayColor : target.color,
      background: isToday ? mini.todayBackground : "transparent",
      targetBackground: isToday ? target.todayBackground : "transparent",
    });
  }
  if (!days.length) return null;
  // A retained pager may still be scrolling to the selected month. Do not freeze
  // an offscreen page as the animation destination.
  if (
    days[0].to.y < 0 ||
    days[0].to.y >= viewport.height ||
    days.some((day) => day.to.x < -1 || day.to.x + day.to.width > viewport.width + 1)
  )
    return null;
  const left = Math.min(...days.map((day) => day.to.x));
  const top = Math.min(...days.map((day) => day.to.y));
  const right = Math.max(...days.map((day) => day.to.x + day.to.width));
  const bottom = Math.max(...days.map((day) => day.to.y + day.to.height));
  return {
    days,
    anchor: relative(mini.rect),
    destination: { x: left, y: top, width: right - left, height: bottom - top },
    neighbors: nodes
      .filter(
        (node) =>
          node.kind === "MINI" &&
          node.month !== month &&
          node.month.slice(0, 4) === month.slice(0, 4) &&
          validMorphRect(node.rect),
      )
      .map((node) => ({ ...node, rect: relative(node.rect) })),
  };
}
