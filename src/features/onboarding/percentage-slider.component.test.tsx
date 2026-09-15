import { describe, expect, it, jest } from "@jest/globals";
import { fireEvent, render as renderNative } from "@testing-library/react-native";
import {
  PercentageSlider,
  weeklyMinutesFromPercentage,
  weeklyPercentage,
} from "./percentage-slider";

import type { ReactElement } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";
function render(ui: ReactElement) {
  return renderNative(
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 390, height: 844 },
        insets: { top: 54, right: 0, bottom: 34, left: 0 },
      }}
    >
      {ui}
    </SafeAreaProvider>,
  );
}
describe("percentage conversion", () => {
  it("converts full-time baselines to minute-precision hours", () => {
    expect(weeklyMinutesFromPercentage(40, 75)).toBe(1800);
    expect(weeklyMinutesFromPercentage(38.5, 80)).toBe(1848);
    expect(weeklyMinutesFromPercentage(39, 75)).toBe(1755);
    expect(weeklyMinutesFromPercentage(38.5, 51)).toBe(1178);
    expect(weeklyMinutesFromPercentage(40, 5)).toBe(240);
    expect(weeklyMinutesFromPercentage(40, 110)).toBe(2400);
    expect(weeklyPercentage("30", 40)).toBe(75);
    expect(weeklyPercentage("30", 38.5)).toBeCloseTo(77.922);
    expect(weeklyPercentage("", 40)).toBeNull();
    expect(weeklyPercentage("1e1", 40)).toBeNull();
  });
  it("provides incremental accessibility actions without duplicate percentage buttons", async () => {
    const change = jest.fn();
    const screen = await render(
      <PercentageSlider
        weeklyHours="30"
        basis={40}
        onBasisChange={jest.fn()}
        onHoursChange={change}
        onInteractionChange={jest.fn()}
      />,
    );
    await fireEvent(screen.getByRole("adjustable"), "accessibilityAction", {
      nativeEvent: { actionName: "increment" },
    });
    expect(change).toHaveBeenLastCalledWith("30,4");
    await fireEvent(screen.getByRole("adjustable"), "accessibilityAction", {
      nativeEvent: { actionName: "decrement" },
    });
    expect(change).toHaveBeenLastCalledWith("29,6");
    expect(screen.queryByRole("button", { name: "50 Prozent auswählen" })).toBeNull();
  });
  it("uses measured touch travel and releases parent scrolling", async () => {
    const change = jest.fn(),
      interaction = jest.fn();
    const screen = await render(
      <PercentageSlider
        weeklyHours=""
        basis={40}
        onBasisChange={jest.fn()}
        onHoursChange={change}
        onInteractionChange={interaction}
      />,
    );
    const slider = screen.getByTestId("onboarding-percentage-slider");
    await fireEvent(slider, "layout", { nativeEvent: { layout: { width: 300 } } });
    await fireEvent(slider, "responderGrant", { nativeEvent: { locationX: 0, pageX: 20 } });
    expect(change).toHaveBeenLastCalledWith("4");
    expect(interaction).toHaveBeenLastCalledWith(true);
    await fireEvent(slider, "responderMove", { nativeEvent: { pageX: 320 } });
    expect(change).toHaveBeenLastCalledWith("40");
    await fireEvent(slider, "responderRelease", {});
    expect(interaction).toHaveBeenLastCalledWith(false);
    await fireEvent(slider, "responderTerminate", {});
    expect(interaction).toHaveBeenLastCalledWith(false);
  });
  it("decrements by one percent despite minute rounding on a 38.5-hour basis", async () => {
    const change = jest.fn();
    const screen = await render(
      <PercentageSlider
        weeklyHours="28,88"
        basis={38.5}
        onBasisChange={jest.fn()}
        onHoursChange={change}
        onInteractionChange={jest.fn()}
      />,
    );
    await fireEvent(screen.getByRole("adjustable"), "accessibilityAction", {
      nativeEvent: { actionName: "decrement" },
    });
    expect(change).toHaveBeenLastCalledWith("28,48");
  });
  it("changes the baseline without mutating direct weekly-hour input", async () => {
    const change = jest.fn(),
      basis = jest.fn();
    const screen = await render(
      <PercentageSlider
        weeklyHours="45"
        basis={40}
        onBasisChange={basis}
        onHoursChange={change}
        onInteractionChange={jest.fn()}
      />,
    );
    expect(screen.getByTestId("onboarding-percentage-value")).toHaveTextContent("112,5 %");
    await fireEvent.press(screen.getByRole("button", { name: "100 % entsprechen: 40 h" }));
    await fireEvent.press(screen.getByRole("radio", { name: "38,5 h" }));
    expect(basis).toHaveBeenCalledWith(38.5);
    expect(change).not.toHaveBeenCalled();
  });
});
