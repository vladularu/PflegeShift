import { render } from "@testing-library/react-native";
import { beforeEach, describe, expect, it, jest } from "@jest/globals";

import { SettingsScreen } from "@/features/settings/settings-screen";
import {
  isDeveloperModeEnabled,
  setDeveloperMode,
} from "@/infrastructure/database/dev-tools-repository";

const mockBaseProfile = {
  federalState: "NW",
  holidayRegion: "NONE",
  weeklyMinutes: 2_400,
  timeZone: "Europe/Berlin",
  manualMonthlyGrossCents: null as number | null,
  tariff: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};
let mockProfile = { ...mockBaseProfile };

jest.mock("expo-sqlite", () => ({
  useSQLiteContext: () => ({}),
}));

jest.mock("expo-router", () => ({
  router: { push: jest.fn() },
  useFocusEffect: (effect: () => void) => effect(),
}));

jest.mock("@/application/pflegeshift-provider", () => ({
  usePflegeShiftStatus: () => ({ error: null, ready: true, reload: jest.fn() }),
  usePflegeShiftProfile: () => ({
    profile: mockProfile,
  }),
  usePflegeShiftTariff: () => ({
    workPatternSettings: {
      workplaceCoverage: "UNKNOWN",
      assignment: "UNKNOWN",
      updatedAt: null,
    },
  }),
}));

jest.mock("@/features/calendar/calendar-preferences", () => ({
  useCalendarPreferences: () => ({
    viewMode: "MONTH",
    showShifts: true,
    showAppointments: true,
    showHolidays: true,
    labelMode: "FULL",
    showShiftTimes: false,
    showShiftDuration: false,
    error: null,
    saving: false,
    retry: jest.fn(),
  }),
}));

jest.mock("@/infrastructure/database/dev-tools-repository", () => ({
  isDeveloperModeEnabled: jest.fn(),
  setDeveloperMode: jest.fn(),
}));

jest.mock("@/infrastructure/dev-tools-policy", () => ({
  DEV_TOOLS_AVAILABLE: false,
}));

describe("SettingsScreen production gates", () => {
  beforeEach(() => {
    mockProfile = { ...mockBaseProfile };
  });

  it("ignores stale developer preferences and exposes no activation path", async () => {
    const screen = await render(<SettingsScreen />);

    expect(screen.queryByText("Intern")).toBeNull();
    expect(screen.queryByText("Testlabor")).toBeNull();
    expect(isDeveloperModeEnabled).not.toHaveBeenCalled();
    expect(setDeveloperMode).not.toHaveBeenCalled();
    expect(screen.getByText("Über LUNA Shift")).toBeTruthy();
    expect(screen.getByText("Datensicherung")).toBeTruthy();
    expect(screen.getByText("Gehalt")).toBeTruthy();
    expect(screen.queryByText("Schichtmodell")).toBeNull();
  });

  it("shows a manual monthly gross without TVöD-only settings", async () => {
    mockProfile = { ...mockBaseProfile, manualMonthlyGrossCents: 345_050 };

    const screen = await render(<SettingsScreen />);

    expect(screen.getByText(/Manuell.*3\.450,50/)).toBeTruthy();
    expect(screen.queryByText("Schichtmodell")).toBeNull();
  });
});
