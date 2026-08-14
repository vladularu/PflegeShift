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
});
