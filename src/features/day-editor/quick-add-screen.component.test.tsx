import { act, fireEvent, render, waitFor } from "@testing-library/react-native";
import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { router } from "expo-router";
import { SafeAreaProvider } from "react-native-safe-area-context";

import type { ShiftEntry } from "@/domain/types";
import { QuickAddScreen } from "@/features/day-editor/quick-add-screen";
import { FeedbackProvider } from "@/ui/feedback";
import { successFeedback } from "@/ui/haptics";

const mockUpsertShift = jest.fn<() => Promise<ShiftEntry>>();

jest.mock("expo-router", () => ({
  router: { back: jest.fn(), push: jest.fn(), replace: jest.fn() },
  Stack: { Screen: () => null },
  useLocalSearchParams: () => ({ date: "2026-08-04" }),
}));

jest.mock("@/application/pflegeshift-provider", () => ({
  usePflegeShiftEntries: () => ({ upsertShift: mockUpsertShift }),
  usePflegeShiftStatus: () => ({ error: null, ready: true, reload: jest.fn() }),
  usePflegeShiftTemplates: () => ({
    templates: [
      {
        id: "day",
        name: "Tag",
        type: "DAY",
        startTime: "08:00",
        endTime: "16:00",
        breakMinutes: 30,
        color: "#2F80ED",
        symbol: "T",
        sortOrder: 1,
        revision: 1,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
        deletedAt: null,
      },
    ],
  }),
}));

jest.mock("@/ui/haptics", () => ({
  successFeedback: jest.fn(),
  warningFeedback: jest.fn(),
}));

jest.mock("@/ui/use-theme-status-bar", () => ({ useThemeStatusBar: () => undefined }));

describe("QuickAddScreen", () => {
  beforeEach(() => {
    jest.mocked(router.back).mockClear();
    jest.mocked(router.push).mockClear();
    mockUpsertShift.mockResolvedValue({} as ShiftEntry);
  });

  it("saves a template and closes without showing a success snackbar", async () => {
    const screen = await render(
      <SafeAreaProvider
        initialMetrics={{
          frame: { x: 0, y: 0, width: 430, height: 932 },
          insets: { top: 59, right: 0, bottom: 34, left: 0 },
        }}
      >
        <FeedbackProvider>
          <QuickAddScreen />
        </FeedbackProvider>
      </SafeAreaProvider>,
    );

    expect(screen.getByRole("header", { name: /Schicht auswählen/ })).toBeVisible();
    expect(screen.getByText(/4\. August 2026/)).toBeVisible();
    expect(screen.getByTestId("shift-selection-panel").props.entering).toBeUndefined();

    await act(async () => {
      fireEvent.press(screen.getByRole("button", { name: "Neue Schichtvorlage hinzufügen" }));
    });
    expect(router.push).toHaveBeenLastCalledWith({
      pathname: "/template-editor",
      params: {},
    });

    await act(async () => {
      fireEvent.press(screen.getByRole("button", { name: "Tag direkt eintragen" }));
    });

    await waitFor(() => expect(mockUpsertShift).toHaveBeenCalledTimes(1));
    expect(successFeedback).toHaveBeenCalledTimes(1);
    expect(router.back).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("Eintrag gespeichert.")).toBeNull();
  });
});
