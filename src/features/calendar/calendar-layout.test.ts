import { describe, expect, it } from "vitest";

import {
  calculateCalendarBottomLayout,
  calculateCalendarGridLayout,
  calculateCalendarPopupPlacement,
  calculateQuickPlannerLayout,
  calendarTodayTarget,
} from "@/features/calendar/calendar-layout";

describe("calendar layout", () => {
  it("leaves part of the next planner action visible as a scroll cue", () => {
    const regularLayout = calculateQuickPlannerLayout(390);
    const compactLayout = calculateQuickPlannerLayout(320);

    expect(regularLayout.visibleTileCapacity).toBe(5.25);
    expect(regularLayout.tileWidth).toBeCloseTo(68.52, 2);
    expect(compactLayout.visibleTileCapacity).toBe(4.25);
    expect(compactLayout.tileWidth).toBeCloseTo(68.41, 2);
  });

  it("keeps the day popup horizontally centered below its anchor", () => {
    expect(
      calculateCalendarPopupPlacement({
        anchor: { x: 120, y: 180, width: 48, height: 64 },
        viewportWidth: 390,
        viewportHeight: 844,
        popupWidth: 350,
        popupHeight: 156,
        topInset: 47,
        bottomInset: 96,
      }),
    ).toEqual({
      left: 20,
      top: 252,
      direction: "BELOW",
    });
  });

  it("keeps the popup centered and moves it above a last-row day", () => {
    expect(
      calculateCalendarPopupPlacement({
        anchor: { x: 310, y: 690, width: 48, height: 64 },
        viewportWidth: 390,
        viewportHeight: 844,
        popupWidth: 350,
        popupHeight: 156,
        topInset: 47,
        bottomInset: 96,
      }),
    ).toEqual({
      left: 20,
      top: 526,
      direction: "ABOVE",
    });
  });

  it("keeps every row equal in five- and six-week grids", () => {
    const fiveWeeks = calculateCalendarGridLayout({
      pageHeight: 560,
      weekCount: 5,
      bottomReserve: 8,
    });
    const sixWeeks = calculateCalendarGridLayout({
      pageHeight: 560,
      weekCount: 6,
      bottomReserve: 8,
    });

    expect(fiveWeeks.rowHeight).toBeCloseTo(103.2, 1);
    expect(sixWeeks.rowHeight).toBeCloseTo(86, 2);
    expect(fiveWeeks.gridHeight + 16).toBe(560);
    expect(sixWeeks.gridHeight + 16).toBe(560);
  });

  it("keeps six SuperShift-like 114-point rows without stretching the final row", () => {
    const layout = calculateCalendarGridLayout({
      pageHeight: 795,
      weekCount: 6,
      bottomReserve: 55,
    });

    expect(layout.headerHeight).toBe(28);
    expect(layout.rowHeight).toBe(114);
    expect(layout.gridHeight).toBe(712);
  });

  it("reserves exactly the native tab inset and keeps the planner action above it", () => {
    expect(calculateCalendarBottomLayout(72)).toEqual({
      floatingActionBottom: 82,
      bottomReserve: 72,
    });
    expect(calculateCalendarBottomLayout(0)).toEqual({
      floatingActionBottom: 18,
      bottomReserve: 0,
    });
    expect(calculateCalendarBottomLayout(Number.NaN)).toEqual({
      floatingActionBottom: 18,
      bottomReserve: 0,
    });
  });

  it("maps a calendar tab reselect to today and month view", () => {
    expect(calendarTodayTarget("2026-07-31")).toEqual({
      selectedDate: "2026-07-31",
      visibleMonth: "2026-07",
      viewMode: "MONTH",
    });
  });
});
