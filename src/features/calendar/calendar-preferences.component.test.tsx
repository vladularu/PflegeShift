import { act, fireEvent, render, waitFor } from "@testing-library/react-native";
import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { Pressable, Text, View } from "react-native";

import type { CalendarPreferencesData } from "@/domain/types";
import {
  CalendarPreferencesProvider,
  useCalendarPreferences,
} from "@/features/calendar/calendar-preferences";

const mockDatabase = {};
const mockDefaults: CalendarPreferencesData = {
  viewMode: "MONTH",
  showShifts: true,
  showAppointments: true,
  showHolidays: true,
  labelMode: "FULL",
  showShiftTimes: false,
  showShiftDuration: false,
};
const mockLoadCalendarPreferences = jest.fn<() => Promise<CalendarPreferencesData>>();
const mockSaveCalendarPreferences =
  jest.fn<(_database: unknown, preferences: CalendarPreferencesData) => Promise<void>>();

jest.mock("expo-sqlite", () => ({
  useSQLiteContext: () => mockDatabase,
}));

jest.mock("@/infrastructure/database/repository", () => ({
  get DEFAULT_CALENDAR_PREFERENCES() {
    return mockDefaults;
  },
  loadCalendarPreferences: () => mockLoadCalendarPreferences(),
  saveCalendarPreferences: (database: unknown, preferences: CalendarPreferencesData) =>
    mockSaveCalendarPreferences(database, preferences),
}));

function PreferencesHarness() {
  const preferences = useCalendarPreferences();
  return (
    <View>
      <Text>{preferences.viewMode}</Text>
      <Text testID="snapshot">
        {JSON.stringify({
          viewMode: preferences.viewMode,
          showShifts: preferences.showShifts,
          showAppointments: preferences.showAppointments,
          showHolidays: preferences.showHolidays,
          labelMode: preferences.labelMode,
          showShiftTimes: preferences.showShiftTimes,
          showShiftDuration: preferences.showShiftDuration,
        })}
      </Text>
      <Text>{preferences.ready ? "READY" : "LOADING"}</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Anzeige zurücksetzen"
        onPress={preferences.resetDisplay}
      />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Dienste ausblenden"
        onPress={() => preferences.setShowShifts(false)}
      />
      <Text>{preferences.error ?? "OK"}</Text>
      <Pressable
        accessibilityLabel="Jahresansicht wählen"
        accessibilityRole="button"
        onPress={() => preferences.setViewMode("YEAR")}
      />
      <Pressable
        accessibilityLabel="Erneut versuchen"
        accessibilityRole="button"
        onPress={preferences.retry}
      />
    </View>
  );
}

describe("CalendarPreferencesProvider", () => {
  beforeEach(() => {
    mockLoadCalendarPreferences.mockReset();
    mockSaveCalendarPreferences.mockReset();
    mockLoadCalendarPreferences.mockResolvedValue(mockDefaults);
  });

  it("rolls back a failed optimistic write and retries the complete snapshot", async () => {
    mockSaveCalendarPreferences
      .mockRejectedValueOnce(new Error("database unavailable"))
      .mockResolvedValueOnce();
    const screen = await render(
      <CalendarPreferencesProvider>
        <PreferencesHarness />
      </CalendarPreferencesProvider>,
    );

    await waitFor(() => expect(screen.getByText("OK")).toBeTruthy());
    await act(async () => {
      fireEvent.press(screen.getByRole("button", { name: "Jahresansicht wählen" }));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    await waitFor(() => {
      expect(screen.getByText("MONTH")).toBeTruthy();
      expect(screen.getByText("Kalenderansicht konnte nicht gespeichert werden.")).toBeTruthy();
    });

    await act(async () => {
      fireEvent.press(screen.getByRole("button", { name: "Erneut versuchen" }));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    await waitFor(() => {
      expect(screen.getByText("YEAR")).toBeTruthy();
      expect(screen.getByText("OK")).toBeTruthy();
    });
    expect(mockSaveCalendarPreferences).toHaveBeenLastCalledWith(
      mockDatabase,
      expect.objectContaining({ viewMode: "YEAR" }),
    );
  });

  it("surfaces a load failure and reloads on retry", async () => {
    mockLoadCalendarPreferences
      .mockRejectedValueOnce(new Error("database unavailable"))
      .mockResolvedValueOnce(mockDefaults);
    const screen = await render(
      <CalendarPreferencesProvider>
        <PreferencesHarness />
      </CalendarPreferencesProvider>,
    );

    await waitFor(() =>
      expect(screen.getByText("Kalenderansicht konnte nicht geladen werden.")).toBeTruthy(),
    );
    await act(async () => {
      fireEvent.press(screen.getByRole("button", { name: "Erneut versuchen" }));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    await waitFor(() => expect(screen.getByText("OK")).toBeTruthy());
    expect(mockLoadCalendarPreferences).toHaveBeenCalledTimes(2);
  });
  it("loads a complete existing profile without writing defaults, and restores it after remount", async () => {
    const stored: CalendarPreferencesData = {
      viewMode: "YEAR",
      showShifts: false,
      showAppointments: false,
      showHolidays: true,
      labelMode: "SYMBOL",
      showShiftTimes: true,
      showShiftDuration: true,
    };
    mockLoadCalendarPreferences.mockResolvedValue(stored);
    mockSaveCalendarPreferences.mockImplementation(async (_db, snapshot) => {
      mockLoadCalendarPreferences.mockResolvedValue(snapshot);
    });
    const screen = await render(
      <CalendarPreferencesProvider>
        <PreferencesHarness />
      </CalendarPreferencesProvider>,
    );
    await waitFor(() => expect(screen.getByText("READY")).toBeTruthy());
    expect(JSON.parse(screen.getByTestId("snapshot").props.children)).toEqual(stored);
    expect(mockSaveCalendarPreferences).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByRole("button", { name: "Anzeige zurücksetzen" }));
    await waitFor(() => expect(mockSaveCalendarPreferences).toHaveBeenCalledTimes(1));
    const expected = { ...mockDefaults, viewMode: "YEAR" };
    expect(mockSaveCalendarPreferences).toHaveBeenLastCalledWith(mockDatabase, expected);
    await screen.unmount();
    const restarted = await render(
      <CalendarPreferencesProvider>
        <PreferencesHarness />
      </CalendarPreferencesProvider>,
    );
    await waitFor(() => expect(restarted.getByText("READY")).toBeTruthy());
    expect(JSON.parse(restarted.getByTestId("snapshot").props.children)).toEqual(expected);
    expect(mockSaveCalendarPreferences).toHaveBeenCalledTimes(1);
  });
  it("rejects premature updates while the existing settings are still loading", async () => {
    let complete: ((data: CalendarPreferencesData) => void) | undefined;
    mockLoadCalendarPreferences.mockImplementation(
      () =>
        new Promise((resolve) => {
          complete = resolve;
        }),
    );
    const screen = await render(
      <CalendarPreferencesProvider>
        <PreferencesHarness />
      </CalendarPreferencesProvider>,
    );
    await fireEvent.press(screen.getByRole("button", { name: "Anzeige zurücksetzen" }));
    await fireEvent.press(screen.getByRole("button", { name: "Dienste ausblenden" }));
    expect(mockSaveCalendarPreferences).not.toHaveBeenCalled();
    const stored = { ...mockDefaults, labelMode: "SYMBOL" as const, showShiftTimes: true };
    await act(async () => {
      complete?.(stored);
    });
    expect(JSON.parse(screen.getByTestId("snapshot").props.children)).toEqual(stored);
    expect(screen.getByText("READY")).toBeTruthy();
  });
  it("keeps hidden service label and time preferences and rolls back a failed reset", async () => {
    const stored = {
      ...mockDefaults,
      labelMode: "SYMBOL" as const,
      showShiftTimes: true,
      showShiftDuration: true,
    };
    mockLoadCalendarPreferences.mockResolvedValue(stored);
    mockSaveCalendarPreferences
      .mockResolvedValueOnce()
      .mockRejectedValueOnce(new Error("disk unavailable"))
      .mockResolvedValueOnce();
    const screen = await render(
      <CalendarPreferencesProvider>
        <PreferencesHarness />
      </CalendarPreferencesProvider>,
    );
    await waitFor(() => expect(screen.getByText("READY")).toBeTruthy());
    await fireEvent.press(screen.getByRole("button", { name: "Dienste ausblenden" }));
    const hidden = { ...stored, showShifts: false };
    await waitFor(() =>
      expect(mockSaveCalendarPreferences).toHaveBeenCalledWith(mockDatabase, hidden),
    );
    await fireEvent.press(screen.getByRole("button", { name: "Anzeige zurücksetzen" }));
    await waitFor(() =>
      expect(screen.getByText("Kalenderansicht konnte nicht gespeichert werden.")).toBeTruthy(),
    );
    expect(JSON.parse(screen.getByTestId("snapshot").props.children)).toEqual(hidden);
    await fireEvent.press(screen.getByRole("button", { name: "Erneut versuchen" }));
    await waitFor(() => expect(screen.getByText("OK")).toBeTruthy());
    expect(JSON.parse(screen.getByTestId("snapshot").props.children)).toEqual(mockDefaults);
  });
});
