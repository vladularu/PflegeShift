import { fireEvent, render, waitFor } from "@testing-library/react-native";
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
import type { ShiftEntry, TvoedWorkPatternSettings } from "@/domain/types";

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

describe("PflegeShiftProvider notification feedback", () => {
  it("keeps the saved entry and publishes a non-blocking scheduling warning", async () => {
    jest.mocked(repository.saveShift).mockResolvedValue(mockSavedShift);
    jest.mocked(notifications.syncEntry).mockRejectedValue(new Error("scheduler unavailable"));
    const screen = await render(
      <PflegeShiftProvider ports={ports}>
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
    expect(notifications.syncEntry).toHaveBeenCalledWith(mockSavedShift, "Europe/Berlin");
    expect(diagnostics.record).toHaveBeenCalledWith(
      "notifications",
      "SHIFT_NOTIFICATION_SYNC_FAILED",
      expect.any(Error),
    );
  });
});
