import { describe, expect, it } from "vitest";

import {
  calendarDayPressAction,
  calendarEntryPreview,
  calendarShiftDetail,
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
    const entries = [{ id: "1" }, { id: "2" }, { id: "3" }, { id: "4" }];
    const preview = calendarEntryPreview(entries as never, {
      detailedShifts: false,
      rowCapacity: 3,
    });

    expect(preview.entries).toHaveLength(2);
    expect(preview.overflowCount).toBe(2);
  });

  it("keeps one detailed shift and two appointments when four rows are available", () => {
    const entries = [
      { kind: "SHIFT", startTime: "06:00", endTime: "14:00", allDay: false },
      { kind: "APPOINTMENT" },
      { kind: "APPOINTMENT" },
    ];

    const preview = calendarEntryPreview(entries as never, {
      detailedShifts: true,
      rowCapacity: 4,
    });

    expect(preview.entries).toHaveLength(3);
    expect(preview.overflowCount).toBe(0);
  });

  it("reserves one row for the overflow count", () => {
    const entries = [
      { kind: "SHIFT", startTime: "06:00", endTime: "14:00", allDay: false },
      { kind: "APPOINTMENT" },
      { kind: "APPOINTMENT" },
      { kind: "APPOINTMENT" },
    ];

    const preview = calendarEntryPreview(entries as never, {
      detailedShifts: true,
      rowCapacity: 4,
    });

    expect(preview.entries).toHaveLength(2);
    expect(preview.overflowCount).toBe(2);
  });

  it("opens quick entry normally and stamps only with an active quick tool", () => {
    expect(calendarDayPressAction(false, false)).toBe("OPEN_QUICK_ENTRY");
    expect(calendarDayPressAction(true, false)).toBe("AWAIT_TOOL");
    expect(calendarDayPressAction(true, true)).toBe("STAMP");
  });
});

describe("calendar shift details", () => {
  it.each(["VACATION", "FREE", "SICK", "CUSTOM"])(
    "marks all-day %s without calculating hours",
    (type) => {
      for (const flags of [
        [true, false],
        [false, true],
        [true, true],
        [false, false],
      ]) {
        const [showShiftTimes, showShiftDuration] = flags;
        for (const allDay of [true, undefined]) {
          expect(
            calendarShiftDetail({ type, allDay, startTime: null, endTime: null } as never, {
              showShiftTimes,
              showShiftDuration,
              timeZone: "Europe/Berlin",
            }),
          ).toBe(showShiftTimes || showShiftDuration ? "GT" : null);
        }
      }
    },
  );

  it("does not label a partially missing time as all-day", () => {
    expect(
      calendarShiftDetail({ startTime: "06:00", endTime: null } as never, {
        showShiftTimes: true,
        showShiftDuration: true,
        timeZone: "Europe/Berlin",
      }),
    ).toBeNull();
  });
  const shift = {
    date: "2026-08-01",
    startTime: "06:00",
    endTime: "14:12",
    breakMinutes: 30,
  } as never;

  it("formats start time and net duration from persistent display choices", () => {
    expect(
      calendarShiftDetail(shift, {
        showShiftTimes: true,
        showShiftDuration: true,
        timeZone: "Europe/Berlin",
      }),
    ).toBe("06:00 · 7:42 h");
    expect(
      calendarShiftDetail(shift, {
        showShiftTimes: false,
        showShiftDuration: true,
        timeZone: "Europe/Berlin",
      }),
    ).toBe("7:42 h");
  });
});
