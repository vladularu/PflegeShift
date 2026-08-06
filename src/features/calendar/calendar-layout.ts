export interface CalendarGridLayout {
  readonly headerHeight: number;
  readonly rowHeight: number;
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
  readonly visibleTileCount: number;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

export function calculateQuickPlannerLayout(viewportWidth: number): QuickPlannerLayout {
  const safeWidth = Number.isFinite(viewportWidth) ? viewportWidth : 320;
  const visibleTileCount = safeWidth >= 370 ? 5 : 4;
  const actionViewportWidth = Math.max(220, safeWidth - 96);
  return Object.freeze({
    visibleTileCount,
    tileWidth: (actionViewportWidth - (visibleTileCount - 1)) / visibleTileCount,
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
  const headerHeight = testData ? 64 : 40;
  const usableHeight = Math.max(0, pageHeight - headerHeight - bottomReserve - 8);
  const rowHeight = Math.max(48, usableHeight / Math.max(1, weekCount));

  return Object.freeze({
    headerHeight,
    rowHeight,
    gridHeight: headerHeight + rowHeight * weekCount,
  });
}

export function calculateCalendarBottomReserve(floatingActionBottom: number): number {
  if (!Number.isFinite(floatingActionBottom)) return 48;
  return Math.max(48, floatingActionBottom - 20);
}

export function calendarTodayTarget(currentDate: string) {
  return Object.freeze({
    selectedDate: currentDate,
    visibleMonth: currentDate.slice(0, 7),
    viewMode: "MONTH" as const,
  });
}
