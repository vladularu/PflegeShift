import { render } from "@testing-library/react-native";
import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { cloneElement } from "react";

import { TariffAssessmentScreen } from "@/features/analysis/tariff-assessment-screen";
import { DataBackupScreen } from "@/features/data-backup/data-backup-screen";
import { SettingsInfoDetailsScreen } from "@/features/settings/settings-info-details-screen";
import { DARK_PALETTE, LIGHT_PALETTE } from "@/theme/palette-values";

let mockPalette = LIGHT_PALETTE;
let mockSection = "ABOUT";
let mockOptions: Record<string, unknown> = {};
let mockReady = false;
const mockCreateAndShare = jest.fn();
const mockSelectBackup = jest.fn();
const mockRestoreSelected = jest.fn();

jest.mock("expo-router", () => ({
  router: { back: jest.fn() },
  useLocalSearchParams: () => ({ section: mockSection, month: "2026-09" }),
  Stack: {
    Screen: ({ options }: { options: Record<string, unknown> }) => {
      mockOptions = options;
      return null;
    },
  },
}));
jest.mock("@/theme/palette", () => ({
  ...jest.requireActual<typeof import("@/theme/palette")>("@/theme/palette"),
  usePalette: () => mockPalette,
}));
jest.mock("@/application/pflegeshift-provider", () => ({
  usePflegeShiftStatus: () => ({ ready: mockReady, error: "Ladefehler", reload: jest.fn() }),
  usePflegeShiftProfile: () => ({ profile: null }),
  usePflegeShiftTariff: () => ({ workPatternSettings: {} }),
}));
jest.mock("@/features/data-backup/use-local-backup-export", () => ({
  useLocalBackupExport: () => ({ busy: false, createAndShare: mockCreateAndShare }),
}));
jest.mock("@/features/data-backup/use-local-backup-restore", () => ({
  useLocalBackupRestore: () => ({
    busy: false,
    candidate: null,
    selectBackup: mockSelectBackup,
    restoreSelected: mockRestoreSelected,
  }),
}));
jest.mock("@/ui/feedback", () => ({
  useFeedback: () => ({ showFeedback: jest.fn() }),
}));

async function expectThemeRoundTrip(element: React.ReactElement) {
  const screen = await render(element);
  const title = mockOptions.title;
  expect(typeof title).toBe("string");
  for (const palette of [LIGHT_PALETTE, DARK_PALETTE, LIGHT_PALETTE]) {
    mockPalette = palette;
    await screen.rerender(cloneElement(element));
    expect(mockOptions).toMatchObject({
      title,
      headerStyle: { backgroundColor: palette.background },
      headerTintColor: palette.text,
      headerTitleStyle: { color: palette.text },
      statusBarStyle: palette.dark ? "light" : "dark",
    });
  }
}

describe("More native header theme", () => {
  beforeEach(() => {
    mockPalette = LIGHT_PALETTE;
    mockOptions = {};
    mockReady = false;
    jest.clearAllMocks();
  });

  it.each(["ABOUT", "CALCULATION", "STORAGE", "TVOED_ALLOWANCE", "CARE_ALLOWANCE"])(
    "updates %s header from light to dark and back",
    async (section) => {
      mockSection = section;
      await expectThemeRoundTrip(<SettingsInfoDetailsScreen />);
    },
  );

  it("updates the backup header without exporting, selecting or restoring data", async () => {
    await expectThemeRoundTrip(<DataBackupScreen />);
    expect(mockOptions.title).toBe("Datensicherung");
    expect(mockCreateAndShare).not.toHaveBeenCalled();
    expect(mockSelectBackup).not.toHaveBeenCalled();
    expect(mockRestoreSelected).not.toHaveBeenCalled();
  });

  it.each([false, true])("updates the allowance header even when ready=%s", async (ready) => {
    mockReady = ready;
    await expectThemeRoundTrip(<TariffAssessmentScreen />);
    expect(mockOptions.title).toBe("Schichtzulage");
  });
});
