import { describe, expect, it } from "vitest";

import {
  calendarDayPressAction,
  calendarEntryPreview,
  shouldUseCompactCalendarLabels,
  yearMonths,
} from "@/features/calendar/calendar-display";

describe("calendar display helpers", () => {
  it("builds all year months", () => {
    const months = yearMonths(2026);
    expect(months).toHaveLength(12);
    expect(months[0]).toBe("2026-01");
    expect(months[11]).toBe("2026-12");
  });

  it("limits calendar entries and reports the remaining count", () => {
    const entries = [
      { id: "1" },
      { id: "2" },
      { id: "3" },
      { id: "4" },
    ];
    const preview = calendarEntryPreview(entries as never, 2);

    expect(preview.entries).toHaveLength(2);
    expect(preview.overflowCount).toBe(2);
  });

  it("opens quick entry normally and stamps only with an active quick tool", () => {
    expect(calendarDayPressAction(false, false)).toBe("OPEN_QUICK_ENTRY");
    expect(calendarDayPressAction(true, false)).toBe("AWAIT_TOOL");
    expect(calendarDayPressAction(true, true)).toBe("STAMP");
  });
});

describe("calendar label density", () => {
  it("switches to compact marks for accessibility text sizes", () => {
    expect(shouldUseCompactCalendarLabels(1)).toBe(false);
    expect(shouldUseCompactCalendarLabels(1.29)).toBe(false);
    expect(shouldUseCompactCalendarLabels(1.3)).toBe(true);
    expect(shouldUseCompactCalendarLabels(2)).toBe(true);
  });
});
