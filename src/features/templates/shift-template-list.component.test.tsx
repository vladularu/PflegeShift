import { fireEvent, render } from "@testing-library/react-native";
import { describe, expect, it, jest } from "@jest/globals";

import {
  ShiftTemplateAddRow,
  ShiftTemplateListRow,
} from "@/features/templates/shift-template-list";

const title = "Frühdienst auf der interdisziplinären Station";
const subtitle = "07:00–15:12 · 30 Min. Pause · Übergabe auf Station 3";

async function renderRow(disabled = false) {
  const onPress = jest.fn();
  const onMorePress = jest.fn();
  const screen = await render(
    <ShiftTemplateListRow
      accessibilityLabel={`${title}, ${subtitle}, Vorlage bearbeiten`}
      color="#33A889"
      disabled={disabled}
      moreAccessibilityLabel="Vorlage verwalten"
      onMorePress={onMorePress}
      onPress={onPress}
      subtitle={subtitle}
      symbol="sunny-outline"
      testID="template-row"
      title={title}
    />,
  );
  return { screen, onPress, onMorePress };
}

describe("shift template list text reflow", () => {
  it("allows full names and descriptions to wrap without limiting Dynamic Type", async () => {
    const { screen } = await renderRow();
    for (const text of [title, subtitle]) {
      const label = screen.getByText(text);
      expect(label.props.numberOfLines).toBeUndefined();
      expect(label.props.adjustsFontSizeToFit).not.toBe(true);
      expect(label.props.allowFontScaling).not.toBe(false);
      expect(label).toHaveProp("maxFontSizeMultiplier", 0);
      expect(label.parent).toHaveStyle({ minWidth: 0, flex: 1 });
    }
    expect(screen.getByTestId("template-row")).toHaveStyle({ minHeight: 72 });
    expect(screen.getByTestId("template-row")).not.toHaveStyle({ height: 72 });
    expect(screen.getByRole("button", { name: "Vorlage verwalten" })).toHaveStyle({
      width: 44,
      height: 44,
    });
  });

  it("keeps editing and management as separate actions with complete labels", async () => {
    const { screen, onPress, onMorePress } = await renderRow();
    await fireEvent.press(
      screen.getByRole("button", { name: `${title}, ${subtitle}, Vorlage bearbeiten` }),
    );
    expect(onPress).toHaveBeenCalledTimes(1);
    expect(onMorePress).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByRole("button", { name: "Vorlage verwalten" }));
    expect(onMorePress).toHaveBeenCalledTimes(1);
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it("keeps both actions disabled during an operation", async () => {
    const { screen, onPress, onMorePress } = await renderRow(true);
    for (const button of screen.getAllByRole("button")) {
      expect(button).toBeDisabled();
      await fireEvent.press(button);
    }
    expect(onPress).not.toHaveBeenCalled();
    expect(onMorePress).not.toHaveBeenCalled();
  });

  it("bounds the add label while allowing the row to grow and keeping its action", async () => {
    const onPress = jest.fn();
    const screen = await render(
      <ShiftTemplateAddRow accessibilityLabel="Neue Dienstvorlage erstellen" onPress={onPress} />,
    );
    const label = screen.getByText("Schicht hinzufügen");
    expect(label).toHaveStyle({ flex: 1, minWidth: 0 });
    expect(label.props.numberOfLines).toBeUndefined();
    expect(label).toHaveProp("maxFontSizeMultiplier", 0);
    const button = screen.getByRole("button", { name: "Neue Dienstvorlage erstellen" });
    expect(button).toHaveStyle({ minHeight: 64, paddingVertical: 8 });
    await fireEvent.press(button);
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});
