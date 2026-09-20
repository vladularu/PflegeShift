import { fireEvent, render } from "@testing-library/react-native";
import { describe, expect, it, jest } from "@jest/globals";

import { InlineNotice, RowButton, SegmentedControl } from "@/ui/design-system";

describe("design system accessibility", () => {
  it("exposes selected tabs and announces changes", async () => {
    const onChange = jest.fn();
    const screen = await render(
      <SegmentedControl
        items={[
          { value: "MONTH", label: "Monat" },
          { value: "YEAR", label: "Jahr" },
        ]}
        onChange={onChange}
        value="MONTH"
      />,
    );

    expect(screen.getByRole("tab", { name: "Monat", selected: true })).toBeTruthy();
    await fireEvent.press(screen.getByRole("tab", { name: "Jahr" }));
    expect(onChange).toHaveBeenCalledWith("YEAR");
  });

  it("renders error notices as alerts", async () => {
    const screen = await render(<InlineNotice message="Speichern fehlgeschlagen" tone="error" />);

    expect(screen.getByRole("alert")).toHaveTextContent("Speichern fehlgeschlagen");
  });

  it("keeps animated rows in one horizontal line", async () => {
    const screen = await render(
      <RowButton leading={<></>} onPress={() => undefined} subtitle="Beschreibung" title="Titel" />,
    );

    expect(screen.getByRole("button")).toHaveStyle({
      minHeight: 56,
      flexDirection: "row",
      alignItems: "center",
    });
  });

  it("gives expanded descriptions the full row width without limiting text scaling", async () => {
    const onPress = jest.fn();
    const onLongPress = jest.fn();
    const screen = await render(
      <RowButton
        leading={<></>}
        onPress={onPress}
        onLongPress={onLongPress}
        delayLongPress={5000}
        subtitleBelow
        subtitle="SQLite · ausschließlich auf diesem Gerät"
        title="Lokale Datenspeicherung"
      />,
    );
    const title = screen.getByText("Lokale Datenspeicherung");
    const subtitle = screen.getByText("SQLite · ausschließlich auf diesem Gerät");
    expect(subtitle.parent).not.toBe(title.parent);
    expect(subtitle.parent).toHaveStyle({ flex: 1, minWidth: 0 });
    expect(title.parent?.parent?.parent).toBe(subtitle.parent);
    for (const text of [title, subtitle]) {
      expect(text.props.numberOfLines).toBeUndefined();
      expect(text.props.maxFontSizeMultiplier).toBe(0);
      expect(text.props.adjustsFontSizeToFit).not.toBe(true);
    }
    await fireEvent.press(screen.getByRole("button"));
    await fireEvent(screen.getByRole("button"), "longPress");
    expect(onPress).toHaveBeenCalledTimes(1);
    expect(onLongPress).toHaveBeenCalledTimes(1);
  });
});
