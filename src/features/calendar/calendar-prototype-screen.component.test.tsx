import { act, fireEvent, render } from "@testing-library/react-native";
import { afterEach, describe, expect, it, jest } from "@jest/globals";
import { AppState } from "react-native";
import CalendarPrototypeRoute from "../../../app/calendar-prototype";
import { CalendarPrototypeScreen } from "./calendar-prototype-screen";
import { calendarPerformance } from "@/application/calendar-performance";
import { bundledRuleResolver as mockRuleResolver } from "@/rules/rule-resolver";
import type { CalendarEntry } from "@/domain/types";

const mockPreferences = {
  labelMode: "FULL",
  showShiftTimes: true,
  showShiftDuration: false,
  showShifts: true,
  showAppointments: true,
  showHolidays: true,
};
const mockData = { entries: [] as CalendarEntry[], loading: false, error: false, retry: jest.fn() };
jest.mock("./use-prototype-entries", () => ({ usePrototypeEntries: () => mockData }));
jest.mock("./calendar-preferences", () => ({ useCalendarPreferences: () => mockPreferences }));
jest.mock("@/application/pflegeshift-provider", () => ({
  usePflegeShiftProfile: () => ({
    profile: { federalState: "HE", holidayRegion: "NONE", timeZone: "Europe/Berlin" },
  }),
}));
jest.mock("@/application/rule-catalog-runtime-provider", () => ({
  useRuleCatalogRuntime: () => ({ resolver: mockRuleResolver }),
}));

let mockAvailable = true;
let mockReduced = false;
jest.mock("react-native-reanimated", () => ({
  __esModule: true,
  ...jest.requireActual<object>("react-native-reanimated"),
  useReducedMotion: () => mockReduced,
}));
jest.mock("@/infrastructure/dev-tools-policy", () => ({
  get DEV_TOOLS_AVAILABLE() {
    return mockAvailable;
  },
}));
jest.mock("expo-router", () => ({
  useIsFocused: () => true,
  Redirect: () => null,
  Stack: { Screen: () => null },
}));
jest.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ bottom: 0 }) }));

describe("isolated calendar prototype", () => {
  afterEach(() => {
    calendarPerformance.clear();
    jest.restoreAllMocks();
    jest.useRealTimers();
    mockAvailable = true;
    mockReduced = false;
    mockData.entries = [];
    mockData.loading = false;
    mockData.error = false;
    mockPreferences.labelMode = "FULL";
    mockPreferences.showAppointments = true;
    mockPreferences.showShifts = true;
  });
  it("opens a month immediately without a measurement timer and handles 30 reversals", async () => {
    jest.useFakeTimers();
    const listener = jest.spyOn(AppState, "addEventListener");
    calendarPerformance.start(true);
    const screen = await render(<CalendarPrototypeScreen />);
    await act(async () => {
      listener.mock.calls[0][1]("active");
    });
    await fireEvent(screen.getByTestId("prototype-canvas"), "layout", {
      nativeEvent: { layout: { width: 430, height: 640 } },
    });
    const year = screen.getByTestId("prototype-heading").props.children;
    for (let i = 0; i < 15; i++) {
      await fireEvent.press(screen.getByRole("button", { name: `Januar ${year} öffnen` }));
      expect(screen.getByTestId("prototype-heading").props.children).toBe(`Januar ${year}`);
      await act(async () => {
        jest.advanceTimersByTime(600);
      });
      await fireEvent.press(screen.getByTestId("prototype-year"));
      expect(screen.getByTestId("prototype-heading").props.children).toBe(year);
      await act(async () => {
        jest.advanceTimersByTime(600);
      });
    }
    const events = calendarPerformance.report().events;
    expect(events.filter((e) => e.kind === "prototype-request")).toHaveLength(30);
    expect(events.filter((e) => e.kind === "prototype-start")).toHaveLength(30);
    expect(events.some((e) => e.kind === "measure" || e.kind === "load-start")).toBe(false);
    expect(screen.getByText(/Echte Daten · nur Ansicht/)).toBeTruthy();
  }, 30000);
  it("supports year navigation, Today and background cancellation", async () => {
    const listener = jest.spyOn(AppState, "addEventListener");
    const screen = await render(<CalendarPrototypeScreen />);
    const initial = Number(screen.getByTestId("prototype-heading").props.children);
    await fireEvent.press(screen.getByTestId("prototype-previous"));
    expect(screen.getByTestId("prototype-heading").props.children).toBe(String(initial - 1));
    await fireEvent.press(screen.getByTestId("prototype-today"));
    expect(screen.getByTestId("prototype-heading").props.children).toContain(String(initial));
    await act(async () => {
      listener.mock.calls[0][1]("background");
    });
    expect(screen.getByTestId("prototype-heading").props.children).toContain(String(initial));
  });
  it("does not render the prototype through a production deep link", async () => {
    mockAvailable = false;
    const screen = await render(<CalendarPrototypeRoute />);
    expect(screen.queryByTestId("prototype-canvas")).toBeNull();
  });
  it("renders real appointments unshortened in symbol mode and honors visibility filters", async () => {
    mockReduced = true;
    mockPreferences.labelMode = "SYMBOL";
    const screen = await render(<CalendarPrototypeScreen />);
    const year = screen.getByTestId("prototype-heading").props.children;
    mockData.entries = [
      {
        kind: "APPOINTMENT",
        id: "real",
        date: `${year}-01-01`,
        title: "Physiotherapie",
        allDay: true,
        startTime: null,
        endTime: null,
        color: "#123456",
        note: null,
        revision: 1,
        createdAt: "2026-01-01T00:00:00Z",
        updatedAt: "2026-01-01T00:00:00Z",
        deletedAt: null,
      },
    ];
    await fireEvent(screen.getByTestId("prototype-canvas"), "layout", {
      nativeEvent: { layout: { width: 430, height: 640 } },
    });
    await fireEvent.press(screen.getByRole("button", { name: `Januar ${year} öffnen` }));
    expect(screen.getByText("• Physiotherapie")).toBeTruthy();
    expect(screen.getByText("Neujahr")).toBeTruthy();
    mockPreferences.showAppointments = false;
    await screen.rerender(<CalendarPrototypeScreen />);
    expect(screen.queryByText("• Physiotherapie")).toBeNull();
  });
  it("keeps navigation available while loading or on retryable failure", async () => {
    mockData.loading = true;
    const screen = await render(<CalendarPrototypeScreen />);
    expect(screen.getByText("Jahresdaten werden geladen …")).toBeTruthy();
    await fireEvent.press(screen.getByTestId("prototype-next"));
    mockData.loading = false;
    mockData.error = true;
    await screen.rerender(<CalendarPrototypeScreen />);
    await fireEvent.press(screen.getByText("Laden fehlgeschlagen. Erneut versuchen"));
    expect(mockData.retry).toHaveBeenCalled();
  });
  it("honors reduced motion without starting an animation", async () => {
    mockReduced = true;
    const listener = jest.spyOn(AppState, "addEventListener");
    calendarPerformance.start(true);
    const screen = await render(<CalendarPrototypeScreen />);
    await act(async () => {
      listener.mock.calls[0][1]("active");
    });
    await fireEvent(screen.getByTestId("prototype-canvas"), "layout", {
      nativeEvent: { layout: { width: 430, height: 640 } },
    });
    await fireEvent.press(screen.getByTestId("prototype-today"));
    expect(
      calendarPerformance.report().events.some((event) => event.kind === "prototype-start"),
    ).toBe(false);
    expect(screen.getByTestId("prototype-heading").props.children).not.toMatch(/^\d{4}$/);
  });
});
