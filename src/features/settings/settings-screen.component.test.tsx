import { render } from "@testing-library/react-native";
import { describe, expect, it, jest } from "@jest/globals";

import { SettingsScreen } from "@/features/settings/settings-screen";
import {
  isDeveloperModeEnabled,
  setDeveloperMode,
} from "@/infrastructure/database/dev-tools-repository";

jest.mock("expo-sqlite", () => ({
  useSQLiteContext: () => ({}),
}));

jest.mock("expo-router", () => ({
  router: { push: jest.fn() },
}));

jest.mock("@/application/medishift-provider", () => ({
  useMediShiftStatus: () => ({ error: null, ready: true, reload: jest.fn() }),
  useMediShiftProfile: () => ({
    profile: {
      federalState: "NW",
      weeklyMinutes: 2_400,
      timeZone: "Europe/Berlin",
      tariff: null,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    },
  }),
  useMediShiftTariff: () => ({
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
  it("ignores stale developer preferences and exposes no activation path", async () => {
    const screen = await render(<SettingsScreen />);

    expect(screen.queryByText("Intern")).toBeNull();
    expect(screen.queryByText("Testlabor")).toBeNull();
    expect(isDeveloperModeEnabled).not.toHaveBeenCalled();
    expect(setDeveloperMode).not.toHaveBeenCalled();
    expect(screen.getByText("Über MediShift")).toBeTruthy();
  });
});
