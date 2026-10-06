import { fireEvent, render } from "@testing-library/react-native";
import { expect, it } from "@jest/globals";
import { InfoDisclosure } from "./info-disclosure";

it("keeps the summary visible and opens the complete explanation only on request", async () => {
  const screen = await render(
    <InfoDisclosure
      summary="Nur 5,8 Std. Ruhezeit."
      details="Vollständige Erklärung mit Voraussetzungen."
      label="Ruhezeit erklären"
    />,
  );
  const button = screen.getByRole("button", { name: "Ruhezeit erklären. Nur 5,8 Std. Ruhezeit." });
  expect(button.props.accessibilityState.expanded).toBe(false);
  expect(button.props.accessibilityLabel).toContain("Nur 5,8 Std. Ruhezeit.");
  expect(screen.queryByText("Vollständige Erklärung mit Voraussetzungen.")).toBeNull();
  expect(screen.getByText("Nur 5,8 Std. Ruhezeit.").props.numberOfLines).toBeUndefined();
  expect(screen.getByText("Nur 5,8 Std. Ruhezeit.").props.maxFontSizeMultiplier).toBeUndefined();
  await fireEvent.press(button);
  expect(button.props.accessibilityState.expanded).toBe(true);
  expect(screen.getByText("Vollständige Erklärung mit Voraussetzungen.")).toBeTruthy();
  await fireEvent.press(button);
  expect(screen.queryByText("Vollständige Erklärung mit Voraussetzungen.")).toBeNull();
  expect(screen.getByText("Nur 5,8 Std. Ruhezeit.")).toBeTruthy();
});

it("does not add a disclosure when the complete information already fits the summary", async () => {
  const screen = await render(<InfoDisclosure summary="Zeiten prüfen." details="Zeiten prüfen." />);
  expect(screen.queryByRole("button")).toBeNull();
  expect(screen.getByText("Zeiten prüfen.")).toBeTruthy();
});

it("shows short explanatory points in readable text after opening", async () => {
  const screen = await render(
    <InfoDisclosure
      summary="Über die Prüfung"
      details={["Gesetzliche Regeln: immer sichtbar.", "Planungshinweise: freiwillig."]}
    />,
  );
  expect(screen.queryByText("Gesetzliche Regeln: immer sichtbar.")).toBeNull();
  await fireEvent.press(screen.getByRole("button", { name: "Über die Prüfung" }));
  expect(screen.getByText("Gesetzliche Regeln: immer sichtbar.")).toBeTruthy();
  expect(screen.getByText("Planungshinweise: freiwillig.")).toBeTruthy();
});
