import { act, render } from "@testing-library/react-native";
import { afterEach, describe, expect, it, jest } from "@jest/globals";
import { AppState } from "react-native";
import { calendarPerformance } from "@/application/calendar-performance";
import { useCalendarPerformance } from "./use-calendar-performance";
let mockCallback: (frame: {
  timestamp: number;
  timeSincePreviousFrame: number | null;
  timeSinceFirstFrame: number;
}) => void;
const mockControl = { setActive: jest.fn(), isActive: false, callbackId: 1 };
jest.mock("react-native-reanimated", () => ({
  ...jest.requireActual<typeof import("react-native-reanimated")>("react-native-reanimated"),
  useFrameCallback: (fn: typeof mockCallback) => {
    mockCallback = fn;
    return mockControl;
  },
  runOnJS: (fn: unknown) => fn,
}));

describe("calendar UI cadence probe", () => {
  afterEach(() => {
    calendarPerformance.clear();
    jest.restoreAllMocks();
  });
  it("samples only opted-in foreground calendar frames and batches events", async () => {
    const control = mockControl;
    const lifecycle = jest.spyOn(AppState, "addEventListener");
    function Probe() {
      useCalendarPerformance(true, "2026-01", "MONTH");
      return null;
    }
    const screen = await render(<Probe />);
    expect(control.setActive).toHaveBeenLastCalledWith(false);
    await act(async () => calendarPerformance.start(true));
    await act(async () => {
      lifecycle.mock.calls.at(-1)![1]("active");
    });
    expect(control.setActive).toHaveBeenLastCalledWith(true);
    await act(async () => {
      mockCallback({ timestamp: 100, timeSincePreviousFrame: null, timeSinceFirstFrame: 0 });
      for (let i = 1; i <= 60; i++)
        mockCallback({
          timestamp: 100 + i * 20,
          timeSincePreviousFrame: 20,
          timeSinceFirstFrame: i * 20,
        });
    });
    const frames = calendarPerformance
      .report()
      .events.filter((event) => event.kind === "ui-frames");
    expect(frames).toHaveLength(1);
    expect(frames[0].values).toMatchObject({
      count: 50,
      maximum: 20,
      over17: 50,
      over34: 0,
      over50: 0,
    });
    await act(async () => {
      lifecycle.mock.calls.at(-1)![1]("background");
    });
    expect(control.setActive).toHaveBeenLastCalledWith(false);
    await act(async () => calendarPerformance.stop());
    expect(control.setActive).toHaveBeenLastCalledWith(false);
    await screen.unmount();
  });
});
