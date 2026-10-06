import { Temporal } from "@js-temporal/polyfill";
import type { UserProfile } from "@/domain/types";
import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { fireEvent, render } from "@testing-library/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import {
  SettingsEditorTestFlow,
  chooseTariffDetails,
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

const tval = { trainingYear: 1 as const, universityRegion: "WEST" as const };
describe("TVA-L in the familiar salary form", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Temporal.Now, "plainDateISO").mockReturnValue(Temporal.PlainDate.from("2026-10-05"));
    mockUpdateProfile.mockResolvedValue(undefined);
    mockSection = "TARIFF";
    mockProfile = { ...baseProfile, tvalPflegeTariff: tval };
  });
  it("reopens training year and region with no group, level, VKA or history fields", async () => {
    const screen = await render(editor());
    expect(
      screen.getByRole("button", { name: "Tarifvertrag: TVA-L Pflege · Ausbildung" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Ausbildungsjahr: 1. Ausbildungsjahr" }),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "Tarifregion: West" })).toBeTruthy();
    expect(screen.getAllByText("38,5 Std.")).toBeTruthy();
    for (const field of ["Entgeltgruppe", "Stufe", "Tarifbereich"])
      expect(screen.queryByRole("button", { name: new RegExp(`^${field}:`) })).toBeNull();
    expect(
      screen.queryByText(/Geburtsdatum|Gültig ab|Vergütungsstände|Frühere Angaben|Übrige VKA/),
    ).toBeNull();
    await fireEvent.press(screen.getByRole("button", { name: "Speichern" }));
    expect(mockUpdateProfile).toHaveBeenCalledWith(
      expect.objectContaining({
        tvalPflegeTariff: tval,
        tariff: null,
        manualMonthlyGrossCents: null,
        nursingTrainingTariff: null,
        tvlKrTariff: null,
        vkaETariff: null,
        tvUkNursingTariff: null,
        tvhKrTariff: null,
      }),
    );
  });
  it.each([1, 2, 3] as const)("saves only the selected training year %s", async (year) => {
    const screen = await render(editor());
    const options = await select(screen, "Ausbildungsjahr", `${year}. Ausbildungsjahr`);
    expect(options).not.toContain("4. Ausbildungsjahr");
    await fireEvent.press(screen.getByRole("button", { name: "Speichern" }));
    expect(mockUpdateProfile).toHaveBeenCalledWith(
      expect.objectContaining({ tvalPflegeTariff: { ...tval, trainingYear: year } }),
    );
  });
  it("requires a chosen year when opening TVA-L from an employee tariff", async () => {
    mockProfile = {
      ...baseProfile,
      tvlKrTariff: { payGroup: "KR8", payLevel: 4, universityRegion: "WEST" },
    };
    const screen = await render(editor());
    await select(screen, "Berechnung", "TVA-L Pflege · Ausbildung");
    await fireEvent.press(screen.getByRole("button", { name: "Speichern" }));
    expect(mockUpdateProfile).not.toHaveBeenCalled();
    expect(screen.getByText("Bitte das Ausbildungsjahr wählen.")).toBeTruthy();
  });
  it("saves East and determines its 40-hour basis automatically", async () => {
    const screen = await render(editor());
    await select(screen, "Tarifgebiet", "Ost");
    expect(screen.getAllByText("40 Std.")).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Speichern" }));
    expect(mockUpdateProfile).toHaveBeenCalledWith(
      expect.objectContaining({ tvalPflegeTariff: { ...tval, universityRegion: "EAST" } }),
    );
  });
  it("shows the East working-time change in 2027 without asking for a date", async () => {
    jest.spyOn(Temporal.Now, "plainDateISO").mockReturnValue(Temporal.PlainDate.from("2027-01-05"));
    mockProfile = { ...baseProfile, tvalPflegeTariff: { ...tval, universityRegion: "EAST" } };
    const screen = await render(editor());
    expect(screen.getAllByText("39,5 Std.")).toBeTruthy();
  });
  it("preserves the selection when editing personal weekly hours", async () => {
    mockSection = "WORK";
    const screen = await render(editor());
    await fireEvent.changeText(screen.getByLabelText("Deine Wochenstunden (Std.)"), "30");
    await fireEvent.press(screen.getByRole("button", { name: "Speichern" }));
    expect(mockUpdateProfile).toHaveBeenCalledWith(
      expect.objectContaining({ tvalPflegeTariff: tval, weeklyMinutes: 1800, tariff: null }),
    );
  });
  it.each([
    ["TVöD-P", "tariff"],
    ["TVöD VKA · E-Tabelle", "vkaETariff"],
    ["TVAöD Pflege · Ausbildung", "nursingTrainingTariff"],
    ["TV-L Pflege", "tvlKrTariff"],
    ["TV-UK Pflege · Baden-Württemberg", "tvUkNursingTariff"],
    ["TV-H Pflege · Hessen", "tvhKrTariff"],
  ])("switches to %s and removes TVA-L", async (label, key) => {
    const screen = await render(editor());
    await select(screen, "Berechnung", label);
    await chooseTariffDetails(screen, label);
    await fireEvent.press(screen.getByRole("button", { name: "Speichern" }));
    expect(mockUpdateProfile).toHaveBeenCalledWith(
      expect.objectContaining({ tvalPflegeTariff: null, [key]: expect.any(Object) }),
    );
  });
  it("switches to manual salary with no tariff controls", async () => {
    const screen = await render(editor());
    await select(screen, "Berechnung", "Monatsbrutto selbst eintragen");
    await fireEvent.changeText(screen.getByLabelText("Monatliches Brutto in Euro"), "1800");
    expect(screen.queryByRole("button", { name: /^Ausbildungsjahr:|^Tarifregion:/ })).toBeNull();
    await fireEvent.press(screen.getByRole("button", { name: "Speichern" }));
    expect(mockUpdateProfile).toHaveBeenCalledWith(
      expect.objectContaining({ tvalPflegeTariff: null, manualMonthlyGrossCents: 180000 }),
    );
  });
  it("retains East and training year after switching modes and back", async () => {
    mockProfile = {
      ...baseProfile,
      tvalPflegeTariff: { trainingYear: 3, universityRegion: "EAST" },
    };
    const screen = await render(editor());
    await select(screen, "Berechnung", "TVöD VKA · E-Tabelle");
    await select(screen, "Berechnung", "TVA-L Pflege · Ausbildung");
    expect(screen.getByRole("button", { name: "Tarifregion: Ost" })).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Ausbildungsjahr: 3. Ausbildungsjahr" }),
    ).toBeTruthy();
  });
  it("requires correcting contracted hours above West training full time", async () => {
    mockProfile = { ...mockProfile, weeklyMinutes: 2400 };
    const screen = await render(editor());
    await fireEvent.press(screen.getByRole("button", { name: "Speichern" }));
    expect(mockUpdateProfile).not.toHaveBeenCalled();
    expect(
      screen.getByText(/Deine Wochenstunden liegen über der tariflichen Ausbildungszeit/),
    ).toBeTruthy();
    await select(screen, "Tarifgebiet", "Ost");
    await fireEvent.press(screen.getByRole("button", { name: "Speichern" }));
    expect(mockUpdateProfile).toHaveBeenCalled();
  });
});
