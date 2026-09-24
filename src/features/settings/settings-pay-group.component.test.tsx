import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { act, fireEvent, render } from "@testing-library/react-native";
import { ActionSheetIOS } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { SettingsEditorScreen } from "./settings-editor-screen";
import { LIGHT_PALETTE } from "@/theme/palette-values";

const mockUpdateProfile = jest.fn<() => Promise<void>>();
const mockPalette = LIGHT_PALETTE;
let mockPayGroup = "P5";
let mockPayLevel = 1;

jest.mock("expo-router", () => ({
  router: { back: jest.fn() },
  useLocalSearchParams: () => ({ section: "TARIFF" }),
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
    profile: {
      federalState: "NW",
      holidayRegion: "NONE",
      weeklyMinutes: 2310,
      timeZone: "Europe/Berlin",
      industry: "HEALTHCARE",
      manualMonthlyGrossCents: null,
      tariff: {
        payGroup: mockPayGroup,
        payLevel: mockPayLevel,
        sector: "BT_K",
        tariffRegion: "OTHER",
        fullTimeWeeklyMinutes: 2310,
      },
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-01T00:00:00Z",
    },
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

describe("settings pay group selection", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUpdateProfile.mockResolvedValue(undefined);
    mockPayGroup = "P5";
    mockPayLevel = 1;
  });

  it.each(["P5", "P6"])("loads and saves %s stage 1", async (payGroup) => {
    mockPayGroup = payGroup;
    const screen = await render(editor());
    expect(screen.getByRole("button", { name: "Stufe: Stufe 1" })).toBeTruthy();
    const options = await select(screen, "Stufe", "Stufe 1");
    expect(options).toEqual([
      "Stufe 1",
      "Stufe 2",
      "Stufe 3",
      "Stufe 4",
      "Stufe 5",
      "Stufe 6",
      "Abbrechen",
    ]);
    await fireEvent.press(screen.getByRole("button", { name: "Speichern" }));
    expect(mockUpdateProfile).toHaveBeenCalledWith(
      expect.objectContaining({
        tariff: expect.objectContaining({ payGroup, payLevel: 1 }),
      }),
    );
  });

  it("clears incompatible stage 1 and blocks saving until the user chooses a valid stage", async () => {
    const screen = await render(editor());
    await select(screen, "Entgeltgruppe", "P7");
    expect(screen.getByRole("button", { name: "Stufe: Bitte auswählen" })).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Speichern" }));
    expect(mockUpdateProfile).not.toHaveBeenCalled();
    expect(
      screen.getByText("Bitte eine gültige Stufe für die gewählte Gruppe wählen."),
    ).toBeTruthy();
    const options = await select(screen, "Stufe", "Stufe 2");
    expect(options).not.toContain("Stufe 1");
    await fireEvent.press(screen.getByRole("button", { name: "Speichern" }));
    expect(mockUpdateProfile).toHaveBeenCalledWith(
      expect.objectContaining({
        tariff: expect.objectContaining({ payGroup: "P7", payLevel: 2 }),
      }),
    );
  });

  it("preserves a compatible stage when changing groups", async () => {
    mockPayGroup = "P8";
    mockPayLevel = 4;
    const screen = await render(editor());
    await select(screen, "Entgeltgruppe", "P6");
    expect(screen.getByRole("button", { name: "Stufe: Stufe 4" })).toBeTruthy();
  });
});
