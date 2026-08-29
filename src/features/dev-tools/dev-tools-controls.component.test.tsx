import { fireEvent, render } from "@testing-library/react-native";
import { describe, expect, it, jest } from "@jest/globals";

import { RuleCatalogRefreshCard, SmallButton } from "@/features/dev-tools/dev-tools-screen";

jest.mock("expo-sqlite", () => ({ useSQLiteContext: jest.fn() }));

describe("dev tool controls", () => {
  it("exposes secondary actions as named buttons", async () => {
    const onPress = jest.fn();
    const screen = await render(<SmallButton label="Original laden" onPress={onPress} />);

    await fireEvent.press(screen.getByRole("button", { name: "Original laden" }));

    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it("shows the active generation and exposes an immediate catalog check", async () => {
    const onRefresh = jest.fn();
    const screen = await render(
      <RuleCatalogRefreshCard
        busy={false}
        generation={2}
        message="Generation 2 ist aktuell."
        onRefresh={onRefresh}
      />,
    );

    expect(screen.getByText("Generation 2")).toBeTruthy();
    expect(screen.getByText("Generation 2 ist aktuell.")).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Jetzt prüfen" }));

    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it("blocks repeated catalog checks while the request is running", async () => {
    const onRefresh = jest.fn();
    const screen = await render(
      <RuleCatalogRefreshCard busy generation={1} message={null} onRefresh={onRefresh} />,
    );

    const button = screen.getByRole("button", { name: "Regelkatalog wird geprüft" });
    expect(button).toHaveProp("accessibilityState", { busy: true, disabled: true });
    await fireEvent.press(button);
    expect(onRefresh).not.toHaveBeenCalled();
  });
});
