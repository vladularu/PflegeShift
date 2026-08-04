import { fireEvent, render } from "@testing-library/react-native";
import { describe, expect, it, jest } from "@jest/globals";

import { LabeledSwitch } from "@/ui/labeled-switch";

describe("LabeledSwitch", () => {
  it("exposes its purpose and state directly to assistive technology", async () => {
    const onValueChange = jest.fn<(value: boolean) => void>();
    const screen = await render(
      <LabeledSwitch label="Termine anzeigen" onValueChange={onValueChange} value />,
    );

    const control = screen.getByRole("switch", { name: "Termine anzeigen", checked: true });
    fireEvent(control, "valueChange", false);
    expect(onValueChange).toHaveBeenCalledWith(false);
  });
});
