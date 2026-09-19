import { act, fireEvent, render, waitFor } from "@testing-library/react-native";
import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { router } from "expo-router";
import { Alert } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import type { Appointment, CalendarEntry, SaveAppointmentInput, ShiftEntry } from "@/domain/types";
import { DayEditorScreen } from "@/features/day-editor/day-editor-screen";
import { FeedbackProvider } from "@/ui/feedback";
import { deletionFeedback, successFeedback } from "@/ui/haptics";

const mockUpsertShift = jest.fn<() => Promise<ShiftEntry>>();
const mockUpsertAppointment = jest.fn<(input: SaveAppointmentInput) => Promise<Appointment>>();
const mockRemoveEntry = jest.fn<(entry: CalendarEntry) => Promise<void>>();
let mockEntries: CalendarEntry[] = [];
let mockBeforeRemoveListener:
  ((event: { preventDefault: () => void; data: { action: { type: string } } }) => void) | null =
  null;
const mockNavigationDispatch = jest.fn();
let mockRouteParams: { date: string; mode: "SHIFT" | "APPOINTMENT"; entryId?: string } = {
  date: "2026-08-04",
  mode: "SHIFT",
};

jest.mock("expo-router", () => ({
  router: { back: jest.fn(), dismissTo: jest.fn() },
  Stack: {
    Screen: ({ options }: { options: { headerLeft?: () => React.ReactNode } }) =>
      options.headerLeft?.() ?? null,
  },
  useFocusEffect: (effect: () => void) => effect(),
  useNavigation: () => ({
    addListener: (
      _event: string,
      listener: (event: { preventDefault: () => void; data: { action: { type: string } } }) => void,
    ) => {
      mockBeforeRemoveListener = listener;
      return jest.fn();
    },
    dispatch: mockNavigationDispatch,
  }),
  useLocalSearchParams: () => mockRouteParams,
}));

jest.mock("@/application/pflegeshift-provider", () => ({
  usePflegeShiftEntries: () => ({
    entries: mockEntries,
    upsertShift: mockUpsertShift,
    upsertAppointment: mockUpsertAppointment,
    removeEntry: mockRemoveEntry,
  }),
  usePflegeShiftProfile: () => ({ profile: null }),
  usePflegeShiftStatus: () => ({ error: null, ready: true, reload: jest.fn() }),
  usePflegeShiftTemplates: () => ({ templates: [] }),
}));

jest.mock("@/application/rule-catalog-runtime-provider", () => {
  const { bundledRuleResolver } =
    jest.requireActual<typeof import("@/rules/rule-resolver")>("@/rules/rule-resolver");
  return { useRuleCatalogRuntime: () => ({ resolver: bundledRuleResolver }) };
});

jest.mock("@/ui/haptics", () => ({
  deletionFeedback: jest.fn(),
  selectionFeedback: jest.fn(),
  successFeedback: jest.fn(),
  warningFeedback: jest.fn(),
}));

describe("DayEditorScreen", () => {
  beforeEach(() => {
    mockRemoveEntry.mockReset().mockResolvedValue(undefined);
    jest.mocked(deletionFeedback).mockClear();
    mockUpsertShift.mockReset();
    mockUpsertShift.mockResolvedValue({ id: "saved" } as ShiftEntry);
    mockUpsertAppointment.mockReset();
    mockUpsertAppointment.mockResolvedValue({ id: "saved-appointment" } as Appointment);
    jest.mocked(router.back).mockClear();
    jest.mocked(router.dismissTo).mockClear();
    jest.mocked(successFeedback).mockClear();
    mockBeforeRemoveListener = null;
    mockNavigationDispatch.mockClear();
    mockEntries = [];
    mockRouteParams = { date: "2026-08-04", mode: "SHIFT" };
  });

  function deletionEntry(kind: "SHIFT" | "APPOINTMENT"): CalendarEntry {
    const common = {
      id: "delete-target",
      date: "2026-08-20",
      title: "Testeintrag",
      allDay: false,
      startTime: "08:00",
      endTime: "16:00",
      color: "#F05C68",
      note: "Notiz behalten",
      notification: null,
      location: null,
      revision: 4,
      createdAt: "2026-08-01T08:00:00.000Z",
      updatedAt: "2026-08-01T08:00:00.000Z",
      deletedAt: null,
    };
    return kind === "SHIFT"
      ? {
          ...common,
          kind,
          templateId: null,
          type: "EARLY",
          breakMinutes: 30,
          symbol: "F",
          alarmEnabled: false,
          overtimeMinutes: 0,
          holidayPremiumMode: "WITH_TIME_OFF",
        }
      : { ...common, kind, recurrence: null };
  }

  function deletionScreen() {
    return (
      <SafeAreaProvider
        initialMetrics={{
          frame: { x: 0, y: 0, width: 430, height: 932 },
          insets: { top: 59, right: 0, bottom: 34, left: 0 },
        }}
      >
        <FeedbackProvider>
          <DayEditorScreen />
        </FeedbackProvider>
      </SafeAreaProvider>
    );
  }

  async function openDeleteDialog(kind: "SHIFT" | "APPOINTMENT") {
    const entry = deletionEntry(kind);
    mockEntries = [entry];
    mockRouteParams = { date: entry.date, mode: kind, entryId: entry.id };
    const alert = jest.spyOn(Alert, "alert");
    const screen = await render(deletionScreen());
    await fireEvent.press(
      screen.getByRole("button", {
        name: kind === "SHIFT" ? "Dienst löschen" : "Termin löschen",
      }),
    );
    const buttons = alert.mock.calls.at(-1)?.[2];
    expect(buttons?.map((button) => button.text)).toEqual(["Abbrechen", "Löschen"]);
    return { screen, entry, cancel: buttons![0], confirm: buttons![1] };
  }

  it.each(["SHIFT", "APPOINTMENT"] as const)(
    "cancels %s deletion without writes or navigation",
    async (kind) => {
      const { screen, entry, cancel } = await openDeleteDialog(kind);
      await act(async () => {
        cancel.onPress?.();
      });
      expect(mockRemoveEntry).not.toHaveBeenCalled();
      expect(mockUpsertShift).not.toHaveBeenCalled();
      expect(mockUpsertAppointment).not.toHaveBeenCalled();
      expect(router.back).not.toHaveBeenCalled();
      expect(screen.getByRole("button", { name: "Schließen und speichern" })).toBeEnabled();
      expect(deletionFeedback).not.toHaveBeenCalled();
      expect(mockEntries).toEqual([entry]);
      expect(screen.getByDisplayValue("Notiz behalten")).toBeTruthy();
    },
  );

  it.each(["SHIFT", "APPOINTMENT"] as const)(
    "keeps the %s editor mounted while deletion cleanup is pending",
    async (kind) => {
      let finish!: () => void;
      mockRemoveEntry.mockImplementation(
        () =>
          new Promise<void>((resolve) => {
            finish = resolve;
          }),
      );
      const { screen, entry, confirm } = await openDeleteDialog(kind);
      await act(async () => {
        confirm.onPress?.();
      });
      expect(mockRemoveEntry).toHaveBeenCalledWith(entry);
      // Provider has removed the persisted entry, but notification cleanup is still pending.
      mockEntries = [];
      await screen.rerender(deletionScreen());
      expect(screen.queryByText("Eintrag nicht verfügbar")).toBeNull();
      expect(screen.getByDisplayValue("Notiz behalten")).toBeTruthy();
      expect(screen.getByRole("button", { name: "Schließen und speichern" })).toBeDisabled();
      expect(router.back).not.toHaveBeenCalled();
      const preventDefault = jest.fn();
      await act(async () => {
        mockBeforeRemoveListener?.({ preventDefault, data: { action: { type: "GO_BACK" } } });
        confirm.onPress?.();
      });
      expect(preventDefault).toHaveBeenCalledTimes(1);
      expect(mockRemoveEntry).toHaveBeenCalledTimes(1);
      await act(async () => {
        finish();
      });
      expect(router.back).toHaveBeenCalledTimes(1);
      expect(deletionFeedback).toHaveBeenCalledTimes(1);
      const exitPreventDefault = jest.fn();
      await act(async () => {
        mockBeforeRemoveListener?.({
          preventDefault: exitPreventDefault,
          data: { action: { type: "GO_BACK" } },
        });
        confirm.onPress?.();
      });
      expect(exitPreventDefault).not.toHaveBeenCalled();
      expect(mockRemoveEntry).toHaveBeenCalledTimes(1);
      expect(router.back).toHaveBeenCalledTimes(1);
      expect(mockUpsertShift).not.toHaveBeenCalled();
      expect(mockUpsertAppointment).not.toHaveBeenCalled();
      expect(screen.queryByText("Eintrag nicht verfügbar")).toBeNull();
    },
  );

  it("keeps inputs after a deletion failure and allows a deliberate retry", async () => {
    mockRemoveEntry.mockRejectedValueOnce(new Error("database unavailable"));
    const { screen, confirm } = await openDeleteDialog("SHIFT");
    await act(async () => {
      confirm.onPress?.();
    });
    expect(screen.getByText("Eintrag konnte nicht gelöscht werden.")).toBeTruthy();
    expect(screen.getByDisplayValue("Notiz behalten")).toBeTruthy();
    expect(router.back).not.toHaveBeenCalled();
    expect(deletionFeedback).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByRole("button", { name: "Dienst löschen" }));
    const retry = jest.mocked(Alert.alert).mock.calls.at(-1)?.[2]?.[1];
    await act(async () => {
      retry?.onPress?.();
    });
    expect(mockRemoveEntry).toHaveBeenCalledTimes(2);
    expect(router.back).toHaveBeenCalledTimes(1);
  });

  it("still reports an externally removed entry as missing", async () => {
    const { screen } = await openDeleteDialog("SHIFT");
    mockEntries = [];
    await screen.rerender(deletionScreen());
    expect(screen.getByText("Eintrag nicht verfügbar")).toBeTruthy();
    expect(mockRemoveEntry).not.toHaveBeenCalled();
  });

  it("does not reuse a deleting entry for another route", async () => {
    let finish!: () => void;
    mockRemoveEntry.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    const { screen, confirm } = await openDeleteDialog("SHIFT");
    await act(async () => {
      confirm.onPress?.();
    });
    mockEntries = [];
    mockRouteParams = { date: "2026-08-20", mode: "SHIFT", entryId: "other-entry" };
    await screen.rerender(deletionScreen());
    expect(screen.getByText("Eintrag nicht verfügbar")).toBeTruthy();
    // Settle the request only after teardown; route changes must not reuse its snapshot.
    await screen.unmount();
    await act(async () => {
      finish();
    });
  });

  it("enters a new shift in the compact overlay and saves without deletion", async () => {
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

    expect(screen.getByTestId("shift-edit-overlay")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Dienst löschen" })).toBeNull();

    await act(async () => {
      fireEvent.press(screen.getByRole("button", { name: "Schließen und speichern" }));
    });

    await waitFor(() => expect(mockUpsertShift).toHaveBeenCalledTimes(1));
    expect(successFeedback).not.toHaveBeenCalled();
    await waitFor(() => expect(router.back).toHaveBeenCalledTimes(1));
    expect(screen.queryByText("Eintrag gespeichert.")).toBeNull();
    expect(screen.queryByText("Eintrag aktualisiert.")).toBeNull();
  });

  it("opens an existing shift in the compact overlay and preserves its revision", async () => {
    mockEntries = [
      {
        kind: "SHIFT",
        id: "shift-1",
        date: "2026-08-20",
        templateId: null,
        title: "Spätdienst",
        type: "LATE",
        allDay: false,
        startTime: "13:00",
        endTime: "21:30",
        breakMinutes: 30,
        color: "#F05C68",
        symbol: "S",
        note: "Übergabe",
        notification: null,
        alarmEnabled: false,
        location: null,
        overtimeMinutes: 0,
        holidayPremiumMode: "WITH_TIME_OFF",
        revision: 4,
        createdAt: "2026-08-01T08:00:00.000Z",
        updatedAt: "2026-08-01T08:00:00.000Z",
        deletedAt: null,
      },
    ];
    mockRouteParams = { date: "2026-08-20", mode: "SHIFT", entryId: "shift-1" };

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

    expect(screen.getByTestId("shift-edit-overlay")).toBeTruthy();
    expect(screen.queryByLabelText("Pausendauer in 15-Minuten-Schritten")).toBeNull();
    await fireEvent.press(screen.getByRole("button", { name: "Pause: 30 Minuten" }));
    await fireEvent.press(screen.getByRole("radio", { name: "60 Minuten" }));
    await fireEvent.press(screen.getByRole("button", { name: "Wecker: Aus" }));
    await fireEvent.press(screen.getByRole("radio", { name: "Zum Dienstbeginn" }));
    const preventDefault = jest.fn();
    await act(async () => {
      mockBeforeRemoveListener?.({
        preventDefault,
        data: { action: { type: "GO_BACK" } },
      });
    });

    await waitFor(() =>
      expect(mockUpsertShift).toHaveBeenCalledWith(
        expect.objectContaining({
          id: "shift-1",
          expectedRevision: 4,
          date: "2026-08-20",
          startTime: "13:00",
          endTime: "21:30",
          breakMinutes: 60,
          alarmEnabled: true,
        }),
      ),
    );
    expect(preventDefault).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(mockNavigationDispatch).toHaveBeenCalledWith({ type: "GO_BACK" }));
    expect(successFeedback).not.toHaveBeenCalled();
  });

  it("opens an existing appointment in the compact overlay and preserves its revision", async () => {
    mockEntries = [
      {
        kind: "APPOINTMENT",
        id: "appointment-1",
        date: "2026-08-22",
        title: "Ohne Titel",
        allDay: false,
        startTime: "12:00",
        endTime: "13:00",
        color: "#2F80ED",
        note: null,
        recurrence: null,
        notification: null,
        location: null,
        revision: 3,
        createdAt: "2026-08-01T08:00:00.000Z",
        updatedAt: "2026-08-01T08:00:00.000Z",
        deletedAt: null,
      },
    ];
    mockRouteParams = {
      date: "2026-08-22",
      mode: "APPOINTMENT",
      entryId: "appointment-1",
    };

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

    expect(screen.getByTestId("appointment-edit-overlay")).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText("Titel"), "Arzttermin");
    const preventDefault = jest.fn();
    await act(async () => {
      mockBeforeRemoveListener?.({
        preventDefault,
        data: { action: { type: "GO_BACK" } },
      });
    });

    await waitFor(() =>
      expect(mockUpsertAppointment).toHaveBeenCalledWith(
        expect.objectContaining({
          id: "appointment-1",
          expectedRevision: 3,
          date: "2026-08-22",
          title: "Arzttermin",
          startTime: "12:00",
          endTime: "13:00",
        }),
      ),
    );
    expect(preventDefault).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(mockNavigationDispatch).toHaveBeenCalledWith({ type: "GO_BACK" }));
    expect(successFeedback).not.toHaveBeenCalled();
  });

  it("enters a new appointment in the compact overlay without deletion", async () => {
    mockRouteParams = { date: "2026-08-23", mode: "APPOINTMENT" };

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

    expect(screen.getByTestId("appointment-edit-overlay")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Termin löschen" })).toBeNull();
    await fireEvent.changeText(screen.getByLabelText("Titel"), "Physiotherapie");
    await act(async () => {
      fireEvent.press(screen.getByRole("button", { name: "Schließen und speichern" }));
    });

    await waitFor(() =>
      expect(mockUpsertAppointment).toHaveBeenCalledWith(
        expect.objectContaining({
          date: "2026-08-23",
          title: "Physiotherapie",
          allDay: false,
          startTime: "12:00",
          endTime: "13:00",
        }),
      ),
    );
    expect(mockUpsertAppointment.mock.calls[0]?.[0]).not.toHaveProperty("id");
    expect(successFeedback).not.toHaveBeenCalled();
  });
});
