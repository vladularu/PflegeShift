import { act, fireEvent, render } from "@testing-library/react-native";
import { beforeEach, describe, expect, it, jest } from "@jest/globals";

import { CalendarViewScreen } from "@/features/calendar/calendar-view-screen";

jest.mock("@/ui/shift-symbol", () => {
  const React = jest.requireActual<typeof import("react")>("react");
  const { Text } = jest.requireActual<typeof import("react-native")>("react-native");
  return {
    ShiftSymbol: ({
      color,
      size,
      value,
    }: {
      readonly color: string;
      readonly size: number;
      readonly value: string;
    }) =>
      React.createElement(
        Text,
        { style: { color, fontSize: size }, testID: `shift-symbol-${value}` },
        value,
      ),
  };
});

type MockLabelMode = "FULL" | "SHORT" | "SYMBOL";

const mockPreferences = {
  viewMode: "MONTH" as const,
  showShifts: true,
  showAppointments: true,
  showHolidays: true,
  labelMode: "FULL" as MockLabelMode,
  showShiftTimes: false,
  showShiftDuration: true,
  error: null,
  saving: false,
  retry: jest.fn(),
  setViewMode: jest.fn(),
  setShowShifts: jest.fn(),
  setShowAppointments: jest.fn(),
  setShowHolidays: jest.fn(),
  setLabelMode: jest.fn(),
  setShowShiftTimes: jest.fn(),
  setShowShiftDuration: jest.fn(),
};

jest.mock("@/features/calendar/calendar-preferences", () => ({
  useCalendarPreferences: () => mockPreferences,
}));

describe("CalendarViewScreen", () => {
  beforeEach(() => {
    mockPreferences.labelMode = "FULL";
    mockPreferences.showShiftTimes = false;
    mockPreferences.showShiftDuration = true;
  });

  it("offers separate full-name, short-label and symbol tabs", async () => {
    const screen = await render(<CalendarViewScreen />);

    expect(screen.getAllByRole("tab")).toHaveLength(3);
    expect(screen.getByRole("tab", { name: "Voller Name" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Nur Kürzel" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Symbol" })).toBeTruthy();

    await act(async () => {
      fireEvent.press(screen.getByRole("tab", { name: "Nur Kürzel" }));
    });
    expect(mockPreferences.setLabelMode).toHaveBeenCalledWith("SHORT");

    await act(async () => {
      fireEvent.press(screen.getByRole("tab", { name: "Symbol" }));
    });
    expect(mockPreferences.setLabelMode).toHaveBeenCalledWith("SYMBOL");
  });

  it("previews the configured full names", async () => {
    const screen = await render(<CalendarViewScreen />);
    const shrinkProp = ["adjusts", "FontSizeToFit"].join("");
    const singleLineProp = ["number", "OfLines"].join("");

    for (const title of ["Früh", "Spät", "Nacht", "Tag", "Urlaub"]) {
      expect(screen.getByText(title)).toBeTruthy();
    }
    expect(screen.getByText("Früh")).toHaveProp(shrinkProp, true);
    expect(screen.getByText("Früh")).toHaveProp("minimumFontScale", 0.72);
    expect(screen.getByText("Früh")).toHaveProp(singleLineProp, 1);
  });

  it("previews short labels independently from symbols", async () => {
    mockPreferences.labelMode = "SHORT";

    const screen = await render(<CalendarViewScreen />);

    for (const label of ["F", "S", "N", "T", "U"]) {
      expect(screen.getByText(label)).toBeTruthy();
    }
    expect(screen.queryByTestId("shift-symbol-rise")).toBeNull();
  });

  it("previews the stored shift symbols through ShiftSymbol", async () => {
    mockPreferences.labelMode = "SYMBOL";

    const screen = await render(<CalendarViewScreen />);

    for (const symbol of ["rise", "sun", "moon", "home", "palm"]) {
      expect(screen.getByTestId(`shift-symbol-${symbol}`)).toBeTruthy();
    }
    expect(screen.queryByText("Früh")).toBeNull();
  });

  it("shows the full calendar notice without replacing display settings", async () => {
    const message = "Feiertagsregeln für den gewählten Monat sind nicht verfügbar.";
    const screen = await render(<CalendarViewScreen notice={message} />);
    expect(screen.getByText(message)).toBeVisible();
    expect(screen.getByText("Kalenderinhalte")).toBeVisible();
  });

  it("shows total duration instead of start time in the preview", async () => {
    const screen = await render(<CalendarViewScreen />);

    expect(screen.getAllByText("8:00 h")).toHaveLength(4);
    expect(screen.queryByText("06:00")).toBeNull();
  });

  it("combines start time and total duration when both details are enabled", async () => {
    mockPreferences.showShiftTimes = true;

    const screen = await render(<CalendarViewScreen />);

    expect(screen.getByText("06:00 · 8:00 h")).toBeTruthy();
  });

  it("shows only the start time when total duration is disabled", async () => {
    mockPreferences.showShiftTimes = true;
    mockPreferences.showShiftDuration = false;

    const screen = await render(<CalendarViewScreen />);

    expect(screen.getByText("06:00")).toBeTruthy();
    expect(screen.queryByText("8:00 h")).toBeNull();
  });

  it("hides the detail row when both details are disabled", async () => {
    mockPreferences.showShiftDuration = false;

    const screen = await render(<CalendarViewScreen />);

    expect(screen.queryByText("06:00")).toBeNull();
    expect(screen.queryByText("8:00 h")).toBeNull();
    expect(screen.queryByText("GT")).toBeNull();
  });
});
