import { describe, expect, it } from "vitest";

import type { UserProfile } from "@/domain/types";
import {
  manualMonthlyGrossFieldError,
  parseManualMonthlyGrossCents,
  settingsFormValues,
} from "@/features/settings/settings-form-values";

const baseProfile: UserProfile = {
  federalState: "NW",
  holidayRegion: "NONE",
  weeklyMinutes: 2310,
  timeZone: "Europe/Berlin",
  regularRotatingNightWork: false,
  sundayHolidayWorkEligible: true,
  allEmploymentWorkRecorded: true,
  tariff: null,
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
};

describe("settings form values", () => {
  it("uses persisted profile values on the first render", () => {
    expect(
      settingsFormValues({
        ...baseProfile,
        federalState: "BY",
        weeklyMinutes: 2400,
        tariff: {
          payGroup: "P11",
          payLevel: 5,
          sector: "BT_B",
          tariffRegion: "OTHER",
          fullTimeWeeklyMinutes: 2340,
        },
      }),
    ).toEqual({
      federalState: "BY",
      holidayRegion: "NONE",
      weeklyHours: "40",
      industry: "UNKNOWN",
      salaryMode: "TVOED_P",
      manualMonthlyGross: "",
      regularRotatingNightWork: "NO",
      sundayHolidayWorkEligible: "YES",
      allEmploymentWorkRecorded: "YES",
      payGroup: "P11",
      payLevel: 5,
      sector: "BT_B",
      tariffRegion: "OTHER",
      fullTimeHours: "39",
    });
  });

  it("uses federal-state-aware tariff defaults only when no tariff exists", () => {
    expect(settingsFormValues({ ...baseProfile, federalState: "BW" }).fullTimeHours).toBe("39");
    expect(settingsFormValues(baseProfile).fullTimeHours).toBe("38,5");
    expect(settingsFormValues(baseProfile).salaryMode).toBe("UNSET");
  });

  it("restores the persisted industry and manual monthly gross", () => {
    expect(
      settingsFormValues({
        ...baseProfile,
        industry: "SOCIAL_SERVICES",
        manualMonthlyGrossCents: 345_050,
      }),
    ).toMatchObject({
      industry: "SOCIAL_SERVICES",
      salaryMode: "MANUAL",
      manualMonthlyGross: "3450,50",
    });
  });

  it("parses a German decimal amount into exact cents", () => {
    expect(parseManualMonthlyGrossCents("3450,50")).toBe(345_050);
    expect(parseManualMonthlyGrossCents("3450.5")).toBe(345_050);
    expect(manualMonthlyGrossFieldError("3450,50")).toBeNull();
    expect(manualMonthlyGrossFieldError("0")).toMatch(/0,01 € und 100.000 €/);
    expect(manualMonthlyGrossFieldError("3.450,50")).not.toBeNull();
  });
});
