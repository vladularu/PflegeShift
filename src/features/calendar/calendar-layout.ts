import { CALENDAR_METRICS } from "@/theme/tokens";

export interface CalendarGridLayout {
  readonly headerHeight: number;
  readonly rowHeight: number;
  readonly lastRowHeight: number;
  readonly gridHeight: number;
}

export interface CalendarAnchorRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface CalendarPopupPlacement {
  readonly left: number;
  readonly top: number;
  readonly direction: "BELOW" | "ABOVE";
}

export interface QuickPlannerLayout {
  readonly tileWidth: number;
  readonly visibleTileCapacity: number;
}

export interface CalendarBottomLayout {
  readonly floatingActionBottom: number;
  readonly bottomReserve: number;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

export function calculateQuickPlannerLayout(viewportWidth: number): QuickPlannerLayout {
  const safeWidth = Number.isFinite(viewportWidth) ? viewportWidth : 320;
  const visibleTileCapacity = safeWidth >= 370 ? 5.25 : 4.25;
  const actionViewportWidth = Math.max(220, safeWidth - 26);
  return Object.freeze({
    visibleTileCapacity,
    tileWidth: (actionViewportWidth - (visibleTileCapacity - 1)) / visibleTileCapacity,
  });
}

export function calculateCalendarPopupPlacement({
  anchor,
  viewportWidth,
  viewportHeight,
  popupWidth,
  popupHeight,
  topInset = 0,
  bottomInset = 0,
  edgeInset = 12,
  gap = 8,
}: {
  readonly anchor: CalendarAnchorRect;
  readonly viewportWidth: number;
  readonly viewportHeight: number;
  readonly popupWidth: number;
  readonly popupHeight: number;
  readonly topInset?: number;
  readonly bottomInset?: number;
  readonly edgeInset?: number;
  readonly gap?: number;
}): CalendarPopupPlacement {
  const maximumLeft = Math.max(edgeInset, viewportWidth - popupWidth - edgeInset);
  const left = clamp((viewportWidth - popupWidth) / 2, edgeInset, maximumLeft);
  const belowTop = anchor.y + anchor.height + gap;
  const maximumTop = Math.max(
    topInset + edgeInset,
    viewportHeight - bottomInset - popupHeight - edgeInset,
  );

  if (belowTop <= maximumTop) {
    return Object.freeze({ left, top: belowTop, direction: "BELOW" });
  }

  return Object.freeze({
    left,
    top: clamp(anchor.y - popupHeight - gap, topInset + edgeInset, maximumTop),
    direction: "ABOVE",
  });
}

export function calculateCalendarGridLayout({
  pageHeight,
  weekCount,
  bottomReserve,
  testData = false,
}: {
  readonly pageHeight: number;
  readonly weekCount: number;
  readonly bottomReserve: number;
  readonly testData?: boolean;
}): CalendarGridLayout {
  const headerHeight = testData
    ? CALENDAR_METRICS.weekdayHeight + 28
    : CALENDAR_METRICS.weekdayHeight;
  const usableHeight = Math.max(0, pageHeight - headerHeight - bottomReserve - 8);
  const safeWeekCount = Math.max(1, weekCount);
  const equalRowHeight = Math.max(48, usableHeight / safeWeekCount);
  const rowHeight = Math.min(CALENDAR_METRICS.weekRowHeight, equalRowHeight);
  const lastRowHeight = Math.max(
    rowHeight,
    usableHeight - rowHeight * Math.max(0, safeWeekCount - 1),
  );

  return Object.freeze({
    headerHeight,
    rowHeight,
    lastRowHeight,
    gridHeight: headerHeight + rowHeight * Math.max(0, safeWeekCount - 1) + lastRowHeight,
  });
}

export function calculateCalendarBottomLayout(bottomInset: number): CalendarBottomLayout {
  const safeBottomInset = Number.isFinite(bottomInset) ? Math.max(0, bottomInset) : 0;
  return Object.freeze({
    floatingActionBottom: Math.max(18, safeBottomInset + 10),
    bottomReserve: safeBottomInset,
  });
}

export function calendarTodayTarget(currentDate: string) {
  return Object.freeze({
    selectedDate: currentDate,
    visibleMonth: currentDate.slice(0, 7),
    viewMode: "MONTH" as const,
  });
}
