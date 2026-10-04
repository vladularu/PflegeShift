import { act, fireEvent, render, waitFor } from "@testing-library/react-native";
import { describe, expect, it, jest } from "@jest/globals";
import { Pressable, Text } from "react-native";

import type {
  PflegeShiftDiagnosticsPort,
  PflegeShiftNotificationPort,
  PflegeShiftPorts,
  PflegeShiftRepositoryPort,
  RemunerationSnapshot,
} from "@/application/pflegeshift-ports";
import {
  PflegeShiftProvider,
  usePflegeShiftEntries,
  usePflegeShiftProfile,
  usePflegeShiftStatus,
} from "@/application/pflegeshift-provider";
import { useRemunerationData } from "@/application/remuneration-provider";
import type { DatedRemunerationProfile } from "@/domain/remuneration-profile";
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
  training: {
    loadSnapshot: jest.fn(async () => ({ profiles: [], shifts: [] })),
    saveProfile: jest.fn(async () => {
      throw new Error("Unexpected training save");
    }),
    saveShift: jest.fn(async () => {
      throw new Error("Unexpected training shift save");
    }),
  },
  repository,
  remuneration: {
    saveDrkEmployeeMonthConfirmation: jest.fn(async () => {
      throw new Error("Unexpected DRK month confirmation save");
    }),
    saveDrkTrainingMonthConfirmation: jest.fn(async () => {
      throw new Error("Unexpected DRK training month confirmation save");
    }),
    saveCaritasMonthFacts: jest.fn(async () => {
      throw new Error("Unexpected Caritas month facts save");
    }),
    saveTvoedAnnexAMonthConfirmation: jest.fn(async () => {
      throw new Error("Unexpected TVöD month confirmation save");
    }),
    saveTvoedAnnexAPremiumFacts: jest.fn(async () => {
      throw new Error("Unexpected TVöD premium facts save");
    }),
    saveTvoedSueMonthConfirmation: jest.fn(async () => {
      throw new Error("Unexpected SuE month confirmation save");
    }),
    saveTvoedSueAllowanceConfirmation: jest.fn(async () => {
      throw new Error("Unexpected SuE allowance confirmation save");
    }),
    saveTvlShiftWork: jest.fn(async () => {
      throw new Error("Unexpected TV-L save");
    }),
    saveTariffAnnualClaim: jest.fn(async () => {
      throw new Error("Unexpected tariff annual claim save");
    }),
    revokeTariffAnnualClaim: jest.fn(async () => {
      throw new Error("Unexpected tariff annual claim revoke");
    }),
    saveActualAnnualPayment: jest.fn(async () => {
      throw new Error("Unexpected annual payment save");
    }),
    revokeActualAnnualPayment: jest.fn(async () => {
      throw new Error("Unexpected annual payment revoke");
    }),
    savePaidAbsence: jest.fn(async () => {
      throw new Error("Unexpected paid absence save");
    }),
    loadSnapshot: jest.fn(async () => ({
      drkEmployeeMonthConfirmations: [],
      drkTrainingMonthConfirmations: [],
      caritasMonthFacts: [],
      tvoedAnnexAMonthConfirmations: [],
      tvoedAnnexAPremiumFacts: [],
      tvoedSueMonthConfirmations: [],
      tvoedSueAllowanceConfirmations: [],
      tvlShiftWork: [],
      profiles: [],
      allowanceDecisions: [],
      overtimeAllocations: [],
      paidAbsences: [],
      actualAnnualPayments: [],
      tariffAnnualClaims: [],
    })),
    saveOvertimeAllocation: jest.fn(async () => {
      throw new Error("Unexpected overtime save");
    }),
    saveProfile: jest.fn(async () => {
      throw new Error("Unexpected remuneration save");
    }),
    saveAllowanceDecisions: jest.fn(async () => {
      throw new Error("Unexpected allowance save");
    }),
  },
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

function RemunerationIntegrationHarness() {
  const history = useRemunerationData();
  const { reload } = usePflegeShiftStatus();
  const { updateProfile } = usePflegeShiftProfile();
  return (
    <>
      <Text testID="history-status">{history.status}</Text>
      <Text testID="history-count">{history.profiles.length}</Text>
      <Text testID="allowance-count">{history.allowanceDecisions.length}</Text>
      <Text testID="overtime-count">{history.overtimeAllocations.length}</Text>
      <Pressable
        onPress={() =>
          void history.saveOvertimeAllocation({
            shiftId: "shift-1",
            expectedShiftRevision: 1,
            expectedRevision: 0,
            timeZone: "Europe/Berlin",
            allocations: null,
          })
        }
      >
        <Text>Überstunden speichern</Text>
      </Pressable>
      <Pressable
        onPress={() =>
          void history.saveAllowanceDecisions({
            month: "2026-09",
            expectedRevision: 0,
            decisions: [],
          })
        }
      >
        <Text>Zulagen speichern</Text>
      </Pressable>
      <Pressable onPress={() => void reload()}>
        <Text>Vollständig laden</Text>
      </Pressable>
      <Pressable
        onPress={() =>
          void updateProfile({ federalState: "NW", weeklyMinutes: 2310, timeZone: "Europe/Berlin" })
        }
      >
        <Text>Arbeitsprofil speichern</Text>
      </Pressable>
      <Pressable
        onPress={() =>
          void history.saveProfile({
            effectiveFrom: "2026-10-01",
            expectedRevision: 0,
            data: {
              version: 1,
              weeklyMinutes: 2310,
              selection: { kind: "own-monthly", monthlyGrossCents: 300000 },
            },
          })
        }
      >
        <Text>Vergütung speichern</Text>
      </Pressable>
    </>
  );
}

describe("PflegeShiftProvider notification feedback", () => {
  it("reloads history after full restore/profile reloads but remuneration writes do not reschedule reminders", async () => {
    const dated: DatedRemunerationProfile = {
      effectiveFrom: "2026-10-01",
      revision: 1,
      createdAt: "2026-09-21T00:00:00Z",
      updatedAt: "2026-09-21T00:00:00Z",
      data: {
        version: 1,
        weeklyMinutes: 2310,
        selection: { kind: "own-monthly", monthlyGrossCents: 300000 },
      },
    };
    const savedProfile = {
      federalState: "NW" as const,
      holidayRegion: "NONE" as const,
      weeklyMinutes: 2310,
      timeZone: "Europe/Berlin",
      tariff: null,
      regularRotatingNightWork: null,
      sundayHolidayWorkEligible: null,
      allEmploymentWorkRecorded: null,
      createdAt: dated.createdAt,
      updatedAt: dated.updatedAt,
    };
    const localPorts: PflegeShiftPorts = {
      ...ports,
      repository: {
        ...repository,
        loadProfile: jest.fn(async () => savedProfile),
        saveProfile: jest.fn(async () => savedProfile),
        listCalendarEntries: jest.fn(async () => [mockSavedShift]),
      },
      remuneration: {
        saveDrkEmployeeMonthConfirmation: ports.remuneration.saveDrkEmployeeMonthConfirmation,
        saveDrkTrainingMonthConfirmation: ports.remuneration.saveDrkTrainingMonthConfirmation,
        saveCaritasMonthFacts: ports.remuneration.saveCaritasMonthFacts,
        saveTvoedAnnexAMonthConfirmation: ports.remuneration.saveTvoedAnnexAMonthConfirmation,
        saveTvoedAnnexAPremiumFacts: ports.remuneration.saveTvoedAnnexAPremiumFacts,
        saveTvoedSueMonthConfirmation: ports.remuneration.saveTvoedSueMonthConfirmation,
        saveTvoedSueAllowanceConfirmation: ports.remuneration.saveTvoedSueAllowanceConfirmation,
        saveTvlShiftWork: ports.remuneration.saveTvlShiftWork,
        saveTariffAnnualClaim: ports.remuneration.saveTariffAnnualClaim,
        revokeTariffAnnualClaim: ports.remuneration.revokeTariffAnnualClaim,
        saveActualAnnualPayment: ports.remuneration.saveActualAnnualPayment,
        revokeActualAnnualPayment: ports.remuneration.revokeActualAnnualPayment,
        savePaidAbsence: ports.remuneration.savePaidAbsence,
        loadSnapshot: jest.fn(async (): Promise<RemunerationSnapshot> => ({
          drkEmployeeMonthConfirmations: [],
          drkTrainingMonthConfirmations: [],
          caritasMonthFacts: [],
          tvoedAnnexAMonthConfirmations: [],
          tvoedAnnexAPremiumFacts: [],
          tvoedSueMonthConfirmations: [],
          tvoedSueAllowanceConfirmations: [],
          tvlShiftWork: [],
          profiles: [],
          allowanceDecisions: [],
          overtimeAllocations: [],
          paidAbsences: [],
          actualAnnualPayments: [],
          tariffAnnualClaims: [],
        })),
        saveProfile: jest.fn(async () => dated),
        saveOvertimeAllocation: jest.fn(async () => ({
          shiftId: "shift-1",
          shiftRevision: 1,
          timeZone: "Europe/Berlin",
          allocations: null,
          revision: 1,
          confirmedAt: dated.updatedAt,
          updatedAt: dated.updatedAt,
        })),
        saveAllowanceDecisions: jest.fn(async () => ({
          month: "2026-09",
          revision: 1,
          updatedAt: dated.updatedAt,
          decisions: [],
        })),
      },
      notifications: {
        syncEntry: jest.fn(async () => undefined),
        cancelEntry: jest.fn(async () => undefined),
      },
    };
    const view = await render(
      <PflegeShiftProvider activeMonth="2026-09" ports={localPorts}>
        <RemunerationIntegrationHarness />
      </PflegeShiftProvider>,
    );
    await waitFor(() => expect(view.getByTestId("history-status").props.children).toBe("ready"));
    const initialReads = jest.mocked(localPorts.remuneration.loadSnapshot).mock.calls.length;
    jest.mocked(localPorts.remuneration.loadSnapshot).mockResolvedValue({
      drkEmployeeMonthConfirmations: [],
      drkTrainingMonthConfirmations: [],
      caritasMonthFacts: [],
      tvoedAnnexAMonthConfirmations: [],
      tvoedAnnexAPremiumFacts: [],
      tvoedSueMonthConfirmations: [],
      tvoedSueAllowanceConfirmations: [],
      tvlShiftWork: [],
      actualAnnualPayments: [],
      tariffAnnualClaims: [],
      paidAbsences: [],
      profiles: [dated],
      overtimeAllocations: [
        {
          shiftId: "shift-1",
          shiftRevision: 1,
          revision: 1,
          timeZone: "Europe/Berlin",
          allocations: null,
          confirmedAt: dated.updatedAt,
          updatedAt: dated.updatedAt,
        },
      ],
      allowanceDecisions: [
        { month: "2026-09", revision: 1, updatedAt: dated.updatedAt, decisions: [] },
      ],
    });
    await fireEvent.press(view.getByText("Vollständig laden"));
    await waitFor(() => expect(view.getByTestId("history-count").props.children).toBe(1));
    expect(view.getByTestId("allowance-count").props.children).toBe(1);
    expect(view.getByTestId("overtime-count").props.children).toBe(1);
    expect(jest.mocked(localPorts.remuneration.loadSnapshot).mock.calls.length).toBeGreaterThan(
      initialReads,
    );
    const beforeProfile = jest.mocked(localPorts.remuneration.loadSnapshot).mock.calls.length;
    await fireEvent.press(view.getByText("Arbeitsprofil speichern"));
    await waitFor(() =>
      expect(jest.mocked(localPorts.remuneration.loadSnapshot).mock.calls.length).toBeGreaterThan(
        beforeProfile,
      ),
    );
    const notificationCalls = jest.mocked(localPorts.notifications.syncEntry).mock.calls.length;
    const profileCalls = jest.mocked(localPorts.repository.saveProfile).mock.calls.length;
    await fireEvent.press(view.getByText("Vergütung speichern"));
    await waitFor(() => expect(localPorts.remuneration.saveProfile).toHaveBeenCalledTimes(1));
    expect(localPorts.repository.saveProfile).toHaveBeenCalledTimes(profileCalls);
    expect(localPorts.notifications.syncEntry).toHaveBeenCalledTimes(notificationCalls);
    const entryReads = jest.mocked(localPorts.repository.listCalendarEntries).mock.calls.length;
    const cancelCalls = jest.mocked(localPorts.notifications.cancelEntry).mock.calls.length;
    await fireEvent.press(view.getByText("Zulagen speichern"));
    await waitFor(() =>
      expect(localPorts.remuneration.saveAllowanceDecisions).toHaveBeenCalledTimes(1),
    );
    await waitFor(() => expect(view.getByTestId("history-status").props.children).toBe("ready"));
    expect(localPorts.repository.listCalendarEntries).toHaveBeenCalledTimes(entryReads);
    expect(localPorts.repository.saveProfile).toHaveBeenCalledTimes(profileCalls);
    expect(localPorts.notifications.syncEntry).toHaveBeenCalledTimes(notificationCalls);
    expect(localPorts.notifications.cancelEntry).toHaveBeenCalledTimes(cancelCalls);
    const beforeOvertime = jest.mocked(localPorts.remuneration.loadSnapshot).mock.calls.length;
    await fireEvent.press(view.getByText("Überstunden speichern"));
    await waitFor(() => expect(view.getByTestId("history-status").props.children).toBe("ready"));
    expect(localPorts.remuneration.saveOvertimeAllocation).toHaveBeenCalledWith({
      shiftId: "shift-1",
      expectedShiftRevision: 1,
      expectedRevision: 0,
      timeZone: "Europe/Berlin",
      allocations: null,
    });
    expect(jest.mocked(localPorts.remuneration.loadSnapshot).mock.calls.length).toBe(
      beforeOvertime + 1,
    );
    expect(localPorts.repository.listCalendarEntries).toHaveBeenCalledTimes(entryReads);
    expect(localPorts.repository.saveProfile).toHaveBeenCalledTimes(profileCalls);
    expect(localPorts.notifications.syncEntry).toHaveBeenCalledTimes(notificationCalls);
    expect(localPorts.notifications.cancelEntry).toHaveBeenCalledTimes(cancelCalls);
  });
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
