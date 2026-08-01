import { describe, expect, it } from "vitest";

import type { Appointment, ShiftEntry } from "@/domain/types";
import { buildCalendarEntryIndex } from "@/features/calendar/calendar-entry-index";

const base = {
  revision: 1,
  createdAt: "2026-08-01T00:00:00.000Z",
  updatedAt: "2026-08-01T00:00:00.000Z",
  deletedAt: null,
} as const;

function shift(id: string, date: string, deletedAt: string | null = null): ShiftEntry {
  return {
    ...base,
    id,
    kind: "SHIFT",
    date,
    templateId: null,
    title: "Früh",
    type: "EARLY",
    startTime: "06:00",
    endTime: "14:12",
    breakMinutes: 30,
    color: "#7E57C2",
    symbol: "F",
    note: "",
    overtimeMinutes: 0,
    holidayPremiumMode: "WITH_TIME_OFF",
    deletedAt,
  };
}

function appointment(id: string, date: string): Appointment {
  return {
    ...base,
    id,
    kind: "APPOINTMENT",
    date,
    title: "Termin",
    allDay: true,
    startTime: null,
    endTime: null,
    color: "#2F80ED",
    note: "",
  };
}

describe("buildCalendarEntryIndex", () => {
  it("indexes visible entries and monthly shifts in one pass", () => {
    const index = buildCalendarEntryIndex([
      shift("july", "2026-07-31"),
      shift("august", "2026-08-01"),
      appointment("appointment", "2026-08-01"),
      shift("deleted", "2026-08-02", "2026-08-03T00:00:00.000Z"),
    ], { showAppointments: true, showShifts: true });

    expect(index.visibleEntries.map((entry) => entry.id)).toEqual(["july", "august", "appointment"]);
    expect(index.entriesByDate.get("2026-08-01")?.map((entry) => entry.id)).toEqual(["august", "appointment"]);
    expect(index.shiftsByMonth.get("2026-07")?.map((entry) => entry.id)).toEqual(["july"]);
    expect(index.shiftsByMonth.get("2026-08")?.map((entry) => entry.id)).toEqual(["august"]);
  });

  it("keeps salary and progress shifts indexed when shifts are visually hidden", () => {
    const index = buildCalendarEntryIndex([
      shift("shift", "2026-08-01"),
      appointment("appointment", "2026-08-01"),
    ], { showAppointments: true, showShifts: false });

    expect(index.visibleEntries.map((entry) => entry.id)).toEqual(["appointment"]);
    expect(index.shiftsByMonth.get("2026-08")?.map((entry) => entry.id)).toEqual(["shift"]);
  });

  it("keeps a twelve-month stress dataset complete", () => {
    const entries = Array.from({ length: 12 }, (_, monthIndex) => {
      const month = String(monthIndex + 1).padStart(2, "0");
      return Array.from({ length: 28 }, (_, dayIndex) => {
        const day = String(dayIndex + 1).padStart(2, "0");
        const date = `2026-${month}-${day}`;
        return [
          shift(`${date}-early`, date),
          shift(`${date}-late`, date),
          shift(`${date}-night`, date),
          appointment(`${date}-appointment-a`, date),
          appointment(`${date}-appointment-b`, date),
        ];
      }).flat();
    }).flat();

    const index = buildCalendarEntryIndex(entries, { showAppointments: true, showShifts: true });

    expect(index.visibleEntries).toHaveLength(1_680);
    expect(index.entriesByDate.size).toBe(336);
    expect(index.shiftsByMonth.size).toBe(12);
    expect(index.shiftsByMonth.get("2026-12")).toHaveLength(84);
  });
});
