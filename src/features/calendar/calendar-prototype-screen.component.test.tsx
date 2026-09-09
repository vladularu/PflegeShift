import { act, fireEvent, render } from "@testing-library/react-native";
import { afterEach, describe, expect, it, jest } from "@jest/globals";
import { AppState } from "react-native";
import CalendarPrototypeRoute from "../../../app/calendar-prototype";
import { CalendarPrototypeScreen } from "./calendar-prototype-screen";
import { calendarPerformance } from "@/application/calendar-performance";

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
    expect(screen.getByText(/keine echten Daten/)).toBeTruthy();
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
