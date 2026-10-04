import type { DatedRemunerationProfile } from "@/domain/remuneration-profile";
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
let mockRemunerationStatus: "ready" | "loading" | "error" = "ready";
let mockCurrentProfiles: readonly DatedRemunerationProfile[] | null = null;
jest.mock("@/application/remuneration-provider", () => ({
  useRemunerationHistory: () => ({
    status: mockRemunerationStatus,
    profiles: mockCurrentProfiles ?? [
      {
        effectiveFrom: "2026-01-01",
        revision: 1,
        data: {
          version: 1,
          weeklyMinutes: mockProfile.weeklyMinutes,
          selection:
            mockProfile.manualMonthlyGrossCents === null
              ? { kind: "unconfigured" }
              : { kind: "own-monthly", monthlyGrossCents: mockProfile.manualMonthlyGrossCents },
        },
      },
    ],
    error: null,
  }),
}));
jest.mock("@/application/rule-catalog-runtime-provider", () => ({
  useRuleCatalogRuntime: () => ({
    resolver:
      jest.requireActual<typeof import("@/rules/rule-resolver")>("@/rules/rule-resolver")
        .bundledRuleResolver,
  }),
}));

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
  it("opens the personal profile and appearance selection", async () => {
    const screen = await render(<SettingsScreen />);
    await fireEvent.press(screen.getByRole("button", { name: "Arbeitsprofil bearbeiten" }));
    expect(router.push).toHaveBeenCalledWith("/work-profile");
    await fireEvent.press(screen.getByText("Darstellung"));
    expect(router.push).toHaveBeenCalledWith("/appearance");
  });
  beforeEach(() => {
    mockProfile = { ...mockBaseProfile };
    mockDevToolsAvailable = false;
    mockFontScale = 1;
    mockCurrentProfiles = null;
    mockRemunerationStatus = "ready";
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
    expect(descriptionsChecked).toBeGreaterThanOrEqual(9);
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
    expect(screen.getByText("Dein Arbeitsprofil")).toBeTruthy();
    expect(screen.queryByText("Schichtmodell")).toBeNull();
  });

  it("shows a manual monthly gross without TVöD-only settings", async () => {
    mockProfile = { ...mockBaseProfile, manualMonthlyGrossCents: 345_050 };

    const screen = await render(<SettingsScreen />);

    expect(screen.getByText(/Eigenes Monatsentgelt.*3\.450,50/)).toBeTruthy();
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
  it("keeps training optional and opens it independently of developer mode", async () => {
    const screen = await render(<SettingsScreen />);
    expect(screen.queryByText("Ausbildung & Alter")).toBeNull();
    await fireEvent.press(screen.getByText("Zusätzliche Angaben"));
    await fireEvent.press(screen.getByText("Ausbildung & Alter"));
    expect(router.push).toHaveBeenLastCalledWith("/training");
    expect(screen.queryByText("Testlabor")).toBeNull();
  });
  it("shows dated P5 content and then changed P6 content at the same revision", async () => {
    mockProfile = { ...mockBaseProfile, manualMonthlyGrossCents: 345050 };
    const entry: DatedRemunerationProfile = {
      effectiveFrom: "2026-01-01",
      revision: 1,
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-01T00:00:00Z",
      data: {
        version: 1,
        weeklyMinutes: 2310,
        selection: {
          kind: "tariff",
          packageId: "tvoed-vka-bt-k",
          variant: "BT_K",
          region: "OTHER",
          group: "P5",
          level: "1",
          fullTimeWeeklyMinutes: 2310,
        },
      },
    };
    mockCurrentProfiles = [entry];
    const screen = await render(<SettingsScreen />);
    expect(screen.getByText(/P5.*Stufe 1/)).toBeTruthy();
    expect(screen.queryByText(/3\.450,50/)).toBeNull();
    mockCurrentProfiles = [
      {
        ...entry,
        data: {
          ...entry.data,
          selection: {
            ...entry.data.selection,
            kind: "tariff",
            packageId: "tvoed-vka-bt-k",
            variant: "BT_K",
            region: "OTHER",
            group: "P6",
            level: "1",
            fullTimeWeeklyMinutes: 2310,
          },
        },
      },
    ];
    await screen.rerender(<SettingsScreen />);
    expect(screen.getByText(/P6.*Stufe 1/)).toBeTruthy();
    expect(screen.queryByText(/P5.*Stufe 1/)).toBeNull();
  });
  it.each(["loading", "error"] as const)(
    "hides stored money when remuneration is %s",
    async (status) => {
      mockProfile = { ...mockBaseProfile, manualMonthlyGrossCents: 345050 };
      const screen = await render(<SettingsScreen />);
      mockRemunerationStatus = status;
      await screen.rerender(<SettingsScreen />);
      expect(screen.queryByText(/3\.450,50/)).toBeNull();
      expect(
        screen.getByText(
          status === "loading" ? "Vergütung wird geladen …" : "Vergütungsstand nicht verfügbar",
        ),
      ).toBeTruthy();
    },
  );
});
