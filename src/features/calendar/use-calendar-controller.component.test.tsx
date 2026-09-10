import { act, renderHook } from "@testing-library/react-native";
import { afterEach, describe, expect, it, jest } from "@jest/globals";
import { AppState } from "react-native";
import type { CalendarViewMode } from "@/domain/types";
import { useCalendarController } from "./use-calendar-controller";

const mockCompletions: ((finished: boolean) => void)[] = [];
jest.mock("react-native-reanimated", () => ({
  ...jest.requireActual<object>("react-native-reanimated"),
  useReducedMotion: () => false,
  withTiming: (end: number, _config: unknown, complete: (finished: boolean) => void) => {
    mockCompletions.push(complete);
    return end;
  },
}));

const initialProps = {
  month: "2026-09",
  mode: "MONTH" as CalendarViewMode,
  active: true,
  revision: 0,
};

describe("one calendar presentation controller", () => {
  afterEach(() => {
    jest.restoreAllMocks();
    mockCompletions.length = 0;
  });

  it("previews a swipe without changing the data month and clears preview on Today", async () => {
    const hook = await renderHook((props: typeof initialProps) => useCalendarController(props), {
      initialProps,
    });
    await act(async () => hook.result.current.previewMonth("2026-10"));
    expect(hook.result.current.displayMonth).toBe("2026-10");
    expect(hook.result.current.month).toBe("2026-09");
    await hook.rerender({ ...initialProps, revision: 1 });
    expect(hook.result.current.displayMonth).toBe("2026-09");
    await hook.rerender({ ...initialProps, month: "2026-10" });
    expect(hook.result.current.displayMonth).toBe("2026-10");
  });

  it("rejects stale UI completions and hides the year at the month endpoint", async () => {
    const listener = jest.spyOn(AppState, "addEventListener");
    const hook = await renderHook((props: typeof initialProps) => useCalendarController(props), {
      initialProps,
    });
    await act(async () => listener.mock.calls[0][1]("active"));
    await hook.rerender({ ...initialProps, mode: "YEAR" });
    const oldCompletion = mockCompletions.at(-1)!;
    expect(hook.result.current.busy).toBe(true);
    await hook.rerender({ ...initialProps, month: "2026-01" });
    const latestCompletion = mockCompletions.at(-1)!;
    expect(hook.result.current.yearVisible).toBe(true);
    await act(async () => oldCompletion(true));
    expect(hook.result.current.progress.value).toBe(1);
    expect(hook.result.current.busy).toBe(true);
    await act(async () => latestCompletion(true));
    expect(hook.result.current.busy).toBe(false);
    expect(hook.result.current.yearVisible).toBe(false);
    expect(hook.result.current.isTransitionInFlight()).toBe(false);
  });

  it("finishes safely on background and ignores callbacks after unmount", async () => {
    const listener = jest.spyOn(AppState, "addEventListener");
    const onTransitionComplete = jest.fn();
    const hook = await renderHook(
      (props: typeof initialProps) => useCalendarController({ ...props, onTransitionComplete }),
      { initialProps },
    );
    await act(async () => listener.mock.calls[0][1]("active"));
    await hook.rerender({ ...initialProps, mode: "YEAR" });
    const late = mockCompletions.at(-1)!;
    await act(async () => listener.mock.calls[0][1]("background"));
    expect(hook.result.current.busy).toBe(false);
    expect(hook.result.current.progress.value).toBe(0);
    expect(hook.result.current.yearVisible).toBe(true);
    await hook.unmount();
    const count = onTransitionComplete.mock.calls.length;
    await act(async () => late(true));
    expect(onTransitionComplete).toHaveBeenCalledTimes(count);
  });
});
