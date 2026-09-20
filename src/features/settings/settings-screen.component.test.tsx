import { fireEvent, render, within } from "@testing-library/react-native";
import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { router } from "expo-router";

import { SettingsScreen } from "@/features/settings/settings-screen";
import { SPACING } from "@/theme/tokens";
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
let mockDevToolsAvailable = false;
let mockFontScale = 1;

jest.mock("react-native/Libraries/Utilities/useWindowDimensions", () => ({
  __esModule: true,
  default: () => ({ width: 430, height: 932, scale: 3, fontScale: mockFontScale }),
}));

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
  get DEV_TOOLS_AVAILABLE() {
    return mockDevToolsAvailable;
  },
}));

describe("SettingsScreen production gates", () => {
  beforeEach(() => {
    mockProfile = { ...mockBaseProfile };
    mockDevToolsAvailable = false;
    mockFontScale = 1;
  });

  it.each([1, 1.29, 1.3, 2, 3.1])("adapts all More rows at font scale %s", async (fontScale) => {
    mockFontScale = fontScale;
    mockDevToolsAvailable = true;
    jest.mocked(isDeveloperModeEnabled).mockResolvedValue(true);
    const screen = await render(<SettingsScreen />);
    const rows = screen.getAllByRole("button");
    expect(rows.length).toBeGreaterThan(10);
    let descriptionsChecked = 0;
    for (const row of rows) {
      const texts = within(row)
        .getAllByText(/.+/)
        .filter((text) => text.props.maxFontSizeMultiplier === 0);
      if (texts.length === 2) {
        descriptionsChecked += 1;
        expect(texts[1].parent).toHaveStyle({ gap: fontScale >= 1.3 ? SPACING.sm : SPACING.xxs });
      }
    }
    expect(descriptionsChecked).toBeGreaterThan(10);
    expect(screen.getByText("Testlabor")).toBeTruthy();
    expect(screen.getByText("Kalenderdiagnose starten")).toBeTruthy();
  });

  it("reacts to font size changes while More stays open", async () => {
    const screen = await render(<SettingsScreen />);
    for (const fontScale of [3.1, 1]) {
      mockFontScale = fontScale;
      await screen.rerender(<SettingsScreen />);
      const subtitle = screen.getByText("SQLite · ausschließlich auf diesem Gerät");
      expect(subtitle.parent).toHaveStyle({ gap: fontScale >= 1.3 ? SPACING.sm : SPACING.xxs });
    }
    await fireEvent.press(screen.getByText("Lokale Datenspeicherung"));
    expect(router.push).toHaveBeenCalledWith({
      pathname: "/info-details",
      params: { section: "STORAGE" },
    });
  });

  it("ignores stale developer preferences and exposes no activation path", async () => {
    const screen = await render(<SettingsScreen />);

    expect(screen.queryByText("Intern")).toBeNull();
    expect(screen.queryByText("Testlabor")).toBeNull();
    expect(screen.queryByText("Onboarding testen")).toBeNull();
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

  it("opens a non-persisting onboarding preview in internal builds", async () => {
    mockDevToolsAvailable = true;
    jest.mocked(isDeveloperModeEnabled).mockResolvedValue(false);
    const screen = await render(<SettingsScreen />);
    await fireEvent.press(screen.getByText("Onboarding testen"));
    expect(router.push).toHaveBeenCalledWith({ pathname: "/onboarding", params: { preview: "1" } });
    expect(screen.queryByText("Testlabor")).toBeNull();
  });
});
