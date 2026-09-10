import { act, fireEvent, render, waitFor } from "@testing-library/react-native";
import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { AccessibilityInfo, Pressable, Text } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import type { CalendarEntry, ShiftEntry, ShiftTemplate } from "@/domain/types";
import { buildQuickEntryActions } from "@/features/calendar/quick-entry-actions";
import { useQuickStampAction } from "@/features/calendar/use-quick-stamp-action";
import { FeedbackProvider } from "@/ui/feedback";
import { selectionFeedback, successFeedback } from "@/ui/haptics";

jest.mock("@/ui/haptics", () => ({
  selectionFeedback: jest.fn(),
  successFeedback: jest.fn(),
  warningFeedback: jest.fn(),
}));

const TEMPLATE: ShiftTemplate = {
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
};

function entry(id = "day-1"): ShiftEntry {
  return {
    kind: "SHIFT",
    id,
    date: "2026-08-04",
    templateId: TEMPLATE.id,
    title: TEMPLATE.name,
    type: TEMPLATE.type,
    startTime: TEMPLATE.startTime,
    endTime: TEMPLATE.endTime,
    breakMinutes: TEMPLATE.breakMinutes,
    color: TEMPLATE.color,
    symbol: TEMPLATE.symbol,
    note: null,
    overtimeMinutes: 0,
    holidayPremiumMode: "WITH_TIME_OFF",
    revision: 1,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    deletedAt: null,
  };
}

const mockRemoveEntry = jest.fn<(value: CalendarEntry) => Promise<void>>();
const mockUpsertShift = jest.fn<() => Promise<ShiftEntry>>();
const mockBusyChange = jest.fn<(busy: boolean) => void>();
const mockError = jest.fn<(message: string) => void>();

function Harness({ entries }: { readonly entries: readonly ShiftEntry[] }) {
  const saveStamp = useQuickStampAction({
    entries,
    removeEntry: mockRemoveEntry,
    upsertShift: mockUpsertShift,
    onBusyChange: mockBusyChange,
    onError: mockError,
  });
  const action = buildQuickEntryActions([TEMPLATE])[0];

  if (action.kind !== "TEMPLATE") throw new Error("Expected template action");
  return (
    <Pressable accessibilityRole="button" onPress={() => void saveStamp(action, "2026-08-04")}>
      <Text>Tag anwenden</Text>
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

describe("useQuickStampAction", () => {
  beforeEach(() => {
    mockRemoveEntry.mockResolvedValue(undefined);
    mockUpsertShift.mockResolvedValue(entry());
    jest.spyOn(AccessibilityInfo, "announceForAccessibility").mockImplementation(jest.fn());
  });

  it("adds a service with only subtle selection feedback and accessibility", async () => {
    const screen = await render(
      <TestProvider>
        <Harness entries={[]} />
      </TestProvider>,
    );

    await act(async () => {
      fireEvent.press(screen.getByRole("button", { name: "Tag anwenden" }));
    });

    await waitFor(() => expect(mockUpsertShift).toHaveBeenCalledTimes(1));
    expect(selectionFeedback).toHaveBeenCalledTimes(1);
    expect(successFeedback).not.toHaveBeenCalled();
    expect(AccessibilityInfo.announceForAccessibility).toHaveBeenCalledWith(
      expect.stringContaining("hinzugefügt"),
    );
    expect(screen.queryByText("Tag eingetragen.")).toBeNull();
  });

  it("removes a matching service silently without offering undo", async () => {
    const screen = await render(
      <TestProvider>
        <Harness entries={[entry()]} />
      </TestProvider>,
    );

    await act(async () => {
      fireEvent.press(screen.getByRole("button", { name: "Tag anwenden" }));
    });

    await waitFor(() => expect(mockRemoveEntry).toHaveBeenCalledWith(entry()));
    expect(selectionFeedback).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("Tag entfernt.")).toBeNull();
    expect(screen.queryByRole("button", { name: "Rückgängig" })).toBeNull();
  });
});
