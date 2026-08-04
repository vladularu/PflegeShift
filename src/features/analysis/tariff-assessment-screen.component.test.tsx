import { render } from "@testing-library/react-native";
import { describe, expect, it, jest } from "@jest/globals";
import { View } from "react-native";

import { TariffQuestion } from "@/features/analysis/tariff-question";

describe("tariff assessment questions", () => {
  it("gives repeated radio labels their question context", async () => {
    const screen = await render(
      <View>
        <TariffQuestion
          caption="Erste Erläuterung"
          onChange={jest.fn()}
          options={[
            { value: "YES", label: "Ja" },
            { value: "UNKNOWN", label: "Unsicher" },
          ]}
          title="Erste Frage?"
          value="UNKNOWN"
        />
        <TariffQuestion
          caption="Zweite Erläuterung"
          onChange={jest.fn()}
          options={[
            { value: "YES", label: "Ja" },
            { value: "UNKNOWN", label: "Unsicher" },
          ]}
          title="Zweite Frage?"
          value="YES"
        />
      </View>,
    );

    expect(screen.getByLabelText("Erste Frage?").props.accessibilityRole).toBe("radiogroup");
    expect(
      screen.getByRole("radio", { name: "Erste Frage?: Unsicher", checked: true }),
    ).toBeTruthy();
    expect(
      screen.getByRole("radio", { name: "Zweite Frage?: Unsicher", checked: false }),
    ).toBeTruthy();
  });
});
