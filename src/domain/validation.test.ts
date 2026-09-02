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

  it("accepts custom locations and validates optional map coordinates as a pair", () => {
    const shift = {
      date: "2026-07-30",
      title: "Dienst",
      type: "CUSTOM" as const,
      startTime: "08:00",
      endTime: "16:00",
      breakMinutes: 30,
      color: "#2F80ED",
      symbol: "D",
    };

    expect(validateShift({ ...shift, location: { name: " Station 3 " } }).location).toEqual({
      name: "Station 3",
    });
    expect(
      validateShift({
        ...shift,
        location: {
          name: "Klinikum",
          address: " Hauptstraße 1 ",
          latitude: 49.6408,
          longitude: 8.6373,
        },
      }).location,
    ).toEqual({
      name: "Klinikum",
      address: "Hauptstraße 1",
      latitude: 49.6408,
      longitude: 8.6373,
    });
    expect(() =>
      validateShift({ ...shift, location: { name: "Klinikum", latitude: 49.6408 } }),
    ).toThrow("unvollständige Koordinaten");
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

  it("validates optional industry and manual monthly gross", () => {
    expect(
      validateProfile({
        federalState: "NW",
        weeklyMinutes: 2_310,
        timeZone: "Europe/Berlin",
        industry: "SOCIAL_SERVICES",
        manualMonthlyGrossCents: 420_000,
      }),
    ).toMatchObject({
      industry: "SOCIAL_SERVICES",
      manualMonthlyGrossCents: 420_000,
      tariff: null,
    });

    expect(() =>
      validateProfile({
        federalState: "NW",
        weeklyMinutes: 2_310,
        timeZone: "Europe/Berlin",
        industry: "INVALID" as "HEALTHCARE",
      }),
    ).toThrow("Berufsbereich");
    expect(() =>
      validateProfile({
        federalState: "NW",
        weeklyMinutes: 2_310,
        timeZone: "Europe/Berlin",
        manualMonthlyGrossCents: 0,
      }),
    ).toThrow("monatliches Brutto");
  });

  it("keeps tariff and manual monthly gross mutually exclusive", () => {
    expect(() =>
      validateProfile({
        federalState: "NW",
        weeklyMinutes: 2_310,
        timeZone: "Europe/Berlin",
        manualMonthlyGrossCents: 420_000,
        tariff: {
          payGroup: "P8",
          payLevel: 4,
          sector: "BT_K",
          tariffRegion: "OTHER",
          fullTimeWeeklyMinutes: 2_310,
        },
      }),
    ).toThrow("entweder manuelles Gehalt oder TVöD-P");
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
