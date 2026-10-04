import { fireEvent, render } from "@testing-library/react-native";
import { beforeEach, describe, expect, it, jest } from "@jest/globals";

import { SettingsEditorScreen } from "./settings-editor-screen";
import { DARK_PALETTE, LIGHT_PALETTE } from "@/theme/palette-values";

let mockPalette = LIGHT_PALETTE;
let mockSection = "WORK";
let mockOptions: Record<string, unknown> = {};
const mockUpdateProfile = jest.fn();
jest.mock("@/application/rule-catalog-runtime-provider", () => ({
  useRuleCatalogRuntime: () => ({
    resolver:
      jest.requireActual<typeof import("@/rules/rule-resolver")>("@/rules/rule-resolver")
        .bundledRuleResolver,
  }),
}));

jest.mock("expo-router", () => ({
  router: { back: jest.fn() },
  useLocalSearchParams: () => ({ section: mockSection }),
  Stack: {
    Screen: ({
      options,
    }: {
      options: Record<string, unknown> & { headerRight?: () => React.ReactNode };
    }) => {
      mockOptions = options;
      return options.headerRight?.() ?? null;
    },
  },
}));
jest.mock("@/theme/palette", () => ({ usePalette: () => mockPalette }));
jest.mock("@/application/remuneration-provider", () => ({
  useRemunerationHistory: () => ({ status: "ready", profiles: [], error: null }),
}));
jest.mock("@/features/onboarding/onboarding-screen", () => ({
  parseWeeklyHours: (value: string) => Math.round(Number(value.replace(",", ".")) * 60),
}));
jest.mock("@/application/pflegeshift-provider", () => ({
  usePflegeShiftStatus: () => ({ ready: true, error: null }),
  usePflegeShiftProfile: () => ({
    updateProfile: mockUpdateProfile,
    profile: {
      federalState: "NW",
      holidayRegion: "NONE",
      weeklyMinutes: 2310,
      timeZone: "Europe/Berlin",
      tariff: null,
      manualMonthlyGrossCents: 210050,
      industry: "HEALTHCARE",
      regularRotatingNightWork: true,
      sundayHolidayWorkEligible: false,
      allEmploymentWorkRecorded: null,
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-01T00:00:00Z",
    },
  }),
}));
jest.mock("@/ui/form-layout", () => {
  const { Button } = jest.requireActual<typeof import("react-native")>("react-native");
  return {
    FormScreen: ({ children }: React.PropsWithChildren) => children,
    FormSection: ({ children }: React.PropsWithChildren) => children,
    FormStatus: () => null,
    HeaderSaveAction: ({ onPress }: { onPress: () => void }) => (
      <Button title="Speichern" onPress={onPress} />
    ),
  };
});
jest.mock("@/ui/form-controls", () => {
  const { TextInput } = jest.requireActual<typeof import("react-native")>("react-native");
  return {
    DropdownField: () => null,
    PrimaryButton: () => null,
    SecondaryButton: () => null,
    Field: ({
      label,
      value,
      onChangeText,
    }: {
      label: string;
      value: string;
      onChangeText: (value: string) => void;
    }) => <TextInput accessibilityLabel={label} value={value} onChangeText={onChangeText} />,
  };
});

describe("settings native header theme", () => {
  beforeEach(() => {
    mockPalette = LIGHT_PALETTE;
    jest.clearAllMocks();
  });

  it.each(["WORK", "TARIFF"])(
    "updates %s header in both directions without saving",
    async (section) => {
      mockSection = section;
      const screen = await render(<SettingsEditorScreen />);
      expect(mockOptions.headerStyle).toEqual({ backgroundColor: LIGHT_PALETTE.background });
      for (const palette of [DARK_PALETTE, LIGHT_PALETTE]) {
        mockPalette = palette;
        await screen.rerender(<SettingsEditorScreen />);
        expect(mockOptions.headerStyle).toEqual({ backgroundColor: palette.background });
        expect(mockOptions.headerTintColor).toBe(palette.text);
        expect(mockOptions.headerTitleStyle).toEqual({ color: palette.text });
        expect(mockOptions.statusBarStyle).toBe(palette.dark ? "light" : "dark");
      }
      expect(mockUpdateProfile).not.toHaveBeenCalled();
    },
  );

  it("preserves an unsaved field through a theme change", async () => {
    mockSection = "WORK";
    const screen = await render(<SettingsEditorScreen />);
    const input = screen.getByDisplayValue("38,5");
    await fireEvent.changeText(input, "32");
    mockPalette = DARK_PALETTE;
    await screen.rerender(<SettingsEditorScreen />);
    expect(screen.getByDisplayValue("32")).toBeTruthy();
    expect(mockUpdateProfile).not.toHaveBeenCalled();
  });
  it("keeps remuneration and evidence unchanged while saving the work profile", async () => {
    mockSection = "WORK";
    const screen = await render(<SettingsEditorScreen />);
    await fireEvent.changeText(screen.getByDisplayValue("38,5"), "32");
    await fireEvent.press(screen.getByRole("button", { name: "Speichern" }));
    expect(mockUpdateProfile).toHaveBeenCalledWith({
      federalState: "NW",
      holidayRegion: "NONE",
      weeklyMinutes: 1920,
      timeZone: "Europe/Berlin",
      industry: "HEALTHCARE",
      tariff: null,
      manualMonthlyGrossCents: 210050,
      regularRotatingNightWork: true,
      sundayHolidayWorkEligible: false,
      allEmploymentWorkRecorded: null,
    });
  });
});
