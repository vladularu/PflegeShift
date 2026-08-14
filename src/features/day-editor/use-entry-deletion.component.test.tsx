import { act, fireEvent, render, waitFor } from "@testing-library/react-native";
import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { Pressable, Text } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import type { ShiftEntry } from "@/domain/types";
import { useEntryDeletion } from "@/features/day-editor/use-entry-deletion";
import { confirmDestructiveAction } from "@/ui/confirm-action";
import { FeedbackProvider } from "@/ui/feedback";
import { selectionFeedback } from "@/ui/haptics";

const mockRemoveEntry = jest.fn<(entry: ShiftEntry) => Promise<void>>();
const mockRestoreEntry = jest.fn<(entry: ShiftEntry) => Promise<ShiftEntry>>();

jest.mock("@/application/pflegeshift-provider", () => ({
  usePflegeShiftEntries: () => ({
    removeEntry: mockRemoveEntry,
    restoreEntry: mockRestoreEntry,
  }),
}));

jest.mock("@/ui/confirm-action", () => ({
  confirmDestructiveAction: jest.fn(),
}));

jest.mock("@/ui/haptics", () => ({
  selectionFeedback: jest.fn(),
  successFeedback: jest.fn(),
  warningFeedback: jest.fn(),
}));

const ENTRY: ShiftEntry = {
  kind: "SHIFT",
  id: "day-1",
  date: "2026-08-04",
  templateId: null,
  title: "Tag",
  type: "DAY",
  startTime: "08:00",
  endTime: "16:00",
  breakMinutes: 30,
  color: "#2F80ED",
  symbol: "T",
  note: null,
  overtimeMinutes: 0,
  holidayPremiumMode: "WITH_TIME_OFF",
  revision: 1,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  deletedAt: null,
};

function Harness({
  onDeleted,
  onError,
}: {
  onDeleted: () => void;
  onError: (value: string) => void;
}) {
  const confirmDelete = useEntryDeletion({ onDeleted, onError });
  return (
    <Pressable accessibilityRole="button" onPress={() => confirmDelete(ENTRY)}>
      <Text>Eintrag löschen</Text>
    </Pressable>
  );
}

function TestProvider({ children }: React.PropsWithChildren) {
  return (
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 430, height: 932 },
        insets: { top: 59, right: 0, bottom: 34, left: 0 },
      }}
    >
      <FeedbackProvider>{children}</FeedbackProvider>
    </SafeAreaProvider>
  );
}

describe("useEntryDeletion", () => {
  beforeEach(() => {
    mockRemoveEntry.mockResolvedValue(undefined);
    mockRestoreEntry.mockResolvedValue(ENTRY);
    jest.mocked(confirmDestructiveAction).mockImplementation(({ onConfirm }) => onConfirm());
  });

  it("deletes after confirmation without showing a success or undo snackbar", async () => {
    const onDeleted = jest.fn();
    const onError = jest.fn();
    const screen = await render(
      <TestProvider>
        <Harness onDeleted={onDeleted} onError={onError} />
      </TestProvider>,
    );

    await act(async () => {
      fireEvent.press(screen.getByRole("button", { name: "Eintrag löschen" }));
    });

    await waitFor(() => expect(mockRemoveEntry).toHaveBeenCalledWith(ENTRY));
    expect(onDeleted).toHaveBeenCalledTimes(1);
    expect(selectionFeedback).toHaveBeenCalledTimes(1);
    expect(mockRestoreEntry).not.toHaveBeenCalled();
    expect(screen.queryByText("Eintrag gelöscht.")).toBeNull();
    expect(screen.queryByRole("button", { name: "Rückgängig" })).toBeNull();
  });

  it("keeps deletion errors visible through the screen error callback", async () => {
    const onDeleted = jest.fn();
    const onError = jest.fn();
    mockRemoveEntry.mockRejectedValueOnce(new Error("database unavailable"));
    const screen = await render(
      <TestProvider>
        <Harness onDeleted={onDeleted} onError={onError} />
      </TestProvider>,
    );

    await act(async () => {
      fireEvent.press(screen.getByRole("button", { name: "Eintrag löschen" }));
    });

    await waitFor(() => expect(onError).toHaveBeenCalledWith("Löschen fehlgeschlagen."));
    expect(onDeleted).not.toHaveBeenCalled();
  });
});
