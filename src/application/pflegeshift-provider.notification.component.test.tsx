import { act, fireEvent, render, waitFor } from "@testing-library/react-native";
import { describe, expect, it, jest } from "@jest/globals";
import { Pressable, Text } from "react-native";

import type {
  PflegeShiftDiagnosticsPort,
  PflegeShiftNotificationPort,
  PflegeShiftPorts,
  PflegeShiftRepositoryPort,
} from "@/application/pflegeshift-ports";
import {
  PflegeShiftProvider,
  usePflegeShiftEntries,
  usePflegeShiftStatus,
} from "@/application/pflegeshift-provider";
import { calendarRangeCoversMonth } from "@/application/calendar-entry-loading";
import type { CalendarEntry, ShiftEntry, TvoedWorkPatternSettings } from "@/domain/types";

const mockSavedShift: ShiftEntry = {
  kind: "SHIFT",
  id: "shift-warning",
  date: "2026-08-26",
  templateId: null,
  title: "Intensivstation",
  type: "CUSTOM",
  allDay: false,
  startTime: "08:00",
  endTime: "16:00",
  breakMinutes: 30,
  color: "#2F80ED",
  symbol: "I",
  note: null,
  notification: {
    amount: 15,
    unit: "MINUTE",
    direction: "BEFORE",
    reference: "START",
  },
  alarmEnabled: false,
  location: null,
  overtimeMinutes: 0,
  holidayPremiumMode: "WITH_TIME_OFF",
  revision: 1,
  createdAt: "2026-08-26T08:00:00.000Z",
  updatedAt: "2026-08-26T08:00:00.000Z",
  deletedAt: null,
};
const emptyWorkPatternSettings: TvoedWorkPatternSettings = {
  workplaceCoverage: "UNKNOWN",
  assignment: "UNKNOWN",
  updatedAt: null,
};

const repository: PflegeShiftRepositoryPort = {
  loadProfile: jest.fn(async () => null),
  saveProfile: jest.fn(async () => {
    throw new Error("Unexpected saveProfile call");
  }),
  listTemplates: jest.fn(async () => []),
  saveTemplate: jest.fn(async () => {
    throw new Error("Unexpected saveTemplate call");
  }),
  deleteTemplate: jest.fn(async () => undefined),
  restoreTemplate: jest.fn(async () => {
    throw new Error("Unexpected restoreTemplate call");
  }),
  swapTemplateSortOrder: jest.fn(async () => {
    throw new Error("Unexpected swapTemplateSortOrder call");
  }),
  listCalendarEntries: jest.fn(async () => []),
  saveShift: jest.fn(async () => mockSavedShift),
  saveAppointment: jest.fn(async () => {
    throw new Error("Unexpected saveAppointment call");
  }),
  deleteCalendarEntry: jest.fn(async () => undefined),
  restoreCalendarEntry: jest.fn(async () => {
    throw new Error("Unexpected restoreCalendarEntry call");
  }),
  listMonthlyTariffDecisions: jest.fn(async () => []),
  saveMonthlyTariffDecision: jest.fn(async () => {
    throw new Error("Unexpected saveMonthlyTariffDecision call");
  }),
  loadTvoedWorkPatternSettings: jest.fn(async () => emptyWorkPatternSettings),
  saveTvoedWorkPatternSettings: jest.fn(async () => {
    throw new Error("Unexpected saveTvoedWorkPatternSettings call");
  }),
};
const notifications: PflegeShiftNotificationPort = {
  syncEntry: jest.fn(async () => undefined),
  cancelEntry: jest.fn(async () => undefined),
};
const diagnostics: PflegeShiftDiagnosticsPort = {
  record: jest.fn(),
};
const ports: PflegeShiftPorts = {
  repository,
  notifications,
  diagnostics,
  devTools: {
    shouldLoadState: jest.fn(() => false),
    listBackupMonths: jest.fn(async () => []),
  },
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((next, fail) => {
    resolve = next;
    reject = fail;
  });
  return { promise, resolve, reject };
}

function Harness() {
  const { upsertShift } = usePflegeShiftEntries();
  const { notificationWarning } = usePflegeShiftStatus();
  return (
    <>
      <Pressable accessibilityRole="button" onPress={() => void upsertShift(mockSavedShift)}>
        <Text>Speichern</Text>
      </Pressable>
      {notificationWarning ? <Text>{notificationWarning.message}</Text> : null}
    </>
  );
}

function EntryStateHarness() {
  const { entries } = usePflegeShiftEntries();
  const { ready } = usePflegeShiftStatus();
  return <Text>{ready ? entries.map((entry) => entry.title).join(", ") || "Leer" : "Lädt"}</Text>;
}

function RangeHarness({ month }: { month: string }) {
  const { entries, upsertShift, removeEntry } = usePflegeShiftEntries();
  const { ready, calendarRange, error, reload } = usePflegeShiftStatus();
  return (
    <>
      <Text>
        {calendarRangeCoversMonth(calendarRange, month) ? "Kalender bereit" : "Kalender lädt"}
      </Text>
      <Text>{ready ? "Auswertung bereit" : "Auswertung wartet"}</Text>
      <Text>{entries.map((entry) => entry.title).join(", ") || "Leer"}</Text>
      {error ? <Text>{error}</Text> : null}
      <Pressable onPress={() => void reload()}>
        <Text>Neu laden</Text>
      </Pressable>
      <Pressable onPress={() => void upsertShift(mockSavedShift)}>
        <Text>Ändern</Text>
      </Pressable>
      <Pressable onPress={() => void removeEntry(mockSavedShift)}>
        <Text>Löschen</Text>
      </Pressable>
    </>
  );
}

describe("PflegeShiftProvider notification feedback", () => {
  it.each([false, true])(
    "preserves a newly inserted service (then deleted = %s) across a pending range query",
    async (remove) => {
      const earlier = { ...mockSavedShift, id: "early", title: "Vorher", date: "2026-08-25" };
      const later = { ...mockSavedShift, id: "late", title: "Nachher", date: "2026-08-27" };
      const pending = deferred<readonly CalendarEntry[]>();
      jest
        .mocked(repository.listCalendarEntries)
        .mockResolvedValueOnce([earlier, later])
        .mockImplementationOnce(() => pending.promise);
      jest.mocked(repository.saveShift).mockResolvedValue(mockSavedShift);
      jest.mocked(notifications.syncEntry).mockResolvedValue(undefined);
      const screen = await render(
        <PflegeShiftProvider activeMonth="2026-12" ports={ports}>
          <RangeHarness month="2026-12" />
        </PflegeShiftProvider>,
      );
      await screen.rerender(
        <PflegeShiftProvider activeMonth="2027-01" ports={ports}>
          <RangeHarness month="2027-01" />
        </PflegeShiftProvider>,
      );
      await fireEvent.press(screen.getByText("Ändern"));
      if (remove) await fireEvent.press(screen.getByText("Löschen"));
      await act(async () =>
        pending.resolve(remove ? [earlier, mockSavedShift, later] : [earlier, later]),
      );
      expect(
        screen.getByText(remove ? "Vorher, Nachher" : "Vorher, Intensivstation, Nachher"),
      ).toBeTruthy();
    },
  );

  it.each([
    ["2026-12", "2027-01"],
    ["2027-01", "2026-12"],
  ])(
    "keeps calendar data while loading %s to %s without reloading metadata or reminders",
    async (from, to) => {
      const pending = deferred<readonly CalendarEntry[]>();
      jest
        .mocked(repository.listCalendarEntries)
        .mockResolvedValueOnce([mockSavedShift])
        .mockImplementationOnce(() => pending.promise);
      jest.mocked(notifications.syncEntry).mockResolvedValue(undefined);
      const screen = await render(
        <PflegeShiftProvider activeMonth={from} ports={ports}>
          <RangeHarness month={from} />
        </PflegeShiftProvider>,
      );
      expect(screen.getByText("Auswertung bereit")).toBeTruthy();
      const notificationCalls = jest.mocked(notifications.syncEntry).mock.calls.length;
      await screen.rerender(
        <PflegeShiftProvider activeMonth={to} ports={ports}>
          <RangeHarness month={to} />
        </PflegeShiftProvider>,
      );
      expect(screen.getByText("Kalender bereit")).toBeTruthy();
      expect(screen.getByText("Auswertung wartet")).toBeTruthy();
      expect(screen.getByText("Intensivstation")).toBeTruthy();
      expect(repository.loadProfile).toHaveBeenCalledTimes(1);
      expect(repository.listTemplates).toHaveBeenCalledTimes(1);
      expect(repository.listMonthlyTariffDecisions).toHaveBeenCalledTimes(1);
      expect(repository.loadTvoedWorkPatternSettings).toHaveBeenCalledTimes(1);
      await act(async () => pending.resolve([mockSavedShift]));
      expect(screen.getByText("Auswertung bereit")).toBeTruthy();
      expect(notifications.syncEntry).toHaveBeenCalledTimes(notificationCalls);
    },
  );

  it("does not present a distant unloaded month as an empty calendar and ignores late range results", async () => {
    const older = deferred<readonly CalendarEntry[]>();
    const latest = deferred<readonly CalendarEntry[]>();
    jest
      .mocked(repository.listCalendarEntries)
      .mockResolvedValueOnce([mockSavedShift])
      .mockImplementationOnce(() => older.promise)
      .mockImplementationOnce(() => latest.promise);
    const screen = await render(
      <PflegeShiftProvider activeMonth="2026-12" ports={ports}>
        <RangeHarness month="2026-12" />
      </PflegeShiftProvider>,
    );
    await screen.rerender(
      <PflegeShiftProvider activeMonth="2030-01" ports={ports}>
        <RangeHarness month="2030-01" />
      </PflegeShiftProvider>,
    );
    expect(screen.getByText("Kalender lädt")).toBeTruthy();
    await screen.rerender(
      <PflegeShiftProvider activeMonth="2027-01" ports={ports}>
        <RangeHarness month="2027-01" />
      </PflegeShiftProvider>,
    );
    await act(async () => latest.resolve([{ ...mockSavedShift, title: "Aktuell" }]));
    await act(async () => older.resolve([{ ...mockSavedShift, title: "Veraltet" }]));
    expect(screen.getByText("Aktuell")).toBeTruthy();
    expect(screen.queryByText("Veraltet")).toBeNull();
    expect(screen.getByText("Kalender bereit")).toBeTruthy();
  });

  it.each(["Ändern", "Löschen"])(
    "preserves %s while a background range is loading",
    async (action) => {
      const pending = deferred<readonly CalendarEntry[]>();
      jest
        .mocked(repository.listCalendarEntries)
        .mockResolvedValueOnce([mockSavedShift])
        .mockImplementationOnce(() => pending.promise);
      jest
        .mocked(repository.saveShift)
        .mockResolvedValue({ ...mockSavedShift, revision: 2, title: "Bearbeitet" });
      jest.mocked(notifications.syncEntry).mockResolvedValue(undefined);
      const screen = await render(
        <PflegeShiftProvider activeMonth="2026-12" ports={ports}>
          <RangeHarness month="2026-12" />
        </PflegeShiftProvider>,
      );
      await screen.rerender(
        <PflegeShiftProvider activeMonth="2027-01" ports={ports}>
          <RangeHarness month="2027-01" />
        </PflegeShiftProvider>,
      );
      await fireEvent.press(screen.getByText(action));
      await act(async () => pending.resolve([mockSavedShift]));
      expect(screen.getByText(action === "Ändern" ? "Bearbeitet" : "Leer")).toBeTruthy();
      expect(screen.queryByText("Intensivstation")).toBeNull();
    },
  );

  it("reports background failures and retries with a full snapshot", async () => {
    const pending = deferred<readonly CalendarEntry[]>();
    jest
      .mocked(repository.listCalendarEntries)
      .mockResolvedValueOnce([mockSavedShift])
      .mockImplementationOnce(() => pending.promise)
      .mockResolvedValueOnce([]);
    const screen = await render(
      <PflegeShiftProvider activeMonth="2026-12" ports={ports}>
        <RangeHarness month="2026-12" />
      </PflegeShiftProvider>,
    );
    await screen.rerender(
      <PflegeShiftProvider activeMonth="2027-01" ports={ports}>
        <RangeHarness month="2027-01" />
      </PflegeShiftProvider>,
    );
    await act(async () => pending.reject(new Error("read failed")));
    expect(diagnostics.record).toHaveBeenCalledWith(
      "provider",
      "PROVIDER_RELOAD_FAILED",
      expect.any(Error),
    );
    expect(screen.getByText("Intensivstation")).toBeTruthy();
    await fireEvent.press(screen.getByText("Neu laden"));
    expect(repository.loadProfile).toHaveBeenCalledTimes(2);
    expect(screen.getByText("Leer")).toBeTruthy();
    expect(screen.getByText("Auswertung bereit")).toBeTruthy();
  });

  it("keeps the saved entry and publishes a non-blocking scheduling warning", async () => {
    jest.mocked(repository.saveShift).mockResolvedValue(mockSavedShift);
    jest.mocked(notifications.syncEntry).mockRejectedValue(new Error("scheduler unavailable"));
    const screen = await render(
      <PflegeShiftProvider activeMonth="2026-08" ports={ports}>
        <Harness />
      </PflegeShiftProvider>,
    );

    await fireEvent.press(screen.getByRole("button", { name: "Speichern" }));

    await waitFor(() =>
      expect(
        screen.getByText("Gespeichert. Erinnerung konnte nicht eingerichtet werden."),
      ).toBeTruthy(),
    );
    expect(repository.saveShift).toHaveBeenCalledWith(mockSavedShift);
    expect(repository.listCalendarEntries).toHaveBeenCalledWith("2025-01-01", "2027-12-31");
    expect(notifications.syncEntry).toHaveBeenCalledWith(mockSavedShift, "Europe/Berlin");
    expect(diagnostics.record).toHaveBeenCalledWith(
      "notifications",
      "SHIFT_NOTIFICATION_SYNC_FAILED",
      expect.any(Error),
    );
  });

  it("reloads only when the annual window changes and ignores stale results", async () => {
    const firstLoad = deferred<readonly CalendarEntry[]>();
    const secondLoad = deferred<readonly CalendarEntry[]>();
    const nextShift = { ...mockSavedShift, id: "shift-next", title: "Neues Fenster" };
    jest
      .mocked(repository.listCalendarEntries)
      .mockImplementationOnce(() => firstLoad.promise)
      .mockImplementationOnce(() => secondLoad.promise);
    jest.mocked(notifications.syncEntry).mockResolvedValue(undefined);
    const screen = await render(
      <PflegeShiftProvider activeMonth="2026-08" ports={ports}>
        <EntryStateHarness />
      </PflegeShiftProvider>,
    );

    await screen.rerender(
      <PflegeShiftProvider activeMonth="2026-09" ports={ports}>
        <EntryStateHarness />
      </PflegeShiftProvider>,
    );
    expect(repository.listCalendarEntries).toHaveBeenCalledTimes(1);

    await screen.rerender(
      <PflegeShiftProvider activeMonth="2027-01" ports={ports}>
        <EntryStateHarness />
      </PflegeShiftProvider>,
    );
    await waitFor(() => expect(repository.listCalendarEntries).toHaveBeenCalledTimes(2));

    await act(async () => secondLoad.resolve([nextShift]));
    await waitFor(() => expect(screen.getByText("Neues Fenster")).toBeTruthy());

    await act(async () => firstLoad.resolve([mockSavedShift]));
    expect(screen.queryByText("Intensivstation")).toBeNull();
    expect(screen.getByText("Neues Fenster")).toBeTruthy();
  });
});
