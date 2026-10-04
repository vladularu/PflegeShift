import type { DatedRemunerationProfile } from "@/domain/remuneration-profile";
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
let mockRemunerationStatus: "ready" | "loading" | "error" = "ready";
let mockCurrentProfiles: readonly DatedRemunerationProfile[] = [];
jest.mock("@/application/remuneration-provider", () => ({
  useRemunerationHistory: () => ({
    status: mockRemunerationStatus,
    profiles: mockCurrentProfiles,
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
    mockRemunerationStatus = "ready";
    mockCurrentProfiles = [
      {
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
      },
    ];
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
  it("uses the dated tariff rather than the legacy manual amount in both summary and assessment link", async () => {
    const screen = await render(<WorkProfileScreen />);
    expect(screen.getByText(/P5.*Stufe 1/)).toBeTruthy();
    expect(screen.queryByText(/3\.450/)).toBeNull();
    await fireEvent.press(screen.getByText("Schichtmodell"));
    expect(router.push).toHaveBeenLastCalledWith(
      expect.objectContaining({ pathname: "/tariff-assessment" }),
    );
    mockRemunerationStatus = "loading";
    await screen.rerender(<WorkProfileScreen />);
    expect(screen.queryByText(/P5.*Stufe 1/)).toBeNull();
    expect(screen.queryByText("Schichtmodell")).toBeNull();
  });
});
