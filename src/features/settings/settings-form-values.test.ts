import { describe, expect, it } from "vitest";

import { profileSalaryLabel } from "./work-profile-summary";
import type { UserProfile } from "@/domain/types";
import {
  manualMonthlyGrossFieldError,
  parseManualMonthlyGrossCents,
  settingsFormValues,
  settingsFormValuesForSalaryMode,
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
      trainingYear: "UNSET",
      krPayGroup: "KR8",
      tvhPayGroup: "KR8",
      tvhPayLevel: 4,
      tvhFullTimeWeeklyMinutes: 2400,
      tvUkPayGroup: "PUK8",
      tvUkPayLevel: 4,
      tvlUniversityRegion: "WEST",
      ePayGroup: "E9b",
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

describe("TV-H settings projection", () => {
  it.each(["1a", "1b"] as const)("preserves entry step %s and full-time basis", (payLevel) => {
    const values = settingsFormValues({
      ...baseProfile,
      tvhKrTariff: { payGroup: "KR5", payLevel, fullTimeWeeklyMinutes: 2400 },
    });
    expect(values.salaryMode).toBe("TVH_KR");
    expect(values.tvhPayGroup).toBe("KR5");
    expect(values.tvhPayLevel).toBe(payLevel);
    expect(values.fullTimeHours).toBe("40");
  });
});

describe("TVA-L training settings projection", () => {
  it("restores the training year and explicit East selection", () => {
    const values = settingsFormValues({
      ...baseProfile,
      tvalPflegeTariff: { trainingYear: 3, universityRegion: "EAST" },
    });
    expect(values).toMatchObject({
      salaryMode: "TVAL_PFLEGE",
      trainingYear: 3,
      tvlUniversityRegion: "EAST",
    });
  });
});

describe("conflicting salary drafts", () => {
  const profile: UserProfile = {
    ...baseProfile,
    salaryBasisConflict: {
      tariff: {
        payGroup: "P11",
        payLevel: 5,
        sector: "BT_B",
        tariffRegion: "OTHER",
        fullTimeWeeklyMinutes: 2340,
      },
      vkaETariff: { payGroup: "E9b", payLevel: 3, sector: "BT_K", tariffRegion: "OTHER" },
      nursingTrainingTariff: { trainingYear: 3, sector: "BT_K", tariffRegion: "OTHER" },
      manualMonthlyGrossCents: 345050,
    },
  };
  it("keeps salary unselected and shows the selected basis's own stored values", () => {
    expect(settingsFormValues(profile).salaryMode).toBe("UNSET");
    expect(profileSalaryLabel(profile)).toBe("Gehaltsgrundlage prüfen");
    expect(settingsFormValuesForSalaryMode(profile, "TVOED_P")).toMatchObject({
      salaryMode: "TVOED_P",
      payGroup: "P11",
      payLevel: 5,
      sector: "BT_B",
    });
    expect(settingsFormValuesForSalaryMode(profile, "TVOED_E")).toMatchObject({
      salaryMode: "TVOED_E",
      ePayGroup: "E9b",
      payLevel: 3,
      sector: "BT_K",
    });
    expect(settingsFormValuesForSalaryMode(profile, "TVAOED_PFLEGE")).toMatchObject({
      salaryMode: "TVAOED_PFLEGE",
      trainingYear: 3,
    });
    expect(settingsFormValuesForSalaryMode(profile, "MANUAL")).toMatchObject({
      salaryMode: "MANUAL",
      manualMonthlyGross: "3450,50",
    });
    expect(settingsFormValuesForSalaryMode(profile, "UNSET").salaryMode).toBe("UNSET");
    expect(profile.salaryBasisConflict?.tariff?.payLevel).toBe(5);
  });
});
