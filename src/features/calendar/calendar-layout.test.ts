import { describe, expect, it } from "vitest";

import {
  calculateCalendarBottomReserve,
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
    expect(regularLayout.tileWidth).toBeCloseTo(55.19, 2);
    expect(compactLayout.visibleTileCapacity).toBe(4.25);
    expect(compactLayout.tileWidth).toBeCloseTo(51.94, 2);
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

  it("uses the available page height for five- and six-week grids", () => {
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

    expect(fiveWeeks.rowHeight).toBeCloseTo(100.8, 1);
    expect(sixWeeks.rowHeight).toBe(84);
    expect(fiveWeeks.gridHeight + 16).toBe(560);
    expect(sixWeeks.gridHeight + 16).toBe(560);
  });

  it("keeps the final calendar row clear of the floating navigation area", () => {
    expect(calculateCalendarBottomReserve(92)).toBe(72);
    expect(calculateCalendarBottomReserve(78)).toBe(58);
    expect(calculateCalendarBottomReserve(18)).toBe(48);
  });

  it("maps a calendar tab reselect to today and month view", () => {
    expect(calendarTodayTarget("2026-07-31")).toEqual({
      selectedDate: "2026-07-31",
      visibleMonth: "2026-07",
      viewMode: "MONTH",
    });
  });
});
