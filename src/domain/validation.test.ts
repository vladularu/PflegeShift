import { describe, expect, it } from "vitest";

import {
  ValidationError,
  validateAppointment,
  validateProfile,
  validateShift,
  validateTemplate,
  validateMonthlyTariffDecision,
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

  it("rejects an invalid profile time zone before engine calculations", () => {
    expect(() =>
      validateProfile({
        federalState: "NW",
        weeklyMinutes: 2_310,
        timeZone: "SQL/Not-A-Time-Zone",
      }),
    ).toThrow("gültige Zeitzone");
  });

  it("validates every persisted tariff-decision field at runtime", () => {
    const valid = {
      month: "2026-08",
      allowanceStatus: "SHIFT_MONTHLY",
      revision: 1,
      confirmedAt: "2026-08-04T10:00:00.000Z",
      updatedAt: "2026-08-04T10:00:00.000Z",
    } as const;
    expect(validateMonthlyTariffDecision(valid)).toEqual(valid);

    expect(() => validateMonthlyTariffDecision({ ...valid, month: "2026-99" })).toThrow(
      "Auswertungsmonat",
    );
    expect(() => validateMonthlyTariffDecision({ ...valid, allowanceStatus: "UNKNOWN" })).toThrow(
      "Zulagenstatus",
    );
    expect(() => validateMonthlyTariffDecision({ ...valid, revision: 0 })).toThrow(
      "Datensatzrevision",
    );
    expect(() =>
      validateMonthlyTariffDecision({ ...valid, confirmedAt: "not-an-instant" }),
    ).toThrow("Zeitstempel");
    expect(() => validateMonthlyTariffDecision({ ...valid, updatedAt: "yesterday" })).toThrow(
      "Zeitstempel",
    );
  });
});
