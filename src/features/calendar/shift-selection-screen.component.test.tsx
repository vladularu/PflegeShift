import { fireEvent, render, waitFor } from "@testing-library/react-native";
import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { router } from "expo-router";
import { SafeAreaProvider } from "react-native-safe-area-context";

import type { ShiftTemplate } from "@/domain/types";
import {
  beginShiftSelectionNavigation,
  consumeShiftSelectionPopupRestore,
} from "@/features/calendar/quick-entry-navigation";
import { ShiftSelectionScreen } from "@/features/calendar/shift-selection-screen";
import { SPACING } from "@/theme/tokens";

const template: ShiftTemplate = {
  id: "early",
  name: "Früh",
  type: "EARLY",
  allDay: false,
  startTime: "06:00",
  endTime: "14:12",
  breakMinutes: 30,
  color: "#7C4DCC",
  symbol: "F",
  notification: null,
  location: null,
  sortOrder: 10,
  revision: 1,
  createdAt: "2026-08-15T00:00:00.000Z",
  updatedAt: "2026-08-15T00:00:00.000Z",
  deletedAt: null,
};

const mockSaveStamp = jest.fn<() => Promise<boolean>>();

jest.mock("expo-router", () => ({
  router: { back: jest.fn(), dismissTo: jest.fn(), push: jest.fn() },
  Stack: { Screen: () => null },
  useLocalSearchParams: () => ({ date: "2026-08-15" }),
}));

jest.mock("@/application/pflegeshift-provider", () => ({
  usePflegeShiftEntries: () => ({ entries: [], removeEntry: jest.fn(), upsertShift: jest.fn() }),
  usePflegeShiftStatus: () => ({ ready: true, error: null, reload: jest.fn() }),
  usePflegeShiftTemplates: () => ({ templates: [template] }),
}));

jest.mock("@/features/calendar/use-quick-stamp-action", () => ({
  useQuickStampAction: () => mockSaveStamp,
}));

jest.mock("@/ui/use-theme-status-bar", () => ({ useThemeStatusBar: () => undefined }));

function TestScreen() {
  return (
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 430, height: 932 },
        insets: { top: 59, right: 0, bottom: 34, left: 0 },
      }}
    >
      <ShiftSelectionScreen />
    </SafeAreaProvider>
  );
}

describe("ShiftSelectionScreen", () => {
  beforeEach(() => {
    beginShiftSelectionNavigation();
    jest.mocked(router.back).mockClear();
    jest.mocked(router.dismissTo).mockClear();
    jest.mocked(router.push).mockClear();
    mockSaveStamp.mockReset();
    mockSaveStamp.mockResolvedValue(true);
  });

  it("keeps Meine Dienste mounted while opening edit or add above it", async () => {
    const screen = await render(<TestScreen />);

    expect(screen.getByRole("header", { name: /Schicht auswählen/ })).toBeVisible();
    expect(screen.getByText(/15\. August 2026/)).toBeVisible();
    expect(screen.getByRole("button", { name: "Schichtauswahl schließen" })).toHaveStyle({
      width: 44,
      height: 44,
    });
    expect(screen.getByText("Meine Dienste")).toBeVisible();
    expect(screen.getByTestId("shift-selection-panel").props.entering).toBeUndefined();
    expect(screen.getByTestId("shift-selection-panel").props.exiting).toBeUndefined();
    expect(screen.getByTestId("shift-selection-panel")).toHaveStyle({ paddingTop: SPACING.lg });

    await fireEvent.press(screen.getByRole("button", { name: "Früh Dienstvorlage bearbeiten" }));
    expect(router.push).toHaveBeenLastCalledWith({
      pathname: "/template-editor",
      params: { id: "early", quickEntryDate: "2026-08-15" },
    });
    expect(screen.getByText("Meine Dienste")).toBeVisible();

    await fireEvent.press(screen.getByRole("button", { name: "Neue Schichtvorlage hinzufügen" }));
    expect(router.push).toHaveBeenLastCalledWith({
      pathname: "/template-editor",
      params: { quickEntryDate: "2026-08-15" },
    });
  });

  it("returns to the calendar after a normal template selection", async () => {
    const screen = await render(<TestScreen />);

    await fireEvent.press(screen.getByRole("button", { name: "Früh direkt eintragen" }));

    await waitFor(() =>
      expect(mockSaveStamp).toHaveBeenCalledWith(expect.anything(), "2026-08-15"),
    );
    expect(router.back).toHaveBeenCalledTimes(1);
    expect(consumeShiftSelectionPopupRestore()).toBe(false);
  });

  it("closes without writing when selection is cancelled", async () => {
    const screen = await render(<TestScreen />);
    await fireEvent.press(screen.getByRole("button", { name: "Schichtauswahl schließen" }));
    expect(router.back).toHaveBeenCalledTimes(1);
    expect(mockSaveStamp).not.toHaveBeenCalled();
  });
});
