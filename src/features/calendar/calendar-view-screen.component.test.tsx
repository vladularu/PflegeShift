import { act, fireEvent, render, within } from "@testing-library/react-native";
import { beforeEach, describe, expect, it, jest } from "@jest/globals";

import { CalendarViewScreen } from "@/features/calendar/calendar-view-screen";
import { AppearanceContext, type AppearanceValue } from "@/theme/appearance-context";
import { DARK_PALETTE, LIGHT_PALETTE } from "@/theme/palette-values";

let mockPalette = LIGHT_PALETTE;
jest.mock("@/theme/palette", () => ({ usePalette: () => mockPalette }));

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
  ready: true,
  resetDisplay: jest.fn(),
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

jest.mock("@/navigation/active-month", () => ({ useActiveMonth: () => "2026-10" }));
jest.mock("@/application/pflegeshift-provider", () => ({
  usePflegeShiftEntries: () => ({ entries: [] }),
  usePflegeShiftTemplates: () => ({ templates: [] }),
  usePflegeShiftProfile: () => ({ profile: { timeZone: "Europe/Berlin" } }),
}));
const appearance: AppearanceValue = {
  themeId: "standard",
  mode: "system",
  ready: true,
  saving: false,
  error: null,
  setMode: jest.fn(),
  setTheme: jest.fn(),
  retry: jest.fn(),
  reset: jest.fn(),
};
function page(notice?: string) {
  return (
    <AppearanceContext value={appearance}>
      <CalendarViewScreen notice={notice} />
    </AppearanceContext>
  );
}
async function renderView(notice?: string) {
  const screen = await render(page(notice));
  await fireEvent(screen.getByTestId("appearance-preview-month"), "layout", {
    nativeEvent: { layout: { width: 320 } },
  });
  return screen;
}
describe("CalendarViewScreen", () => {
  beforeEach(() => {
    mockPalette = LIGHT_PALETTE;
    mockPreferences.showShifts = true;
    mockPreferences.showAppointments = true;
    mockPreferences.showHolidays = true;
    mockPreferences.labelMode = "FULL";
    mockPreferences.showShiftTimes = false;
    mockPreferences.showShiftDuration = true;
  });

  it("offers separate full-name, short-label and symbol tabs", async () => {
    const screen = await renderView();

    expect(within(screen.getByLabelText("Dienstbezeichnung")).getAllByRole("tab")).toHaveLength(3);
    expect(screen.getByRole("tab", { name: "Name" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Kürzel" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Symbol" })).toBeTruthy();

    await act(async () => {
      fireEvent.press(screen.getByRole("tab", { name: "Kürzel" }));
    });
    expect(mockPreferences.setLabelMode).toHaveBeenCalledWith("SHORT");

    await act(async () => {
      fireEvent.press(screen.getByRole("tab", { name: "Symbol" }));
    });
    expect(mockPreferences.setLabelMode).toHaveBeenCalledWith("SYMBOL");
  });

  it("previews the configured full names", async () => {
    const screen = await renderView();
    const singleLineProp = ["number", "OfLines"].join("");

    for (const title of ["Früh", "Spät", "Nacht", "Tag", "Urlaub"]) {
      expect(screen.getByText(title)).toBeTruthy();
    }
    expect(screen.getByText("Früh")).toHaveStyle({ color: "#FFFFFF", fontWeight: "500" });
    expect(screen.getByText("Früh").parent?.parent).toHaveStyle({ borderRadius: 2 });
    expect(screen.getByText("Früh")).toHaveProp(singleLineProp, 1);
  });

  it("previews short labels independently from symbols", async () => {
    mockPreferences.labelMode = "SHORT";

    const screen = await renderView();

    for (const [index, label] of ["F", "S", "N", "T", "U"].entries()) {
      expect(
        within(
          screen.getByLabelText(
            `2026-10-0${index + 1}, ${["Früh", "Spät", "Nacht", "Tag", "Urlaub"][index]}`,
          ),
        ).getByText(label),
      ).toBeTruthy();
    }
    expect(screen.queryByTestId("shift-symbol-rise")).toBeNull();
  });

  it("shows two real calendar weeks with directly labeled controls", async () => {
    const screen = await renderView();
    const hidden = { includeHiddenElements: true };
    expect(
      screen.getAllByTestId(/^calendar-date-marker-/, hidden).length +
        screen.getAllByTestId(/^calendar-adjacent-\d{4}/, hidden).length,
    ).toBe(14);
    expect(screen.getByTestId("calendar-date-marker-2026-10-01", hidden)).toBeTruthy();
    expect(screen.getByRole("switch", { name: "Dienste & Abwesenheiten" })).toBeTruthy();
    expect(screen.getByText("Dienstanzeige")).toBeTruthy();
    expect(screen.getByText("GT")).toBeTruthy();
    expect(screen.getByText("Feiertag (Beispiel)")).toBeTruthy();
  });

  it("hides preview shifts when services are disabled", async () => {
    mockPreferences.showShifts = false;
    const screen = await renderView();
    expect(screen.queryByText("Früh")).toBeNull();
    expect(screen.queryByText("Urlaub")).toBeNull();
    expect(screen.getByLabelText("2026-10-01, Keine Einträge")).toBeTruthy();
    expect(screen.getByText("• Termin (Beispiel)")).toBeTruthy();
    expect(screen.getByText("Feiertag (Beispiel)")).toBeTruthy();
  });

  it("tracks light and dark calendar surfaces", async () => {
    const screen = await renderView();
    for (const palette of [DARK_PALETTE, LIGHT_PALETTE]) {
      mockPalette = palette;
      await screen.rerender(page());
      expect(screen.getByTestId("appearance-calendar-preview")).toHaveStyle({
        backgroundColor: palette.calendarBackground,
      });
    }
  });

  it("previews the stored shift symbols through ShiftSymbol", async () => {
    mockPreferences.labelMode = "SYMBOL";

    const screen = await renderView();

    for (const symbol of ["rise", "sun", "moon", "home", "palm"]) {
      expect(screen.getByTestId(`shift-symbol-${symbol}`)).toBeTruthy();
    }
    expect(screen.queryByText("Früh")).toBeNull();
  });

  it("shows the full calendar notice without replacing display settings", async () => {
    const message = "Feiertagsregeln für den gewählten Monat sind nicht verfügbar.";
    const screen = await renderView(message);
    expect(screen.getByText(message)).toBeVisible();
    expect(screen.getByRole("switch", { name: "Dienste & Abwesenheiten" })).toBeVisible();
  });

  it("shows total duration instead of start time in the preview", async () => {
    const screen = await renderView();

    expect(screen.getAllByText("8:00 h")).toHaveLength(4);
    expect(screen.queryByText("06:00")).toBeNull();
  });

  it("combines start time and total duration when both details are enabled", async () => {
    mockPreferences.showShiftTimes = true;

    const screen = await renderView();

    expect(screen.getByText("06:00 · 8:00 h")).toBeTruthy();
  });

  it("shows only the start time when total duration is disabled", async () => {
    mockPreferences.showShiftTimes = true;
    mockPreferences.showShiftDuration = false;

    const screen = await renderView();

    expect(screen.getByText("06:00")).toBeTruthy();
    expect(screen.queryByText("8:00 h")).toBeNull();
  });

  it("hides the detail row when both details are disabled", async () => {
    mockPreferences.showShiftDuration = false;

    const screen = await renderView();

    expect(screen.queryByText("06:00")).toBeNull();
    expect(screen.queryByText("8:00 h")).toBeNull();
    expect(screen.queryByText("GT")).toBeNull();
  });
  it("updates all three content filters in the shared preview", async () => {
    const screen = await renderView();
    expect(screen.getByText("Früh")).toBeTruthy();
    expect(screen.getByText("• Termin (Beispiel)")).toBeTruthy();
    expect(screen.getByText("Feiertag (Beispiel)")).toBeTruthy();
    mockPreferences.showAppointments = false;
    mockPreferences.showHolidays = false;
    await screen.rerender(page());
    expect(screen.queryByText("• Termin (Beispiel)")).toBeNull();
    expect(screen.queryByText("Feiertag (Beispiel)")).toBeNull();
    expect(screen.getByText("Früh")).toBeTruthy();
    mockPreferences.showShifts = false;
    await screen.rerender(page());
    expect(screen.queryByText("Früh")).toBeNull();
    expect(screen.queryByText("Urlaub")).toBeNull();
    mockPreferences.showShifts = true;
    mockPreferences.showAppointments = true;
    mockPreferences.showHolidays = true;
    await screen.rerender(page());
    expect(screen.getByText("Urlaub")).toBeTruthy();
    expect(screen.getByText("• Termin (Beispiel)")).toBeTruthy();
  });
});
