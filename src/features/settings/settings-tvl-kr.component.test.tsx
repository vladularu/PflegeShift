import { Temporal } from "@js-temporal/polyfill";
import type { UserProfile } from "@/domain/types";
import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { act, fireEvent, render, within } from "@testing-library/react-native";
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
  if (field === "Berechnung") {
    const dialog = within(screen.getByTestId("dropdown-modal-content"));
    const choices = dialog
      .getAllByRole("button")
      .map((button) => button.props.accessibilityLabel as string)
      .filter((label) => label !== "Auswahl abbrechen");
    await fireEvent.press(dialog.getByRole("button", { name: option }));
    return choices;
  }
  const [options, callback] = picker.mock.calls[picker.mock.calls.length - 1];
  expect(options.options).toContain(option);
  await act(() => callback(options.options.indexOf(option)));
  return options.options;
}

const tvl = { payGroup: "KR8" as const, payLevel: 4 as const, universityRegion: "WEST" as const };
describe("TV-L in the familiar salary form", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Temporal.Now, "plainDateISO").mockReturnValue(Temporal.PlainDate.from("2026-10-05"));
    mockUpdateProfile.mockResolvedValue(undefined);
    mockSection = "TARIFF";
    mockProfile = { ...baseProfile, tvlKrTariff: tvl };
  });
  it("reopens KR group, level and region without VKA controls or date/history menus", async () => {
    const screen = await render(editor());
    expect(screen.getByRole("button", { name: "Berechnung: TV-L Pflege" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Entgeltgruppe: KR8" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Stufe: Stufe 4" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Tarifgebiet: West" })).toBeTruthy();
    expect(screen.getByDisplayValue("38,5")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^Tarifbereich:/ })).toBeNull();
    expect(
      screen.queryByText(/Geburtsdatum|Gültig ab|Vergütungsstände|Frühere Angaben|Übrige VKA/),
    ).toBeNull();
    await fireEvent.press(screen.getByRole("button", { name: "Speichern" }));
    expect(mockUpdateProfile).toHaveBeenCalledWith(
      expect.objectContaining({
        tvlKrTariff: tvl,
        tariff: null,
        vkaETariff: null,
        nursingTrainingTariff: null,
        manualMonthlyGrossCents: null,
      }),
    );
  });
  it("offers only KR groups and their valid levels", async () => {
    const screen = await render(editor());
    const groups = await select(screen, "Entgeltgruppe", "KR12");
    expect(groups).toContain("KR5");
    expect(groups).toContain("KR17");
    expect(groups).not.toContain("P8");
    expect(groups).not.toContain("E9b");
    const levels = await select(screen, "Stufe", "Stufe 6");
    expect(levels).not.toContain("Stufe 1");
    await fireEvent.press(screen.getByRole("button", { name: "Speichern" }));
    expect(mockUpdateProfile).toHaveBeenCalledWith(
      expect.objectContaining({ tvlKrTariff: { ...tvl, payGroup: "KR12", payLevel: 6 } }),
    );
  });
  it("allows KR5 level 1 and requires choosing a valid level after switching to KR7", async () => {
    mockProfile = { ...baseProfile, tvlKrTariff: { ...tvl, payGroup: "KR5", payLevel: 1 } };
    const screen = await render(editor());
    await select(screen, "Entgeltgruppe", "KR7");
    await fireEvent.press(screen.getByRole("button", { name: "Speichern" }));
    expect(mockUpdateProfile).not.toHaveBeenCalled();
    expect(screen.getByText(/Bitte eine gültige Stufe/)).toBeTruthy();
    const levels = await select(screen, "Stufe", "Stufe 2");
    expect(levels).not.toContain("Stufe 1");
    await fireEvent.press(screen.getByRole("button", { name: "Speichern" }));
    expect(mockUpdateProfile).toHaveBeenCalledWith(
      expect.objectContaining({ tvlKrTariff: { ...tvl, payGroup: "KR7", payLevel: 2 } }),
    );
  });
  it("saves the explicit East region and shows its current university full time", async () => {
    const screen = await render(editor());
    await select(screen, "Tarifgebiet", "Ost");
    expect(screen.getByDisplayValue("40")).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Speichern" }));
    expect(mockUpdateProfile).toHaveBeenCalledWith(
      expect.objectContaining({ tvlKrTariff: { ...tvl, universityRegion: "EAST" } }),
    );
  });
  it("shows the automatic East full-time change in 2027 without date entry", async () => {
    jest.spyOn(Temporal.Now, "plainDateISO").mockReturnValue(Temporal.PlainDate.from("2027-01-05"));
    mockProfile = { ...baseProfile, tvlKrTariff: { ...tvl, universityRegion: "EAST" } };
    const screen = await render(editor());
    expect(screen.getByDisplayValue("39,5")).toBeTruthy();
    expect(screen.queryByText(/Gültig ab/)).toBeNull();
  });
  it("switches to P and restores only the P-specific controls", async () => {
    const screen = await render(editor());
    await select(screen, "Berechnung", "TVöD-P");
    expect(screen.getByRole("button", { name: /^Tarifbereich:/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Entgeltgruppe: P8" })).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Speichern" }));
    expect(mockUpdateProfile).toHaveBeenCalledWith(
      expect.objectContaining({
        tvlKrTariff: null,
        tariff: expect.objectContaining({ payGroup: "P8" }),
      }),
    );
  });
  it("switches to Ausbildung without keeping a KR selection", async () => {
    const screen = await render(editor());
    await select(screen, "Berechnung", "TVAöD Pflege · Ausbildung");
    await select(screen, "Ausbildungsjahr", "2. Ausbildungsjahr");
    expect(screen.queryByRole("button", { name: /^Entgeltgruppe:/ })).toBeNull();
    await fireEvent.press(screen.getByRole("button", { name: "Speichern" }));
    expect(mockUpdateProfile).toHaveBeenCalledWith(
      expect.objectContaining({
        tvlKrTariff: null,
        nursingTrainingTariff: expect.objectContaining({ trainingYear: 2 }),
      }),
    );
  });
  it("switches to a manual amount without tariff fields", async () => {
    const screen = await render(editor());
    await select(screen, "Berechnung", "Monatsbrutto selbst eintragen");
    await fireEvent.changeText(screen.getByLabelText("Monatliches Brutto in Euro"), "1800");
    expect(
      screen.queryByRole("button", { name: /^Entgeltgruppe:|^Tarifgebiet:|^Tarifbereich:/ }),
    ).toBeNull();
    await fireEvent.press(screen.getByRole("button", { name: "Speichern" }));
    expect(mockUpdateProfile).toHaveBeenCalledWith(
      expect.objectContaining({ tvlKrTariff: null, manualMonthlyGrossCents: 180000 }),
    );
  });
  it("preserves TV-L on working-time edits", async () => {
    mockSection = "WORK";
    const screen = await render(editor());
    await fireEvent.changeText(screen.getByLabelText("Wochenarbeitszeit in Stunden"), "30");
    await fireEvent.press(screen.getByRole("button", { name: "Speichern" }));
    expect(mockUpdateProfile).toHaveBeenCalledWith(
      expect.objectContaining({ weeklyMinutes: 1800, tvlKrTariff: tvl, tariff: null }),
    );
  });
  it("does not silently change an East selection after another salary mode", async () => {
    mockProfile = { ...baseProfile, tvlKrTariff: { ...tvl, universityRegion: "EAST" } };
    const screen = await render(editor());
    await select(screen, "Berechnung", "TVöD VKA · E-Tabelle");
    await select(screen, "Berechnung", "TV-L Pflege");
    expect(screen.getByRole("button", { name: "Tarifgebiet: Ost" })).toBeTruthy();
  });
  it("requires a working-time correction above the selected full-time basis", async () => {
    mockProfile = { ...mockProfile, weeklyMinutes: 2400 };
    const screen = await render(editor());
    await fireEvent.press(screen.getByRole("button", { name: "Speichern" }));
    expect(mockUpdateProfile).not.toHaveBeenCalled();
    expect(
      screen.getByText(/Deine Wochenstunden liegen über der tariflichen Vollzeit/),
    ).toBeTruthy();
    await select(screen, "Tarifgebiet", "Ost");
    await fireEvent.press(screen.getByRole("button", { name: "Speichern" }));
    expect(mockUpdateProfile).toHaveBeenCalled();
  });
});
