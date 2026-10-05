import type { UserProfile } from "@/domain/types";
import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { act, fireEvent, render } from "@testing-library/react-native";
import { ActionSheetIOS } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { SettingsEditorScreen } from "./settings-editor-screen";
import { LIGHT_PALETTE } from "@/theme/palette-values";

const mockUpdateProfile = jest.fn<() => Promise<void>>();
const mockPalette = LIGHT_PALETTE;
let mockSection = "TARIFF";
let mockProfile: UserProfile;
const baseProfile: UserProfile = {
  federalState: "NW",
  holidayRegion: "NONE",
  weeklyMinutes: 2310,
  timeZone: "Europe/Berlin",
  industry: "HEALTHCARE",
  tariff: null,
  manualMonthlyGrossCents: null,
  regularRotatingNightWork: false,
  sundayHolidayWorkEligible: true,
  allEmploymentWorkRecorded: true,
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
};
const trainee = {
  trainingYear: 2 as const,
  sector: "BT_K" as const,
  tariffRegion: "OTHER" as const,
};

jest.mock("expo-router", () => ({
  router: { back: jest.fn() },
  useLocalSearchParams: () => ({ section: mockSection }),
  Stack: {
    Screen: ({ options }: { options: { headerRight?: () => React.ReactNode } }) =>
      options.headerRight?.() ?? null,
  },
}));
jest.mock("@/theme/palette", () => ({ usePalette: () => mockPalette }));
jest.mock("@/application/pflegeshift-provider", () => ({
  usePflegeShiftStatus: () => ({ ready: true, error: null }),
  usePflegeShiftProfile: () => ({
    updateProfile: mockUpdateProfile,
    profile: mockProfile,
  }),
}));
jest.mock("@/ui/form-layout", () => {
  const { Button, Text } = jest.requireActual<typeof import("react-native")>("react-native");
  return {
    FormScreen: ({ children }: React.PropsWithChildren) => children,
    FormSection: ({ children }: React.PropsWithChildren) => children,
    FormStatus: ({ error }: { error: string | null }) => (error ? <Text>{error}</Text> : null),
    HeaderSaveAction: ({ onPress }: { onPress: () => void }) => (
      <Button title="Speichern" onPress={onPress} />
    ),
  };
});

function editor() {
  return (
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 430, height: 932 },
        insets: { top: 59, right: 0, bottom: 34, left: 0 },
      }}
    >
      <SettingsEditorScreen />
    </SafeAreaProvider>
  );
}
type Screen = Awaited<ReturnType<typeof render>>;
async function select(screen: Screen, field: string, option: string) {
  const picker = jest
    .spyOn(ActionSheetIOS, "showActionSheetWithOptions")
    .mockImplementation(() => {});
  await fireEvent.press(screen.getByRole("button", { name: new RegExp(`^${field}:`) }));
  const [options, callback] = picker.mock.calls[picker.mock.calls.length - 1];
  expect(options.options).toContain(option);
  await act(() => callback(options.options.indexOf(option)));
  return options.options;
}

const e = {
  payGroup: "E9b" as const,
  payLevel: 4 as const,
  sector: "BT_K" as const,
  tariffRegion: "OTHER" as const,
};
describe("simple E table salary form", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUpdateProfile.mockResolvedValue(undefined);
    mockSection = "TARIFF";
    mockProfile = { ...baseProfile, vkaETariff: e };
  });
  it("reopens the saved E choice in familiar group/step controls and saves no history/date", async () => {
    const screen = await render(editor());
    expect(screen.getByRole("button", { name: "Berechnung: TVöD · E-Tabelle" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Entgeltgruppe: E9b" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Stufe: Stufe 4" })).toBeTruthy();
    expect(
      screen.queryByText(/Geburtsdatum|Gültig ab|Vergütungsstände|Frühere Angaben/),
    ).toBeNull();
    await fireEvent.press(screen.getByRole("button", { name: "Speichern" }));
    expect(mockUpdateProfile).toHaveBeenCalledWith(
      expect.objectContaining({
        vkaETariff: e,
        tariff: null,
        nursingTrainingTariff: null,
        manualMonthlyGrossCents: null,
      }),
    );
  });
  it("lets a trainee explicitly choose E12 and step6", async () => {
    mockProfile = { ...baseProfile, nursingTrainingTariff: trainee };
    const screen = await render(editor());
    await select(screen, "Berechnung", "TVöD · E-Tabelle");
    const groups = await select(screen, "Entgeltgruppe", "E12");
    expect(groups).toContain("E9c");
    expect(groups).toContain("E15");
    await select(screen, "Stufe", "Stufe 6");
    expect(screen.queryByRole("button", { name: /^Ausbildungsjahr:/ })).toBeNull();
    await fireEvent.press(screen.getByRole("button", { name: "Speichern" }));
    expect(mockUpdateProfile).toHaveBeenCalledWith(
      expect.objectContaining({
        vkaETariff: { ...e, payGroup: "E12", payLevel: 6 },
        nursingTrainingTariff: null,
        tariff: null,
      }),
    );
  });
  it("requires a valid step after choosing E1 and removes its nonexistent step1", async () => {
    mockProfile = { ...baseProfile, vkaETariff: { ...e, payLevel: 1 } };
    const screen = await render(editor());
    await select(screen, "Entgeltgruppe", "E1");
    await fireEvent.press(screen.getByRole("button", { name: "Speichern" }));
    expect(mockUpdateProfile).not.toHaveBeenCalled();
    const options = await select(screen, "Stufe", "Stufe 2");
    expect(options).not.toContain("Stufe 1");
    await fireEvent.press(screen.getByRole("button", { name: "Speichern" }));
    expect(mockUpdateProfile).toHaveBeenCalledWith(
      expect.objectContaining({ vkaETariff: { ...e, payGroup: "E1", payLevel: 2 } }),
    );
  });
  it("normalizes an E step1 when returning to a P8 selection", async () => {
    mockProfile = { ...baseProfile, vkaETariff: { ...e, payLevel: 1 } };
    const screen = await render(editor());
    await select(screen, "Berechnung", "TVöD-P");
    await fireEvent.press(screen.getByRole("button", { name: "Speichern" }));
    expect(mockUpdateProfile).not.toHaveBeenCalled();
    await select(screen, "Stufe", "Stufe 4");
    await fireEvent.press(screen.getByRole("button", { name: "Speichern" }));
    expect(mockUpdateProfile).toHaveBeenCalledWith(
      expect.objectContaining({
        vkaETariff: null,
        tariff: expect.objectContaining({ payGroup: "P8", payLevel: 4 }),
      }),
    );
  });
  it.each([
    ["BT_K", "KAV_BW", "39"],
    ["BT_B", "OTHER", "39"],
  ] as ["BT_K" | "BT_B", "KAV_BW" | "OTHER", string][])(
    "derives the correct full-time display for %s/%s",
    async (sector, tariffRegion, hours) => {
      mockProfile = { ...baseProfile, vkaETariff: { ...e, sector, tariffRegion } };
      const screen = await render(editor());
      expect(screen.getByLabelText("Tarifliche Vollzeit pro Woche").props.value).toBe(hours);
    },
  );
  it("retains E salary on work model changes", async () => {
    mockSection = "WORK";
    const screen = await render(editor());
    await fireEvent.changeText(screen.getByLabelText("Wochenarbeitszeit in Stunden"), "30");
    await fireEvent.press(screen.getByRole("button", { name: "Speichern" }));
    expect(mockUpdateProfile).toHaveBeenCalledWith(
      expect.objectContaining({ weeklyMinutes: 1800, vkaETariff: e, tariff: null }),
    );
  });
});
