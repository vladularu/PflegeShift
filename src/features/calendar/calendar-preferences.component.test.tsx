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
  DEFAULT_CALENDAR_PREFERENCES: mockDefaults,
  loadCalendarPreferences: () => mockLoadCalendarPreferences(),
  saveCalendarPreferences: (database: unknown, preferences: CalendarPreferencesData) =>
    mockSaveCalendarPreferences(database, preferences),
}));

function PreferencesHarness() {
  const preferences = useCalendarPreferences();
  return (
    <View>
      <Text>{preferences.viewMode}</Text>
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
});
