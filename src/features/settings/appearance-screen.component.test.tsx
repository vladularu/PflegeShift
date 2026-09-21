import { fireEvent, render } from "@testing-library/react-native";
import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import * as ReactNative from "react-native";
import { AppearanceContext, type AppearanceValue } from "@/theme/appearance-context";
import { resolvePalette } from "@/theme/theme-catalog";
import { AppearanceScreen } from "./appearance-screen";

const preferences: AppearanceValue = {
  themeId: "mint",
  mode: "system",
  ready: true,
  saving: false,
  error: null,
  setTheme: jest.fn(),
  setMode: jest.fn(),
  retry: jest.fn(),
  reset: jest.fn(),
};

function screenWith(overrides: Partial<AppearanceValue> = {}) {
  return (
    <AppearanceContext value={{ ...preferences, ...overrides }}>
      <AppearanceScreen />
    </AppearanceContext>
  );
}

describe("appearance controls", () => {
  beforeEach(() => {
    jest.spyOn(ReactNative, "useWindowDimensions").mockReturnValue({
      width: 390,
      height: 844,
      scale: 3,
      fontScale: 1,
    });
  });

  it("keeps mode and theme independent and exposes the current selection", async () => {
    const screen = await render(screenWith());
    expect(screen.getByRole("radio", { name: "System", checked: true })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Minzbrise", selected: true })).toBeTruthy();
    await fireEvent.press(screen.getByRole("radio", { name: "Dunkel" }));
    expect(preferences.setMode).toHaveBeenCalledWith("dark");
    expect(preferences.setTheme).not.toHaveBeenCalled();
    await screen.rerender(screenWith({ mode: "dark" }));
    expect(screen.getByRole("radio", { name: "Dunkel", checked: true })).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Rosenleinen" }));
    expect(preferences.setTheme).toHaveBeenCalledWith("rose");
    expect(preferences.setMode).toHaveBeenCalledTimes(1);
  });

  it("does not write again when the selected mode or theme is pressed", async () => {
    const screen = await render(screenWith());
    await fireEvent.press(screen.getByRole("radio", { name: "System" }));
    await fireEvent.press(screen.getByRole("button", { name: "Minzbrise" }));
    expect(preferences.setMode).not.toHaveBeenCalled();
    expect(preferences.setTheme).not.toHaveBeenCalled();
  });

  it("stacks the choices for large text and preserves usable touch targets", async () => {
    jest.spyOn(ReactNative, "useWindowDimensions").mockReturnValue({
      width: 320,
      height: 640,
      scale: 2,
      fontScale: 2,
    });
    const screen = await render(screenWith({ mode: "light" }));
    expect(screen.getByLabelText("Erscheinungsbild")).toHaveStyle({
      flexDirection: "column",
    });
    for (const name of ["Hell", "Dunkel", "System"]) {
      expect(screen.getByRole("radio", { name })).toHaveStyle({ minHeight: 48 });
    }
    expect(screen.getByRole("button", { name: "Lavendelruhe" })).toHaveStyle({ width: "100%" });
  });

  it("keeps medium enlarged labels out of cramped horizontal segments", async () => {
    jest.spyOn(ReactNative, "useWindowDimensions").mockReturnValue({
      width: 375,
      height: 812,
      scale: 3,
      fontScale: 1.3,
    });
    const screen = await render(screenWith());
    expect(screen.getByLabelText("Erscheinungsbild")).toHaveStyle({ flexDirection: "column" });
    expect(screen.getByRole("button", { name: "Rosenleinen" })).toHaveStyle({ width: "100%" });
  });

  it("uses a neutral track and raised selection in both modes", async () => {
    const screen = await render(screenWith({ mode: "light" }));
    for (const mode of ["light", "dark"] as const) {
      await screen.rerender(screenWith({ mode }));
      const palette = resolvePalette("mint", mode === "dark");
      expect(screen.getByLabelText("Erscheinungsbild")).toHaveStyle({
        backgroundColor: palette.surfaceMuted,
      });
      expect(screen.getByRole("radio", { checked: true })).toHaveStyle({
        backgroundColor: palette.surfaceRaised,
      });
    }
  });

  it("keeps saving feedback, retry and resetting available", async () => {
    const screen = await render(screenWith({ saving: true }));
    expect(screen.getByText("Wird gespeichert …")).toBeTruthy();
    await screen.rerender(screenWith({ error: "Darstellung konnte nicht gespeichert werden." }));
    expect(screen.getByText("Die bisherige Auswahl bleibt erhalten.")).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Erneut versuchen" }));
    expect(preferences.retry).toHaveBeenCalled();
    await fireEvent.press(screen.getByRole("button", { name: "Standard wiederherstellen" }));
    expect(preferences.reset).toHaveBeenCalled();
  });
});
