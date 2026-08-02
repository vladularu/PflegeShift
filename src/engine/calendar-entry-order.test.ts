import { describe, expect, it } from "vitest";

import type { Appointment, ShiftEntry } from "@/domain/types";
import { sortCalendarEntries } from "@/engine/calendar-entry-order";

const base = {
  date: "2026-08-01",
  revision: 1,
  createdAt: "2026-08-01T08:00:00.000Z",
  updatedAt: "2026-08-01T08:00:00.000Z",
  deletedAt: null,
} as const;

function shift(id: string, type: ShiftEntry["type"], startTime: string | null): ShiftEntry {
  return {
    ...base,
    kind: "SHIFT",
    id,
    templateId: null,
    title: id,
    type,
    startTime,
    endTime: startTime === null ? null : "16:00",
    breakMinutes: 0,
    color: "#2F80ED",
    symbol: "D",
    note: null,
    overtimeMinutes: 0,
    holidayPremiumMode: "WITH_TIME_OFF",
  };
}

const appointment: Appointment = {
  ...base,
  kind: "APPOINTMENT",
  id: "appointment",
  title: "Termin",
  allDay: true,
  startTime: null,
  endTime: null,
  color: "#2F80ED",
  note: null,
};

describe("calendar entry order", () => {
  it("keeps services first, supplemental items next and appointments last", () => {
    expect(sortCalendarEntries([
      appointment,
      shift("training", "TRAINING", "09:00"),
      shift("late", "LATE", "13:18"),
      shift("early", "EARLY", "06:00"),
      shift("sick", "SICK", null),
    ]).map((entry) => entry.id)).toEqual([
      "early",
      "late",
      "sick",
      "training",
      "appointment",
    ]);
  });
});
