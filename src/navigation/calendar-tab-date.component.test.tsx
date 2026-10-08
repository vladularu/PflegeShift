import { act, render } from "@testing-library/react-native";
import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import { AppState, type AppStateStatus } from "react-native";
import { AppTabs as NativeAppTabs } from "./app-tabs.native";
import { AppTabs as JavaScriptAppTabs } from "./app-tabs-js";
import { calendarTabIconSource } from "./calendar-tab-icon";

jest.mock("@/navigation/active-month", () => ({
  useActiveMonthCoordinator: () => ({}),
  requestCalendarTodayOnReselect: jest.fn(),
}));
jest.mock("@/theme/palette", () => ({
  usePalette: () => ({ accent: "#FFEB3B", primary: "#007AFF", textMuted: "#808080" }),
}));
jest.mock("expo-router/unstable-native-tabs", () => {
  const React = jest.requireActual<typeof import("react")>("react");
  const { View, Text } = jest.requireActual<typeof import("react-native")>("react-native");
  const Root = ({ children }: { children?: import("react").ReactNode }) =>
    React.createElement(View, null, children);
  const Trigger = (props: Record<string, unknown>) =>
    React.createElement(View, { ...props, testID: `tab-${props.name}` });
  const Icon = (props: Record<string, unknown>) =>
    React.createElement(View, {
      ...props,
      testID: props.sf ? `icon-${props.sf}` : "calendar-icon",
    });
  const Label = ({ children }: { children?: import("react").ReactNode }) =>
    React.createElement(Text, null, children);
  const NativeTabs = Object.assign(Root, {
    Trigger: Object.assign(Trigger, { Label, Icon, VectorIcon: () => null }),
  });
  return { NativeTabs };
});
jest.mock("expo-router", () => {
  const React = jest.requireActual<typeof import("react")>("react");
  const { View } = jest.requireActual<typeof import("react-native")>("react-native");
  const Root = ({ children }: { children?: import("react").ReactNode }) =>
    React.createElement(View, null, children);
  const Screen = (props: Record<string, unknown>) =>
    React.createElement(View, { ...props, testID: `tab-${props.name}` });
  return { Tabs: Object.assign(Root, { Screen }) };
});

const originalState = AppState.currentState;
let changeState: (state: AppStateStatus) => void;
const removeListener = jest.fn();

beforeEach(() => {
  jest.useFakeTimers({ doNotFake: ["nextTick", "queueMicrotask"] });
  jest.setSystemTime(new Date(2026, 9, 8, 12));
  AppState.currentState = "active";
  jest.spyOn(AppState, "addEventListener").mockImplementation((_event, listener) => {
    changeState = listener as (state: AppStateStatus) => void;
    return { remove: removeListener };
  });
});
afterEach(() => {
  AppState.currentState = originalState;
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe("current calendar day in the tab bar", () => {
  it("uses today's local day in the tinted native icon and VoiceOver label", async () => {
    const screen = await render(<NativeAppTabs />);
    expect(screen.getByTestId("calendar-icon").props.src).toEqual(calendarTabIconSource(8));
    expect(screen.getByTestId("calendar-icon").props.renderingMode).toBe("template");
    expect(screen.getByTestId("tab-(calendar)").props.accessibilityLabel).toContain(
      "8. Oktober 2026",
    );
    expect(jest.getTimerCount()).toBe(1);
  });

  it("shares the day and label with the JavaScript fallback while preserving icon tint", async () => {
    const screen = await render(<JavaScriptAppTabs />);
    const options = screen.getByTestId("tab-(calendar)").props.options;
    expect(options.title).toBe("Kalender");
    expect(options.tabBarAccessibilityLabel).toContain("8. Oktober 2026");
    const icon = options.tabBarIcon({ color: "#808080", size: 27, focused: true });
    const image = await render(icon);
    expect(image.getByTestId("calendar-tab-day-icon", { includeHiddenElements: true })).toHaveProp(
      "source",
      calendarTabIconSource(8),
    );
    expect(image.getByTestId("calendar-tab-day-icon", { includeHiddenElements: true })).toHaveStyle(
      {
        width: 27,
        height: 27,
        tintColor: "#FFEB3B",
      },
    );
  });

  it.each([
    [2026, 9, 8, 9],
    [2026, 9, 31, 1],
    [2026, 11, 31, 1],
    [2028, 1, 28, 29],
    [2028, 1, 29, 1],
  ])("updates across the local midnight %s-%s-%s", async (year, month, day, nextDay) => {
    jest.setSystemTime(new Date(year, month, day, 23, 59, 59, 950));
    const screen = await render(<NativeAppTabs />);
    await act(async () => jest.advanceTimersByTime(101));
    expect(screen.getByTestId("calendar-icon").props.src).toEqual(calendarTabIconSource(nextDay));
    expect(jest.getTimerCount()).toBe(1);
  });

  it("suspends in the background and immediately updates after resuming on another day", async () => {
    const screen = await render(<NativeAppTabs />);
    await act(async () => changeState("background"));
    expect(jest.getTimerCount()).toBe(0);
    jest.setSystemTime(new Date(2026, 10, 2, 8));
    await act(async () => changeState("active"));
    expect(screen.getByTestId("calendar-icon").props.src).toEqual(calendarTabIconSource(2));
    expect(screen.getByTestId("tab-(calendar)").props.accessibilityLabel).toContain(
      "2. November 2026",
    );
    expect(jest.getTimerCount()).toBe(1);
  });

  it("starts without background polling and refreshes when the app becomes active", async () => {
    AppState.currentState = "background";
    const screen = await render(<NativeAppTabs />);
    expect(jest.getTimerCount()).toBe(0);
    jest.setSystemTime(new Date(2026, 9, 9, 8));
    await act(async () => changeState("active"));
    expect(screen.getByTestId("calendar-icon").props.src).toEqual(calendarTabIconSource(9));
    expect(jest.getTimerCount()).toBe(1);
  });

  it("catches a system clock correction within a minute while foregrounded", async () => {
    const screen = await render(<NativeAppTabs />);
    jest.setSystemTime(new Date(2026, 9, 7, 12));
    await act(async () => jest.advanceTimersByTime(60_000));
    expect(screen.getByTestId("calendar-icon").props.src).toEqual(calendarTabIconSource(7));
  });

  it("never accumulates timers during repeated resumes and cleans up on unmount", async () => {
    const screen = await render(<NativeAppTabs />);
    for (let i = 0; i < 3; i++) {
      await act(async () => changeState("inactive"));
      expect(jest.getTimerCount()).toBe(0);
      await act(async () => changeState("active"));
      expect(jest.getTimerCount()).toBe(1);
    }
    await screen.unmount();
    expect(jest.getTimerCount()).toBe(0);
    expect(removeListener).toHaveBeenCalled();
  });
});
