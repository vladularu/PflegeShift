import { fireEvent, render } from "@testing-library/react-native";
import { describe, expect, it, jest } from "@jest/globals";
import { AccessibilityInfo, Platform } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { TEXT_MAX_SCALE } from "@/theme/typography";
import { LIGHT_PALETTE } from "@/theme/palette-values";
import { scheduleAccessibilityFocus } from "@/ui/accessibility-focus";
import { DropdownField, Field, PrimaryButton, SecondaryButton } from "@/ui/form-controls";

describe("form controls", () => {
  it("exposes a labeled field and forwards changes", async () => {
    const onChangeText = jest.fn();
    const screen = await render(
      <Field label="Wochenstunden" onChangeText={onChangeText} value="38,5" />,
    );

    await fireEvent.changeText(screen.getByLabelText("Wochenstunden"), "40");

    expect(onChangeText).toHaveBeenCalledWith("40");
  });

  it("associates a field-specific error with the invalid input", async () => {
    const screen = await render(
      <Field
        error="Wochenarbeitszeit muss zwischen 1 und 80 Stunden liegen."
        label="Wochenarbeitszeit"
        value="0"
      />,
    );

    const input = screen.getByLabelText(/Wochenarbeitszeit, ungültig/);
    expect(input).toHaveProp("aria-invalid", true);
    expect(input.props.accessibilityHint).toContain("Fehler:");
    expect(screen.getByText(/muss zwischen 1 und 80 Stunden liegen/)).toBeTruthy();
  });

  it("invokes enabled primary actions and blocks disabled actions", async () => {
    const onPress = jest.fn();
    const screen = await render(<PrimaryButton onPress={onPress}>Speichern</PrimaryButton>);

    expect(screen.getByText("Speichern")).toHaveProp("maxFontSizeMultiplier", TEXT_MAX_SCALE);
    expect(TEXT_MAX_SCALE).toBe(0);

    await fireEvent.press(screen.getByRole("button", { name: "Speichern" }));
    expect(onPress).toHaveBeenCalledTimes(1);

    await screen.rerender(
      <PrimaryButton disabled onPress={onPress}>
        Speichern
      </PrimaryButton>,
    );
    await fireEvent.press(screen.getByRole("button", { name: "Speichern" }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it("keeps primary and secondary actions visually distinct", async () => {
    const screen = await render(
      <>
        <PrimaryButton onPress={() => undefined}>Speichern</PrimaryButton>
        <SecondaryButton onPress={() => undefined}>Abbrechen</SecondaryButton>
      </>,
    );

    expect(screen.getByRole("button", { name: "Speichern" })).toHaveStyle({
      width: "100%",
      minHeight: 52,
      borderWidth: 0,
      backgroundColor: LIGHT_PALETTE.primary,
      opacity: 1,
    });
    expect(screen.getByRole("button", { name: "Abbrechen" })).toHaveStyle({
      width: "100%",
      minHeight: 48,
      borderWidth: 1,
    });
    expect(screen.getByText("Abbrechen")).toHaveProp("dynamicTypeRamp", "headline");
  });

  it("announces a busy primary action and blocks repeated submission", async () => {
    const onPress = jest.fn();
    const screen = await render(
      <PrimaryButton busy busyLabel="Angaben werden gespeichert" onPress={onPress}>
        Angaben speichern
      </PrimaryButton>,
    );

    const button = screen.getByRole("button", { name: "Angaben werden gespeichert" });
    expect(button).toHaveProp("accessibilityState", { busy: true, disabled: true });
    await fireEvent.press(button);
    expect(onPress).not.toHaveBeenCalled();
  });

  it("keeps dropdown interaction inside the modal and offers an explicit close action", async () => {
    const currentOS = Platform.OS;
    Object.defineProperty(Platform, "OS", { configurable: true, value: "android" });
    const onChange = jest.fn();
    const screen = await render(
      <SafeAreaProvider
        initialMetrics={{
          frame: { height: 800, width: 400, x: 0, y: 0 },
          insets: { bottom: 0, left: 0, right: 0, top: 0 },
        }}
      >
        <DropdownField
          label="Bundesland"
          onChange={onChange}
          options={[
            { label: "Berlin", value: "BE" },
            { label: "Nordrhein-Westfalen", value: "NW" },
          ]}
          value="BE"
        />
      </SafeAreaProvider>,
    );

    await fireEvent.press(screen.getByRole("button", { name: "Bundesland: Berlin" }));

    expect(screen.getByTestId("dropdown-modal-content")).toHaveProp(
      "accessibilityViewIsModal",
      true,
    );
    expect(screen.getByRole("button", { name: "Auswahl abbrechen" })).toBeTruthy();

    await fireEvent.press(screen.getByRole("button", { name: "Nordrhein-Westfalen" }));
    expect(onChange).toHaveBeenCalledWith("NW");
    Object.defineProperty(Platform, "OS", { configurable: true, value: currentOS });
  });

  it("schedules focus for a native accessibility target", () => {
    jest.useFakeTimers();
    const focus = jest
      .spyOn(AccessibilityInfo, "setAccessibilityFocus")
      .mockImplementation((_reactTag) => {});

    scheduleAccessibilityFocus(42);
    jest.runOnlyPendingTimers();

    expect(focus).toHaveBeenCalledWith(42);
    jest.useRealTimers();
  });
});
