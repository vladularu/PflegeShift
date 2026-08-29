import { describe, expect, it } from "vitest";

import type { UserProfile } from "@/domain/types";
import { settingsFormValues } from "@/features/settings/settings-form-values";

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
  });
});
