import { fireEvent, render, waitFor, within } from "@testing-library/react-native";
import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import { ActionSheetIOS, Keyboard, Platform } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { SALARY_BASIS_OPTIONS } from "@/features/settings/salary-basis-options";
import type { SalaryMode } from "@/features/settings/settings-form-values";
import { TEXT_MAX_SCALE } from "@/theme/typography";
import { DropdownField } from "@/ui/form-controls";

const initialOS = Platform.OS;
const metrics = {
  frame: { height: 852, width: 393, x: 0, y: 0 },
  insets: { bottom: 34, left: 0, right: 0, top: 59 },
};

function choice(value: SalaryMode, onChange: (value: SalaryMode) => void) {
  return (
    <SafeAreaProvider initialMetrics={metrics}>
      <DropdownField
        label="Berechnung"
        modalTitle="Gehaltsgrundlage"
        onChange={onChange}
        options={SALARY_BASIS_OPTIONS}
        value={value}
      />
    </SafeAreaProvider>
  );
}

async function open(screen: Awaited<ReturnType<typeof render>>) {
  await fireEvent.press(screen.getByRole("button", { name: /^Berechnung:/ }));
  const content = screen.getByTestId("dropdown-modal-content");
  await fireEvent(content, "show");
  return within(content);
}

describe("grouped salary choice on iPhone", () => {
  beforeEach(() => {
    Object.defineProperty(Platform, "OS", { configurable: true, value: "ios" });
  });
  afterEach(() => {
    Object.defineProperty(Platform, "OS", { configurable: true, value: initialOS });
    jest.restoreAllMocks();
  });

  it("shows the eight real choices in three groups and separates region subtitles", async () => {
    const nativeSheet = jest
      .spyOn(ActionSheetIOS, "showActionSheetWithOptions")
      .mockImplementation(() => {});
    const dismissKeyboard = jest.spyOn(Keyboard, "dismiss").mockImplementation(() => {});
    const screen = await render(choice("TVL_KR", jest.fn()));
    const dialog = await open(screen);

    expect(nativeSheet).not.toHaveBeenCalled();
    expect(dismissKeyboard).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("header", { name: "Gehaltsgrundlage, Auswahldialog" })).toBeTruthy();
    for (const group of ["Pflegepersonal", "Ausbildung", "Eigenes Gehalt"]) {
      expect(dialog.getByRole("header", { name: group })).toBeTruthy();
    }
    expect(dialog.getAllByRole("button")).toHaveLength(9);
    expect(dialog.queryByRole("button", { name: "Bitte wählen" })).toBeNull();
    expect(dialog.getByText("TV-H Pflege")).toBeTruthy();
    expect(dialog.getByText("Hessen")).toBeTruthy();
    expect(dialog.getByText("TV-UK Pflege")).toBeTruthy();
    expect(dialog.getByText("Baden-Württemberg")).toBeTruthy();
    expect(dialog.getByRole("button", { name: "TV-L Pflege" })).toHaveProp("accessibilityState", {
      selected: true,
    });
    expect(dialog.getByRole("button", { name: "TVöD-P" })).toHaveProp("accessibilityState", {
      selected: false,
    });
  });

  it("selects the existing tariff key once, closes, and marks the updated choice on reopening", async () => {
    const onChange = jest.fn<(value: SalaryMode) => void>();
    const screen = await render(choice("TVL_KR", onChange));
    const dialog = await open(screen);
    await fireEvent.press(dialog.getByRole("button", { name: "TV-H Pflege · Hessen" }));

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith("TVH_KR");
    await waitFor(() => expect(screen.queryByTestId("dropdown-modal-content")).toBeNull());
    expect(screen.getByRole("button", { name: "Berechnung: TV-L Pflege" })).toHaveProp(
      "accessibilityState",
      { expanded: false },
    );

    await screen.rerender(choice("TVH_KR", onChange));
    const reopened = await open(screen);
    expect(reopened.getByRole("button", { name: "TV-H Pflege · Hessen" })).toHaveProp(
      "accessibilityState",
      { selected: true },
    );
    expect(reopened.getByRole("button", { name: "TV-L Pflege" })).toHaveProp("accessibilityState", {
      selected: false,
    });
  });

  it("keeps an unset value as the field placeholder without offering it as a tariff", async () => {
    const onChange = jest.fn<(value: SalaryMode) => void>();
    const screen = await render(choice("UNSET", onChange));
    expect(screen.getByRole("button", { name: "Berechnung: Bitte wählen" })).toBeTruthy();
    const dialog = await open(screen);
    expect(dialog.queryByText("Bitte wählen")).toBeNull();
    expect(
      dialog.getAllByRole("button").some((button) => button.props.accessibilityState?.selected),
    ).toBe(false);
    await fireEvent.press(dialog.getByRole("button", { name: "Monatsbrutto selbst eintragen" }));
    expect(onChange).toHaveBeenCalledWith("MANUAL");
  });

  it("cancels and handles the native back request without changing the selected tariff", async () => {
    const onChange = jest.fn<(value: SalaryMode) => void>();
    const screen = await render(choice("TVAL_PFLEGE", onChange));
    const dialog = await open(screen);
    await fireEvent.press(dialog.getByRole("button", { name: "Auswahl abbrechen" }));
    expect(onChange).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByTestId("dropdown-modal-content")).toBeNull());

    await open(screen);
    await fireEvent(screen.getByTestId("dropdown-modal-content"), "requestClose");
    expect(onChange).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByTestId("dropdown-modal-content")).toBeNull());
    expect(
      screen.getByRole("button", { name: "Berechnung: TVA-L Pflege · Ausbildung" }),
    ).toHaveProp("accessibilityState", { expanded: false });
  });

  it("allows large text and retains a usable row and safe-area footer", async () => {
    const screen = await render(choice("TVUK_NURSING", jest.fn()));
    const dialog = await open(screen);
    expect(dialog.getByText("TV-UK Pflege")).toHaveProp("maxFontSizeMultiplier", TEXT_MAX_SCALE);
    expect(dialog.getByText("Baden-Württemberg")).toHaveProp(
      "maxFontSizeMultiplier",
      TEXT_MAX_SCALE,
    );
    expect(TEXT_MAX_SCALE).toBe(0);
    expect(dialog.getByRole("button", { name: "TV-UK Pflege · Baden-Württemberg" })).toHaveStyle({
      minHeight: 48,
    });
    expect(screen.getByTestId("dropdown-modal-content")).toHaveStyle({ paddingBottom: 34 });
  });

  it("uses the same selection sheet for ungrouped iOS fields", async () => {
    const nativeSheet = jest
      .spyOn(ActionSheetIOS, "showActionSheetWithOptions")
      .mockImplementation(() => {});
    const onChange = jest.fn<(value: string) => void>();
    const screen = await render(
      <SafeAreaProvider initialMetrics={metrics}>
        <DropdownField
          label="Tarifgebiet"
          onChange={onChange}
          options={[
            { value: "WEST", label: "West" },
            { value: "EAST", label: "Ost" },
          ]}
          value="WEST"
        />
      </SafeAreaProvider>,
    );
    await fireEvent.press(screen.getByRole("button", { name: "Tarifgebiet: West" }));
    expect(nativeSheet).not.toHaveBeenCalled();
    const content = screen.getByTestId("dropdown-modal-content");
    await fireEvent(content, "show");
    const dialog = within(content);
    expect(dialog.getByRole("button", { name: "West" })).toHaveProp("accessibilityState", {
      selected: true,
    });
    expect(dialog.getByRole("button", { name: "Ost" })).toHaveStyle({ minHeight: 48 });
    expect(
      screen.getByTestId("selection-sheet-grabber", { includeHiddenElements: true }),
    ).toBeTruthy();
    await fireEvent.press(dialog.getByRole("button", { name: "Ost" }));
    expect(onChange).toHaveBeenCalledWith("EAST");
  });
});
