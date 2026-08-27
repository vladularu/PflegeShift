import { fireEvent, render, waitFor } from "@testing-library/react-native";
import { describe, expect, it, jest } from "@jest/globals";
import { Pressable, Text } from "react-native";

import {
  PflegeShiftProvider,
  usePflegeShiftEntries,
  usePflegeShiftStatus,
} from "@/application/pflegeshift-provider";
import type { ShiftEntry } from "@/domain/types";
import { saveShift } from "@/infrastructure/database/repository";
import { syncEntryNotifications } from "@/infrastructure/notifications/entry-notifications";

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
const mockDatabase = {};

jest.mock("expo-sqlite", () => ({ useSQLiteContext: () => mockDatabase }));

jest.mock("@/infrastructure/database/repository", () => ({
  deleteCalendarEntry: jest.fn(),
  deleteTemplate: jest.fn(),
  listCalendarEntries: jest.fn(async () => []),
  listMonthlyTariffDecisions: jest.fn(async () => []),
  listTemplates: jest.fn(async () => []),
  loadProfile: jest.fn(async () => null),
  loadTvoedWorkPatternSettings: jest.fn(async () => ({
    workplaceCoverage: "UNKNOWN",
    assignment: "UNKNOWN",
    updatedAt: null,
  })),
  restoreCalendarEntry: jest.fn(),
  restoreTemplate: jest.fn(),
  saveAppointment: jest.fn(),
  saveMonthlyTariffDecision: jest.fn(),
  saveProfile: jest.fn(),
  saveShift: jest.fn(),
  saveTemplate: jest.fn(),
  saveTvoedWorkPatternSettings: jest.fn(),
  swapTemplateSortOrder: jest.fn(),
}));

jest.mock("@/infrastructure/database/test-backup-status-repository", () => ({
  listTestBackupMonths: jest.fn(async () => []),
}));

jest.mock("@/infrastructure/dev-tools-policy", () => ({
  DEV_TOOLS_AVAILABLE: false,
  shouldLoadDevToolState: () => false,
}));

jest.mock("@/infrastructure/diagnostics", () => ({ recordDiagnostic: jest.fn() }));

jest.mock("@/infrastructure/notifications/entry-notifications", () => ({
  cancelEntryNotifications: jest.fn(),
  syncEntryNotifications: jest.fn(),
}));

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
    jest.mocked(saveShift).mockResolvedValue(mockSavedShift);
    jest.mocked(syncEntryNotifications).mockRejectedValue(new Error("scheduler unavailable"));
    const screen = await render(
      <PflegeShiftProvider>
        <Harness />
      </PflegeShiftProvider>,
    );

    await fireEvent.press(screen.getByRole("button", { name: "Speichern" }));

    await waitFor(() =>
      expect(
        screen.getByText("Gespeichert. Erinnerung konnte nicht eingerichtet werden."),
      ).toBeTruthy(),
    );
    expect(saveShift).toHaveBeenCalledTimes(1);
    expect(syncEntryNotifications).toHaveBeenCalledWith(
      expect.anything(),
      mockSavedShift,
      "Europe/Berlin",
    );
  });
});
