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

describe("simple nursing training salary form", () => {
  it("uses the trainee full-time basis for Baden-Württemberg when reopening a saved selection", async () => {
    mockProfile = {
      ...baseProfile,
      federalState: "BW",
      nursingTrainingTariff: { ...trainee, tariffRegion: "KAV_BW" },
    };
    const screen = await render(editor());
    expect(screen.getByLabelText("Tarifliche Vollzeit pro Woche").props.value).toBe("38,5");
  });
  beforeEach(() => {
    jest.clearAllMocks();
    mockUpdateProfile.mockResolvedValue(undefined);
    mockSection = "TARIFF";
    mockProfile = { ...baseProfile, nursingTrainingTariff: trainee };
  });
  it("shows the saved year instead of employee group, step or dated history fields", async () => {
    const screen = await render(editor());
    expect(
      screen.getByRole("button", { name: "Ausbildungsjahr: 2. Ausbildungsjahr" }),
    ).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^Entgeltgruppe:/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /^Stufe:/ })).toBeNull();
    expect(
      screen.queryByText(/Geburtsdatum|Gültig ab|Vergütungsstände|Frühere Angaben/),
    ).toBeNull();
    await fireEvent.press(screen.getByRole("button", { name: "Speichern" }));
    expect(mockUpdateProfile).toHaveBeenCalledWith(
      expect.objectContaining({
        tariff: null,
        manualMonthlyGrossCents: null,
        nursingTrainingTariff: trainee,
      }),
    );
  });
  it("lets an existing employee select nursing training and requires an explicit year", async () => {
    mockProfile = {
      ...baseProfile,
      tariff: {
        payGroup: "P8",
        payLevel: 4,
        sector: "BT_K",
        tariffRegion: "OTHER",
        fullTimeWeeklyMinutes: 2310,
      },
    };
    const screen = await render(editor());
    await select(screen, "Berechnung", "TVAöD Pflege · Ausbildung");
    await fireEvent.press(screen.getByRole("button", { name: "Speichern" }));
    expect(mockUpdateProfile).not.toHaveBeenCalled();
    expect(screen.getByText("Bitte das Ausbildungsjahr wählen.")).toBeTruthy();
    await select(screen, "Ausbildungsjahr", "3. Ausbildungsjahr");
    await fireEvent.press(screen.getByRole("button", { name: "Speichern" }));
    expect(mockUpdateProfile).toHaveBeenCalledWith(
      expect.objectContaining({
        tariff: null,
        manualMonthlyGrossCents: null,
        nursingTrainingTariff: { ...trainee, trainingYear: 3 },
      }),
    );
  });
  it.each(["OTHER", "KAV_BW"] as const)(
    "hides the trainee BT-B region %s and retains it when returning to BT-K",
    async (tariffRegion) => {
      const saved = { ...trainee, sector: "BT_B" as const, tariffRegion };
      mockProfile = { ...baseProfile, nursingTrainingTariff: saved };
      const screen = await render(editor());
      expect(screen.queryByRole("button", { name: /^Tarifgebiet:/ })).toBeNull();
      expect(
        screen.getByRole("button", { name: "Ausbildungsjahr: 2. Ausbildungsjahr" }),
      ).toBeTruthy();
      expect(screen.getByLabelText("Tarifliche Vollzeit pro Woche").props.value).toBe("39");
      await fireEvent.press(screen.getByRole("button", { name: "Speichern" }));
      expect(mockUpdateProfile).toHaveBeenLastCalledWith(
        expect.objectContaining({ nursingTrainingTariff: saved }),
      );
      await select(screen, "Tarifbereich", "Krankenhaus · BT-K");
      expect(screen.getByRole("button", { name: /^Tarifgebiet:/ })).toBeTruthy();
      expect(screen.getByLabelText("Tarifliche Vollzeit pro Woche").props.value).toBe("38,5");
      await fireEvent.press(screen.getByRole("button", { name: "Speichern" }));
      expect(mockUpdateProfile).toHaveBeenLastCalledWith(
        expect.objectContaining({ nursingTrainingTariff: { ...saved, sector: "BT_K" } }),
      );
      await select(screen, "Tarifbereich", "Pflege · BT-B");
      expect(screen.queryByRole("button", { name: /^Tarifgebiet:/ })).toBeNull();
    },
  );
  it("restores the saved BT-B region when changing a trainee to the P tariff", async () => {
    mockProfile = {
      ...baseProfile,
      nursingTrainingTariff: { ...trainee, sector: "BT_B", tariffRegion: "KAV_BW" },
    };
    const screen = await render(editor());
    expect(screen.queryByRole("button", { name: /^Tarifgebiet:/ })).toBeNull();
    await select(screen, "Berechnung", "TVöD-P");
    expect(screen.getByRole("button", { name: /^Tarifgebiet:/ })).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Speichern" }));
    expect(mockUpdateProfile).toHaveBeenLastCalledWith(
      expect.objectContaining({
        nursingTrainingTariff: null,
        tariff: expect.objectContaining({ sector: "BT_B", tariffRegion: "KAV_BW" }),
      }),
    );
    await select(screen, "Berechnung", "TVAöD Pflege · Ausbildung");
    expect(screen.queryByRole("button", { name: /^Tarifgebiet:/ })).toBeNull();
    expect(
      screen.getByRole("button", { name: "Ausbildungsjahr: 2. Ausbildungsjahr" }),
    ).toBeTruthy();
  });
  it("returns to the original employee fields and clears the training choice", async () => {
    const screen = await render(editor());
    await select(screen, "Berechnung", "TVöD-P");
    expect(screen.getByRole("button", { name: "Entgeltgruppe: P8" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Stufe: Stufe 4" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^Ausbildungsjahr:/ })).toBeNull();
    await fireEvent.press(screen.getByRole("button", { name: "Speichern" }));
    expect(mockUpdateProfile).toHaveBeenCalledWith(
      expect.objectContaining({
        nursingTrainingTariff: null,
        tariff: expect.objectContaining({ payGroup: "P8", payLevel: 4 }),
      }),
    );
  });
  it("preserves the trainee salary choice when editing the work model", async () => {
    mockSection = "WORK";
    const screen = await render(editor());
    await fireEvent.changeText(screen.getByLabelText("Wochenarbeitszeit in Stunden"), "30");
    await fireEvent.press(screen.getByRole("button", { name: "Speichern" }));
    expect(mockUpdateProfile).toHaveBeenCalledWith(
      expect.objectContaining({
        weeklyMinutes: 1800,
        nursingTrainingTariff: trainee,
        tariff: null,
      }),
    );
  });
});
