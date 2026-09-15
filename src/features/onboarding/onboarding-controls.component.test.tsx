import { describe, expect, it, jest } from "@jest/globals";
import { fireEvent, render } from "@testing-library/react-native";
import { createRef } from "react";
import { Keyboard, TextInput } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { Choice, NumberField, SelectField } from "./onboarding-controls";

const metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 59, bottom: 34, left: 0, right: 0 },
};
const options = [
  { value: "BT_K", label: "Krankenhäuser" },
  { value: "BT_B", label: "Pflege und Betreuung" },
];

describe("Onboarding compact selection", () => {
  it("dismisses via backdrop and close without changing the selection", async () => {
    const dismissKeyboard = jest.spyOn(Keyboard, "dismiss");
    const onChange = jest.fn();
    const screen = await render(
      <SafeAreaProvider initialMetrics={metrics}>
        <SelectField label="Tarifbereich" value="BT_K" options={options} onChange={onChange} />
      </SafeAreaProvider>,
    );
    await fireEvent.press(screen.getByRole("button", { name: "Tarifbereich: Krankenhäuser" }));
    expect(dismissKeyboard).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("header", { name: "Tarifbereich" })).toBeTruthy();
    await fireEvent.press(
      screen.getByTestId("onboarding-select-backdrop", { includeHiddenElements: true }),
    );
    expect(screen.queryByRole("header")).toBeNull();
    await fireEvent.press(screen.getByRole("button", { name: "Tarifbereich: Krankenhäuser" }));
    await fireEvent.press(screen.getByRole("button", { name: "Tarifbereich schließen" }));
    expect(screen.queryByRole("header")).toBeNull();
    expect(onChange).not.toHaveBeenCalled();
    dismissKeyboard.mockRestore();
  });

  it("selects one option and closes the popup", async () => {
    const onChange = jest.fn();
    const screen = await render(
      <SafeAreaProvider initialMetrics={metrics}>
        <SelectField label="Tarifbereich" value={null} options={options} onChange={onChange} />
      </SafeAreaProvider>,
    );
    await fireEvent.press(screen.getByRole("button", { name: "Tarifbereich: Bitte auswählen" }));
    await fireEvent.press(screen.getByRole("radio", { name: "Pflege und Betreuung" }));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith("BT_B");
    expect(screen.queryByRole("header")).toBeNull();
  });

  it("keeps the choice label accessible with a decorative monochrome icon", async () => {
    const onPress = jest.fn();
    const screen = await render(
      <Choice title="Rettungsdienst" selected={false} icon="ambulance" onPress={onPress} />,
    );
    await fireEvent.press(screen.getByRole("radio", { name: "Rettungsdienst" }));
    expect(onPress).toHaveBeenCalledTimes(1);
    expect(screen.getAllByRole("radio")).toHaveLength(1);
  });

  it("retains the input label and editing in the large hours card", async () => {
    const change = jest.fn();
    const screen = await render(
      <NumberField
        large
        label="Wochenstunden"
        value="38,5"
        placeholder="38,5"
        onChangeText={change}
        inputRef={createRef<TextInput>()}
        testID="hours"
      />,
    );
    expect(screen.getByText("Stunden pro Woche")).toBeTruthy();
    expect(screen.getByLabelText("Wochenstunden")).toHaveDisplayValue("38,5");
    await fireEvent.changeText(screen.getByLabelText("Wochenstunden"), "30");
    expect(change).toHaveBeenCalledWith("30");
  });

  it("opens the same selection from the compact labelled row", async () => {
    const change = jest.fn();
    const screen = await render(
      <SafeAreaProvider initialMetrics={metrics}>
        <SelectField
          compact
          label="100 % entsprechen"
          value={40}
          options={[
            { value: 40, label: "40 h" },
            { value: 38.5, label: "38,5 h" },
          ]}
          onChange={change}
        />
      </SafeAreaProvider>,
    );
    await fireEvent.press(screen.getByRole("button", { name: "100 % entsprechen: 40 h" }));
    await fireEvent.press(screen.getByRole("radio", { name: "38,5 h" }));
    expect(change).toHaveBeenCalledWith(38.5);
  });
});
