import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { describe, expect, it, jest } from "@jest/globals";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { ColorPicker } from "@/ui/form-controls";
import { ShiftSymbolPicker } from "@/ui/shift-symbol-picker";

describe("shift appearance pickers", () => {
  it("selects a semantic symbol", async () => {
    const onChange = jest.fn();
    await render(<ShiftSymbolPicker color="#F05C68" onChange={onChange} value="sun" />);

    fireEvent.press(screen.getByRole("radio", { name: "Mond" }));

    expect(onChange).toHaveBeenCalledWith("moon");
  });

  it("keeps custom text symbols editable", async () => {
    const onChange = jest.fn();
    await render(<ShiftSymbolPicker color="#31A7C3" onChange={onChange} value="XY" />);

    fireEvent.changeText(screen.getByLabelText("Eigenes Symbol oder Kürzel"), "ZD");

    expect(onChange).toHaveBeenCalledWith("ZD");
  });

  it("opens the full color grid and selects a swatch", async () => {
    const onChange = jest.fn();
    await render(
      <SafeAreaProvider
        initialMetrics={{
          frame: { x: 0, y: 0, width: 390, height: 844 },
          insets: { top: 47, right: 0, bottom: 34, left: 0 },
        }}
      >
        <ColorPicker onChange={onChange} symbol="sun" value="#F05C68" />
      </SafeAreaProvider>,
    );

    await act(async () => {
      fireEvent.press(screen.getByRole("button", { name: "Alle Farben, aktuell #F05C68" }));
    });
    fireEvent.press(await screen.findByRole("button", { name: "Farbe #4FCB68" }));

    expect(onChange).toHaveBeenCalledWith("#4FCB68");
  });
});
