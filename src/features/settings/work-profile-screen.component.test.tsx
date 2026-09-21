import { fireEvent, render, waitFor } from "@testing-library/react-native";
import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { router } from "expo-router";
import type { UserProfile, SaveProfileInput } from "@/domain/types";
import { WorkProfileScreen } from "./work-profile-screen";
import { DARK_PALETTE, LIGHT_PALETTE } from "@/theme/palette-values";

const mockUpdate = jest.fn<(_input: SaveProfileInput) => Promise<UserProfile>>();
const mockProfile: UserProfile = {
  displayName: "Alex",
  employerName: "Klinikum",
  federalState: "NW",
  holidayRegion: "NONE",
  weeklyMinutes: 2310,
  timeZone: "Europe/Berlin",
  manualMonthlyGrossCents: 345000,
  regularRotatingNightWork: null,
  sundayHolidayWorkEligible: null,
  allEmploymentWorkRecorded: null,
  tariff: null,
  createdAt: "2026-09-20T00:00:00Z",
  updatedAt: "2026-09-20T00:00:00Z",
};
let mockPalette = LIGHT_PALETTE;
jest.mock("@/application/pflegeshift-provider", () => ({
  usePflegeShiftProfile: () => ({ profile: mockProfile, updateProfile: mockUpdate }),
  usePflegeShiftStatus: () => ({ ready: true, error: null }),
  usePflegeShiftTariff: () => ({ workPatternSettings: { workplaceCoverage: "UNKNOWN" } }),
}));
jest.mock("@/theme/palette", () => ({
  ...jest.requireActual<typeof import("@/theme/palette")>("@/theme/palette"),
  usePalette: () => mockPalette,
}));
jest.mock("expo-router", () => ({
  router: { push: jest.fn() },
  Stack: {
    Screen: ({ options }: { options: { headerRight?: () => React.ReactNode } }) =>
      options.headerRight?.() ?? null,
  },
}));
describe("work profile", () => {
  beforeEach(() => {
    mockPalette = LIGHT_PALETTE;
    mockUpdate.mockReset().mockResolvedValue(mockProfile);
  });
  it("keeps drafts on theme changes and preserves calculation fields when saving identity", async () => {
    const screen = await render(<WorkProfileScreen />);
    await fireEvent.changeText(screen.getByLabelText("Name"), "  Andrea  ");
    mockPalette = DARK_PALETTE;
    await screen.rerender(<WorkProfileScreen />);
    expect(screen.getByLabelText("Name").props.value).toBe("  Andrea  ");
    await fireEvent.press(screen.getByRole("button", { name: "Speichern" }));
    await waitFor(() => expect(screen.getByText("Profil gespeichert.")).toBeTruthy());
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        displayName: "Andrea",
        employerName: "Klinikum",
        weeklyMinutes: 2310,
        manualMonthlyGrossCents: 345000,
      }),
    );
    await fireEvent.press(screen.getByText("Tarif & Gehalt"));
    expect(router.push).toHaveBeenCalledWith({
      pathname: "/settings-editor",
      params: { section: "TARIFF" },
    });
  });
  it("retains entered values after a save failure", async () => {
    mockUpdate.mockRejectedValueOnce(new Error("storage"));
    const screen = await render(<WorkProfileScreen />);
    await fireEvent.changeText(screen.getByLabelText("Arbeitgeber"), "Neue Klinik");
    await fireEvent.press(screen.getByRole("button", { name: "Speichern" }));
    await waitFor(() =>
      expect(screen.getByText("Profil konnte nicht gespeichert werden.")).toBeTruthy(),
    );
    expect(screen.getByLabelText("Arbeitgeber").props.value).toBe("Neue Klinik");
  });
});
