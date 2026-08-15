import { act, fireEvent, render, waitFor } from "@testing-library/react-native";
import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { router } from "expo-router";
import { SafeAreaProvider } from "react-native-safe-area-context";

import type { ShiftEntry } from "@/domain/types";
import { DayEditorScreen } from "@/features/day-editor/day-editor-screen";
import { FeedbackProvider } from "@/ui/feedback";
import { successFeedback } from "@/ui/haptics";

const mockUpsertShift = jest.fn<() => Promise<ShiftEntry>>();
const mockUpsertAppointment = jest.fn();

jest.mock("expo-router", () => ({
  router: { back: jest.fn(), dismissTo: jest.fn() },
  Stack: {
    Screen: ({ options }: { options: { headerLeft?: () => React.ReactNode } }) =>
      options.headerLeft?.() ?? null,
  },
  useFocusEffect: (effect: () => void) => effect(),
  useLocalSearchParams: () => ({
    date: "2026-08-04",
    mode: "SHIFT",
  }),
}));

jest.mock("@/application/pflegeshift-provider", () => ({
  usePflegeShiftEntries: () => ({
    entries: [],
    upsertShift: mockUpsertShift,
    upsertAppointment: mockUpsertAppointment,
    removeEntry: jest.fn(),
  }),
  usePflegeShiftProfile: () => ({ profile: null }),
  usePflegeShiftStatus: () => ({ error: null, ready: true, reload: jest.fn() }),
  usePflegeShiftTemplates: () => ({ templates: [] }),
}));

jest.mock("@/features/day-editor/use-entry-deletion", () => ({
  useEntryDeletion: () => jest.fn(),
}));

jest.mock("@/ui/haptics", () => ({
  selectionFeedback: jest.fn(),
  successFeedback: jest.fn(),
  warningFeedback: jest.fn(),
}));

describe("DayEditorScreen", () => {
  beforeEach(() => {
    mockUpsertShift.mockReset();
    mockUpsertShift.mockResolvedValue({ id: "saved" } as ShiftEntry);
    jest.mocked(router.back).mockClear();
    jest.mocked(router.dismissTo).mockClear();
    jest.mocked(successFeedback).mockClear();
  });

  it("saves and closes without showing a success snackbar", async () => {
    const screen = await render(
      <SafeAreaProvider
        initialMetrics={{
          frame: { x: 0, y: 0, width: 430, height: 932 },
          insets: { top: 59, right: 0, bottom: 34, left: 0 },
        }}
      >
        <FeedbackProvider>
          <DayEditorScreen />
        </FeedbackProvider>
      </SafeAreaProvider>,
    );

    await act(async () => {
      fireEvent.press(screen.getByRole("button", { name: "Schließen und speichern" }));
    });

    await waitFor(() => expect(mockUpsertShift).toHaveBeenCalledTimes(1));
    expect(successFeedback).toHaveBeenCalledTimes(1);
    expect(router.back).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("Eintrag gespeichert.")).toBeNull();
    expect(screen.queryByText("Eintrag aktualisiert.")).toBeNull();
  });
});
