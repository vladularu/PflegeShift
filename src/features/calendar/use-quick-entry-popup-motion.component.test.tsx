import { act, renderHook } from "@testing-library/react-native";
import { beforeEach, describe, expect, it, jest } from "@jest/globals";

import { useQuickEntryPopupMotion } from "./use-quick-entry-popup-motion";
import { MOTION } from "@/theme/motion";

let mockReducedMotion = false;
let mockCompletion: ((finished: boolean) => void) | undefined;
let mockTimingValue: number | undefined;
const mockCancel = jest.fn();
const mockTiming = jest.fn(
  (
    value: number,
    config: { duration: number; easing: unknown },
    complete?: (finished: boolean) => void,
  ) => {
    if (complete) mockCompletion = complete;
    return mockTimingValue ?? value;
  },
);
jest.mock("react-native-reanimated", () => {
  const React = jest.requireActual<typeof import("react")>("react");
  const { Easing } = jest.requireActual<typeof import("react-native")>("react-native");
  return {
    Easing,
    ReduceMotion: { System: "system" },
    useSharedValue: (initial: number) =>
      React.useRef({
        value: initial,
        get() {
          return this.value;
        },
        set(next: number) {
          this.value = next;
        },
      }).current,
    useReducedMotion: () => mockReducedMotion,
    useAnimatedStyle: (compute: () => object) => compute(),
    withTiming: (
      value: number,
      config: { duration: number; easing: unknown },
      complete?: (finished: boolean) => void,
    ) => mockTiming(value, config, complete),
    cancelAnimation: (value: unknown) => mockCancel(value),
    runOnJS: (callback: () => void) => callback,
  };
});

// The controlled runtime above returns a plain frame; production returns an opaque native style handle.
function motionFrame(handle: unknown) {
  return handle as {
    opacity: number;
    transform: { translateX?: number; translateY?: number; scale?: number }[];
  };
}

const origin = { translateX: -150, translateY: 200, scale: 0.14 };

describe("day popup motion lifecycle", () => {
  beforeEach(() => {
    mockReducedMotion = false;
    mockCompletion = undefined;
    mockTimingValue = undefined;
    mockTiming.mockClear();
    mockCancel.mockClear();
  });

  it("opens with the same calm curve and returns to its day before closing", async () => {
    const onClose = jest.fn();
    const screen = await renderHook(() =>
      useQuickEntryPopupMotion({ animateEntry: true, origin, onClose }),
    );
    expect(mockTiming).toHaveBeenLastCalledWith(
      1,
      { duration: MOTION.duration.scene, easing: MOTION.easing.calm },
      undefined,
    );
    await screen.rerender(undefined);
    expect(motionFrame(screen.result.current.popupMotionStyle).opacity).toBe(1);
    expect(
      motionFrame(screen.result.current.popupMotionStyle).transform[0]?.translateX,
    ).toBeCloseTo(0);
    expect(
      motionFrame(screen.result.current.popupMotionStyle).transform[1]?.translateY,
    ).toBeCloseTo(0);
    expect(motionFrame(screen.result.current.popupMotionStyle).transform[2]?.scale).toBe(1);
    await act(() => {
      screen.result.current.closePopup();
    });
    expect(mockTiming).toHaveBeenLastCalledWith(
      0,
      { duration: MOTION.duration.deliberate, easing: MOTION.easing.calm },
      expect.any(Function),
    );
    expect(screen.result.current.closing).toBe(true);
    expect(motionFrame(screen.result.current.popupMotionStyle)).toMatchObject({
      opacity: 0,
      transform: [{ translateX: -150 }, { translateY: 200 }, { scale: 0.14 }],
    });
    expect(onClose).not.toHaveBeenCalled();
    await act(() => {
      mockCompletion?.(true);
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("keeps a reversible intermediate frame without spring overshoot", async () => {
    mockTimingValue = 0.5;
    const screen = await renderHook(() =>
      useQuickEntryPopupMotion({ animateEntry: true, origin, onClose: jest.fn() }),
    );
    await screen.rerender(undefined);
    const style = motionFrame(screen.result.current.popupMotionStyle);
    expect(style.transform[0]?.translateX).toBe(-75);
    expect(style.transform[1]?.translateY).toBe(100);
    expect(style.transform[2]?.scale).toBeCloseTo(0.57);
    expect(style.opacity).toBe(1);
  });

  it("ignores repeated closes and duplicate completion signals", async () => {
    const onClose = jest.fn();
    const screen = await renderHook(() =>
      useQuickEntryPopupMotion({ animateEntry: true, origin, onClose }),
    );
    await act(() => {
      screen.result.current.closePopup();
      screen.result.current.closePopup();
    });
    expect(mockTiming.mock.calls.filter(([value]) => value === 0)).toHaveLength(1);
    await act(() => {
      mockCompletion?.(true);
      mockCompletion?.(true);
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("does not finish an interrupted close or use a callback after unmount", async () => {
    const onClose = jest.fn();
    const screen = await renderHook(() =>
      useQuickEntryPopupMotion({ animateEntry: true, origin, onClose }),
    );
    await act(() => {
      screen.result.current.closePopup();
      mockCompletion?.(false);
    });
    expect(onClose).not.toHaveBeenCalled();
    await screen.unmount();
    const cancellationCount = mockCancel.mock.calls.length;
    await act(() => {
      mockCompletion?.(true);
    });
    expect(onClose).not.toHaveBeenCalled();
    expect(cancellationCount).toBeGreaterThan(1);
  });

  it("uses no spatial transformation for reduced motion", async () => {
    mockReducedMotion = true;
    const screen = await renderHook(() =>
      useQuickEntryPopupMotion({ animateEntry: true, origin, onClose: jest.fn() }),
    );
    expect(mockTiming.mock.calls[0][1].duration).toBe(MOTION.duration.instant);
    await act(() => {
      screen.result.current.closePopup();
    });
    expect(motionFrame(screen.result.current.popupMotionStyle).transform).toEqual([]);
    expect(mockTiming.mock.calls.at(-1)?.[1].duration).toBe(MOTION.duration.instant);
  });

  it("restores an existing popup without a new entering animation", async () => {
    const screen = await renderHook(() =>
      useQuickEntryPopupMotion({ animateEntry: false, origin, onClose: jest.fn() }),
    );
    expect(mockTiming).not.toHaveBeenCalled();
    expect(motionFrame(screen.result.current.popupMotionStyle).opacity).toBe(1);
    expect(
      motionFrame(screen.result.current.popupMotionStyle).transform[0]?.translateX,
    ).toBeCloseTo(0);
    expect(
      motionFrame(screen.result.current.popupMotionStyle).transform[1]?.translateY,
    ).toBeCloseTo(0);
    expect(motionFrame(screen.result.current.popupMotionStyle).transform[2]?.scale).toBe(1);
  });
});
