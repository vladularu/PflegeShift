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

const h = {
  payGroup: "KR5" as const,
  payLevel: "1b" as const,
  fullTimeWeeklyMinutes: 2310 as const,
};
describe("TV-H in the existing simple salary form", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUpdateProfile.mockResolvedValue(undefined);
    mockSection = "TARIFF";
    mockProfile = { ...baseProfile, federalState: "HE", tvhKrTariff: h };
  });
  it("reopens the exact entry step without unrelated fields or dates", async () => {
    const screen = await render(editor());
    expect(screen.getByRole("button", { name: "Tarifvertrag: TV-H Pflege · Hessen" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Entgeltgruppe: KR5" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Stufe: Stufe 1b" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Vollzeit laut Tarif: 38,5 Std." })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^Einrichtung:|^Tarifregion:/ })).toBeNull();
    expect(screen.queryByText(/Geburtsdatum|Gültig ab|Vergütungsstände/)).toBeNull();
    await fireEvent.press(screen.getByRole("button", { name: "Speichern" }));
    expect(mockUpdateProfile).toHaveBeenCalledWith(
      expect.objectContaining({
        tvhKrTariff: h,
        tariff: null,
        tvUkNursingTariff: null,
        tvlKrTariff: null,
        vkaETariff: null,
        nursingTrainingTariff: null,
        manualMonthlyGrossCents: null,
      }),
    );
  });
  it("requires a valid higher-group stage after leaving 1b", async () => {
    const screen = await render(editor());
    const groups = await select(screen, "Entgeltgruppe", "KR8");
    expect(groups).toContain("KR16");
    expect(groups).not.toContain("KR17");
    expect(groups).not.toContain("PUK8");
    await fireEvent.press(screen.getByRole("button", { name: "Speichern" }));
    expect(mockUpdateProfile).not.toHaveBeenCalled();
    expect(screen.getByText(/Bitte eine gültige Stufe/)).toBeTruthy();
    const levels = await select(screen, "Stufe", "Stufe 4");
    expect(levels).not.toContain("Stufe 1a");
    expect(levels).not.toContain("Stufe 1b");
    expect(levels).not.toContain("Stufe 1");
    await fireEvent.press(screen.getByRole("button", { name: "Speichern" }));
    expect(mockUpdateProfile).toHaveBeenCalledWith(
      expect.objectContaining({ tvhKrTariff: { ...h, payGroup: "KR8", payLevel: 4 } }),
    );
  });
  it("offers both entry stages and only the two sourced full-time bases", async () => {
    const screen = await render(editor());
    await select(screen, "Entgeltgruppe", "KR6");
    const levels = await select(screen, "Stufe", "Stufe 1a");
    expect(levels).toContain("Stufe 1b");
    expect(levels).not.toContain("Stufe 1");
    const hours = await select(screen, "Tarifliche Vollzeit pro Woche", "40");
    expect(hours).toEqual(["38,5", "40"]);
    await fireEvent.press(screen.getByRole("button", { name: "Speichern" }));
    expect(mockUpdateProfile).toHaveBeenCalledWith(
      expect.objectContaining({
        tvhKrTariff: { payGroup: "KR6", payLevel: "1a", fullTimeWeeklyMinutes: 2400 },
        weeklyMinutes: 2310,
      }),
    );
  });
  it.each(["TVöD-P", "TVöD VKA · E-Tabelle", "TV-L Pflege", "TV-UK Pflege · Baden-Württemberg"])(
    "switches to %s without carrying the 1b stage",
    async (name) => {
      const screen = await render(editor());
      await select(screen, "Berechnung", name);
      await chooseTariffGroup(screen, name);
      const levels = await select(screen, "Stufe", "Stufe 4");
      expect(levels).not.toContain("Stufe 1a");
      expect(levels).not.toContain("Stufe 1b");
      await fireEvent.press(screen.getByRole("button", { name: "Speichern" }));
      expect(mockUpdateProfile).toHaveBeenCalledWith(
        expect.objectContaining({ tvhKrTariff: null }),
      );
    },
  );
  it("keeps TV-H settings when switching away and back before saving", async () => {
    const screen = await render(editor());
    await select(screen, "Berechnung", "TVöD-P");
    await select(screen, "Berechnung", "TV-H Pflege · Hessen");
    expect(screen.getByRole("button", { name: "Stufe: Stufe 1b" })).toBeTruthy();
  });
  it("preserves TV-H selection on a work-hours edit", async () => {
    mockSection = "WORK";
    const screen = await render(editor());
    await fireEvent.changeText(screen.getByLabelText("Deine Wochenstunden (Std.)"), "30");
    await fireEvent.press(screen.getByRole("button", { name: "Speichern" }));
    expect(mockUpdateProfile).toHaveBeenCalledWith(
      expect.objectContaining({ tvhKrTariff: h, weeklyMinutes: 1800 }),
    );
  });
  it("clears TV-H when selecting own monthly pay", async () => {
    const screen = await render(editor());
    await select(screen, "Berechnung", "Monatsbrutto selbst eintragen");
    await fireEvent.changeText(screen.getByLabelText("Monatliches Brutto in Euro"), "1800");
    await fireEvent.press(screen.getByRole("button", { name: "Speichern" }));
    expect(mockUpdateProfile).toHaveBeenCalledWith(
      expect.objectContaining({ tvhKrTariff: null, manualMonthlyGrossCents: 180000 }),
    );
  });
  it("clears TV-H when selecting trainee pay", async () => {
    const screen = await render(editor());
    await select(screen, "Berechnung", "TVAöD Pflege · Ausbildung");
    await select(screen, "Ausbildungsjahr", "2. Ausbildungsjahr");
    await fireEvent.press(screen.getByRole("button", { name: "Speichern" }));
    expect(mockUpdateProfile).toHaveBeenCalledWith(
      expect.objectContaining({
        tvhKrTariff: null,
        nursingTrainingTariff: expect.objectContaining({ trainingYear: 2 }),
      }),
    );
  });
  it("requires hours within the selected contractual full-time basis", async () => {
    mockProfile = { ...mockProfile, weeklyMinutes: 2400 };
    const screen = await render(editor());
    await fireEvent.press(screen.getByRole("button", { name: "Speichern" }));
    expect(mockUpdateProfile).not.toHaveBeenCalled();
    expect(screen.getByText(/Wochenstunden liegen über der tariflichen Vollzeit/)).toBeTruthy();
    await select(screen, "Tarifliche Vollzeit pro Woche", "40");
    await fireEvent.press(screen.getByRole("button", { name: "Speichern" }));
    expect(mockUpdateProfile).toHaveBeenCalledWith(
      expect.objectContaining({ tvhKrTariff: { ...h, fullTimeWeeklyMinutes: 2400 } }),
    );
  });
});
