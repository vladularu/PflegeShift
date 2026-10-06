import type { UserProfile } from "@/domain/types";
import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { fireEvent, render } from "@testing-library/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import {
  SettingsEditorTestFlow,
  chooseTariffGroup,
  selectSettingsChoice as select,
} from "./settings-choice-test-helpers";
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

jest.mock("expo-router/react-navigation", () => ({ usePreventRemove: jest.fn() }));
jest.mock("expo-router", () => ({
  router: { back: jest.fn(), push: jest.fn() },
  useNavigation: () => ({ dispatch: jest.fn() }),
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
      <SettingsEditorTestFlow />
    </SafeAreaProvider>
  );
}

const uk = { payGroup: "PUK8" as const, payLevel: 7 as const };
describe("TV-UK in the familiar simple salary form", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUpdateProfile.mockResolvedValue(undefined);
    mockSection = "TARIFF";
    mockProfile = { ...baseProfile, federalState: "BW", tvUkNursingTariff: uk };
  });
  it("reopens P-UK and seventh stage with fixed 38.5 hours and no unrelated controls", async () => {
    const screen = await render(editor());
    expect(
      screen.getByRole("button", { name: "Tarifvertrag: TV-UK Pflege · Baden-Württemberg" }),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "Entgeltgruppe: P-UK8" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Stufe: Stufe 7" })).toBeTruthy();
    expect(screen.getAllByText("38,5 Std.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^Einrichtung:|^Tarifregion:/ })).toBeNull();
    expect(
      screen.queryByText(/Geburtsdatum|Gültig ab|Vergütungsstände|Frühere Angaben/),
    ).toBeNull();
    await fireEvent.press(screen.getByRole("button", { name: "Speichern" }));
    expect(mockUpdateProfile).toHaveBeenCalledWith(
      expect.objectContaining({
        tvUkNursingTariff: uk,
        tariff: null,
        vkaETariff: null,
        tvlKrTariff: null,
        nursingTrainingTariff: null,
        manualMonthlyGrossCents: null,
      }),
    );
  });
  it("offers P-UK9L and requires a valid stage after leaving stage 7", async () => {
    const screen = await render(editor());
    const groups = await select(screen, "Entgeltgruppe", "P-UK9L");
    expect(groups).toContain("P-UK5");
    expect(groups).toContain("P-UK15");
    expect(groups).not.toContain("KR8");
    expect(groups).not.toContain("P8");
    await fireEvent.press(screen.getByRole("button", { name: "Speichern" }));
    expect(mockUpdateProfile).not.toHaveBeenCalled();
    expect(screen.getByText(/Bitte eine gültige Stufe/)).toBeTruthy();
    const levels = await select(screen, "Stufe", "Stufe 6");
    expect(levels).not.toContain("Stufe 7");
    expect(levels).not.toContain("Stufe 1");
    await fireEvent.press(screen.getByRole("button", { name: "Speichern" }));
    expect(mockUpdateProfile).toHaveBeenCalledWith(
      expect.objectContaining({ tvUkNursingTariff: { payGroup: "PUK9L", payLevel: 6 } }),
    );
  });
  it("offers stage 1 in P-UK5 and stage 7 in P-UK9 with their exact valid choices", async () => {
    const screen = await render(editor());
    await select(screen, "Entgeltgruppe", "P-UK5");
    const low = await select(screen, "Stufe", "Stufe 1");
    expect(low).not.toContain("Stufe 7");
    await select(screen, "Entgeltgruppe", "P-UK9");
    const high = await select(screen, "Stufe", "Stufe 7");
    expect(high).not.toContain("Stufe 1");
    expect(high).not.toContain("Stufe 2");
    await fireEvent.press(screen.getByRole("button", { name: "Speichern" }));
    expect(mockUpdateProfile).toHaveBeenCalledWith(
      expect.objectContaining({ tvUkNursingTariff: { payGroup: "PUK9", payLevel: 7 } }),
    );
  });
  it("preserves the UK choice while editing work hours", async () => {
    mockSection = "WORK";
    const screen = await render(editor());
    await fireEvent.changeText(screen.getByLabelText("Deine Wochenstunden (Std.)"), "30");
    await fireEvent.press(screen.getByRole("button", { name: "Speichern" }));
    expect(mockUpdateProfile).toHaveBeenCalledWith(
      expect.objectContaining({ tvUkNursingTariff: uk, weeklyMinutes: 1800, tariff: null }),
    );
  });
  it.each(["TVöD-P", "TVöD VKA · E-Tabelle", "TV-L Pflege"])(
    "switches to %s without leaking seventh stage",
    async (name) => {
      const screen = await render(editor());
      await select(screen, "Berechnung", name);
      await chooseTariffGroup(screen, name);
      const choices = await select(screen, "Stufe", "Stufe 4");
      expect(choices).not.toContain("Stufe 7");
      await fireEvent.press(screen.getByRole("button", { name: "Speichern" }));
      expect(mockUpdateProfile).toHaveBeenCalledWith(
        expect.objectContaining({ tvUkNursingTariff: null }),
      );
    },
  );
  it("keeps the UK choice when switching away and back before saving", async () => {
    const screen = await render(editor());
    await select(screen, "Berechnung", "TVöD-P");
    await select(screen, "Berechnung", "TV-UK Pflege · Baden-Württemberg");
    expect(screen.getByRole("button", { name: "Stufe: Stufe 7" })).toBeTruthy();
  });
  it("switches to Ausbildung with only its own required fields", async () => {
    const screen = await render(editor());
    await select(screen, "Berechnung", "TVAöD Pflege · Ausbildung");
    await select(screen, "Ausbildungsjahr", "2. Ausbildungsjahr");
    expect(screen.queryByRole("button", { name: /^Entgeltgruppe:/ })).toBeNull();
    await fireEvent.press(screen.getByRole("button", { name: "Speichern" }));
    expect(mockUpdateProfile).toHaveBeenCalledWith(
      expect.objectContaining({
        tvUkNursingTariff: null,
        nursingTrainingTariff: expect.objectContaining({ trainingYear: 2 }),
      }),
    );
  });
  it("switches to manual pay without any UK group or region", async () => {
    const screen = await render(editor());
    await select(screen, "Berechnung", "Monatsbrutto selbst eintragen");
    await fireEvent.changeText(screen.getByLabelText("Monatliches Brutto in Euro"), "1800");
    expect(screen.queryByRole("button", { name: /^Entgeltgruppe:|^Tarifregion:/ })).toBeNull();
    await fireEvent.press(screen.getByRole("button", { name: "Speichern" }));
    expect(mockUpdateProfile).toHaveBeenCalledWith(
      expect.objectContaining({ tvUkNursingTariff: null, manualMonthlyGrossCents: 180000 }),
    );
  });
  it("does not silently scale above the contracted full-time basis", async () => {
    mockProfile = { ...mockProfile, weeklyMinutes: 2400 };
    const screen = await render(editor());
    await fireEvent.press(screen.getByRole("button", { name: "Speichern" }));
    expect(mockUpdateProfile).not.toHaveBeenCalled();
    expect(screen.getByText(/Wochenstunden liegen über der tariflichen Vollzeit/)).toBeTruthy();
  });
});
