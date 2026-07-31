import { describe, expect, it } from "vitest";

import type { CalendarEntry, ShiftEntry } from "@/domain/types";
import {
  calendarEntryListsEqual,
  calendarMonthEntriesEqual,
  calendarSelectionTouchesMonth,
} from "@/features/calendar/calendar-rendering";

function shift(
  id: string,
  date: string,
  revision = 1,
): ShiftEntry {
  return {
    id,
    kind: "SHIFT",
    date,
    templateId: null,
    title: "Dienst",
    type: "DAY",
    startTime: "08:00",
    endTime: "16:00",
    breakMinutes: 30,
    color: "#207A68",
    symbol: "D",
    note: "",
    overtimeMinutes: 0,
    holidayPremiumMode: "WITH_TIME_OFF",
    revision,
    createdAt: "2026-07-31T00:00:00.000Z",
    updatedAt: "2026-07-31T00:00:00.000Z",
    deletedAt: null,
  };
}

describe("calendar rendering comparisons", () => {
  it("treats unchanged entry revisions as render-equivalent", () => {
    expect(calendarEntryListsEqual(
      [shift("a", "2026-07-15")],
      [shift("a", "2026-07-15")],
    )).toBe(true);
  });

  it("detects a changed entry revision", () => {
    expect(calendarEntryListsEqual(
      [shift("a", "2026-07-15", 1)],
      [shift("a", "2026-07-15", 2)],
    )).toBe(false);
  });

  it("invalidates only months whose visible grid contains the changed date", () => {
    const before = new Map<string, readonly CalendarEntry[]>([
      ["2026-07-15", [shift("a", "2026-07-15", 1)]],
    ]);
    const after = new Map<string, readonly CalendarEntry[]>([
      ["2026-07-15", [shift("a", "2026-07-15", 2)]],
    ]);

    expect(calendarMonthEntriesEqual("2026-07", before, after)).toBe(false);
    expect(calendarMonthEntriesEqual("2026-10", before, after)).toBe(true);
  });

  it("tracks selection only for months whose visible grid is affected", () => {
    expect(calendarSelectionTouchesMonth("2026-07", "2026-07-10", "2026-07-11")).toBe(true);
    expect(calendarSelectionTouchesMonth("2026-10", "2026-07-10", "2026-07-11")).toBe(false);
    expect(calendarSelectionTouchesMonth("2026-07", "2026-07-10", null)).toBe(true);
    expect(calendarSelectionTouchesMonth("2026-07", null, null)).toBe(false);
  });
});
