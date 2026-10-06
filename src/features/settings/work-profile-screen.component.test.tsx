import { fireEvent, render } from "@testing-library/react-native";
import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { router } from "expo-router";
import type { UserProfile } from "@/domain/types";
import { WorkProfileScreen } from "./work-profile-screen";
import { LIGHT_PALETTE } from "@/theme/palette-values";
let mockProfile: UserProfile;
const mockPalette = LIGHT_PALETTE;
jest.mock("@/application/pflegeshift-provider", () => ({
  usePflegeShiftProfile: () => ({ profile: mockProfile }),
  usePflegeShiftStatus: () => ({ ready: true, error: null }),
  usePflegeShiftTariff: () => ({ workPatternSettings: { workplaceCoverage: "UNKNOWN" } }),
}));
jest.mock("@/theme/palette", () => ({ usePalette: () => mockPalette }));
jest.mock("expo-router", () => ({
  router: { push: jest.fn(), back: jest.fn() },
  Stack: { Screen: () => null },
}));
describe("work profile overview", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockProfile = {
      displayName: "Alex",
      employerName: "Klinikum",
      federalState: "NW",
      holidayRegion: "NONE",
      weeklyMinutes: 2310,
      timeZone: "Europe/Berlin",
      regularRotatingNightWork: null,
      sundayHolidayWorkEligible: null,
      allEmploymentWorkRecorded: null,
      manualMonthlyGrossCents: 345000,
      tariff: null,
      createdAt: "2026-09-20T00:00:00Z",
      updatedAt: "2026-09-20T00:00:00Z",
    };
  });
  it("shows saved summaries without inputs or save and opens normal editors", async () => {
    const screen = await render(<WorkProfileScreen />);
    expect(screen.getByText("Alex\nKlinikum")).toBeTruthy();
    expect(screen.getByText(/38,5 Std.\/Woche/)).toBeTruthy();
    expect(screen.getByText(/3.450/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Speichern/ })).toBeNull();
    expect(screen.queryByLabelText("Name")).toBeNull();
    for (const [row, section] of [
      ["Name & Arbeitgeber", "PERSONAL"],
      ["Arbeitszeit & Arbeitsort", "WORK"],
      ["Tarif & Gehalt", "TARIFF"],
    ]) {
      await fireEvent.press(screen.getByText(row));
      expect(router.push).toHaveBeenLastCalledWith({
        pathname: "/settings-editor",
        params: { section },
      });
    }
  });
  it("refreshes the summary from saved profile and only warns for explicit state metadata", async () => {
    const screen = await render(<WorkProfileScreen />);
    mockProfile = {
      ...mockProfile,
      displayName: "Andrea",
      weeklyMinutes: 1800,
      manualMonthlyGrossCents: null,
      tvUkNursingTariff: { payGroup: "PUK8", payLevel: 4 },
    };
    await screen.rerender(<WorkProfileScreen />);
    expect(screen.getByText("Andrea\nKlinikum")).toBeTruthy();
    expect(screen.getByText(/30 Std.\/Woche/)).toBeTruthy();
    expect(screen.getByText(/TV-UK P-UK8/)).toBeTruthy();
    expect(screen.getByText(/Tarifregion Baden-Württemberg/)).toBeTruthy();
    mockProfile = { ...mockProfile, federalState: "BW" };
    await screen.rerender(<WorkProfileScreen />);
    expect(screen.queryByText(/unterscheiden sich/)).toBeNull();
  });
  it("offers one clearly named identity editor and a bottom return to More", async () => {
    const screen = await render(<WorkProfileScreen />);
    expect(screen.queryByRole("button", { name: /^Name$/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /^Arbeitgeber$/ })).toBeNull();
    await fireEvent.press(screen.getByText("Name & Arbeitgeber"));
    expect(router.push).toHaveBeenCalledTimes(1);
    await fireEvent.press(screen.getByRole("button", { name: "Zurück zu Mehr" }));
    expect(router.back).toHaveBeenCalledTimes(1);
  });
  it("keeps missing personal values explicit without changing the saved profile", async () => {
    mockProfile = { ...mockProfile, displayName: null, employerName: null };
    const screen = await render(<WorkProfileScreen />);
    expect(screen.getByText("Name nicht hinterlegt\nArbeitgeber nicht hinterlegt")).toBeTruthy();
    expect(mockProfile.displayName).toBeNull();
    expect(mockProfile.employerName).toBeNull();
  });
});
