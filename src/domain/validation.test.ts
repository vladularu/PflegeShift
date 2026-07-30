import { describe, expect, it } from "vitest";

import {
  ValidationError,
  validateAppointment,
  validateShift,
  validateTemplate,
} from "@/domain/validation";

describe("domain validation", () => {
  it("normalizes a template", () => {
    expect(
      validateTemplate({
        name: " Früh ",
        type: "EARLY",
        startTime: "06:00",
        endTime: "14:12",
        breakMinutes: 30,
        color: "#7e57c2",
        symbol: " F ",
        sortOrder: 10,
      }),
    ).toMatchObject({ name: "Früh", color: "#7E57C2", symbol: "F" });
  });

  it("rejects a 24-hour ambiguous shift", () => {
    expect(() =>
      validateShift({
        date: "2026-07-30",
        title: "Dienst",
        type: "CUSTOM",
        startTime: "08:00",
        endTime: "08:00",
        breakMinutes: 0,
        color: "#2F80ED",
        symbol: "D",
      }),
    ).toThrow(ValidationError);
  });

  it("keeps appointments on the selected day", () => {
    expect(() =>
      validateAppointment({
        date: "2026-07-30",
        title: "Arzt",
        allDay: false,
        startTime: "11:00",
        endTime: "10:00",
        color: "#F2A93B",
      }),
    ).toThrow("am selben Tag");
  });
});
