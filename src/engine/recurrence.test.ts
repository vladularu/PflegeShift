import { describe, expect, it } from "vitest";

import type { Appointment } from "@/domain/types";
import { expandAppointmentSeries } from "@/engine/recurrence";

const base: Appointment = {
  kind: "APPOINTMENT",
  id: "series-1",
  date: "2026-09-08",
  title: "Physio",
  allDay: false,
  startTime: "12:00",
  endTime: "13:00",
  color: "#25A9A4",
  note: null,
  recurrence: { frequency: "WEEK", interval: 1 },
  notification: null,
  location: null,
  revision: 1,
  createdAt: "2026-08-14T00:00:00.000Z",
  updatedAt: "2026-08-14T00:00:00.000Z",
  deletedAt: null,
};

describe("expandAppointmentSeries", () => {
  it("expands a weekly series in the requested calendar range", () => {
    expect(
      expandAppointmentSeries(base, "2026-09-01", "2026-09-30").map((entry) => entry.date),
    ).toEqual(["2026-09-08", "2026-09-15", "2026-09-22", "2026-09-29"]);
  });

  it("keeps the root id so edit and delete always target the complete series", () => {
    expect(expandAppointmentSeries(base, "2026-09-15", "2026-09-15")[0]).toMatchObject({
      id: "series-1",
      date: "2026-09-15",
    });
  });

  it("supports a two-week interval", () => {
    const everyTwoWeeks = { ...base, recurrence: { frequency: "WEEK", interval: 2 } } as const;
    expect(
      expandAppointmentSeries(everyTwoWeeks, "2026-09-01", "2026-10-15").map((entry) => entry.date),
    ).toEqual(["2026-09-08", "2026-09-22", "2026-10-06"]);
  });
});
