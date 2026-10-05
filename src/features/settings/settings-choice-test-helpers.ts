import { expect } from "@jest/globals";
import { fireEvent, render, waitFor, within } from "@testing-library/react-native";

type Screen = Awaited<ReturnType<typeof render>>;

export async function selectSettingsChoice(screen: Screen, field: string, option: string) {
  await fireEvent.press(screen.getByRole("button", { name: new RegExp(`^${field}:`) }));
  const content = screen.getByTestId("dropdown-modal-content");
  await fireEvent(content, "show");
  const dialog = within(content);
  expect(dialog.getByRole("button", { name: "Auswahl abbrechen" })).toBeTruthy();
  const choices = dialog
    .getAllByRole("button")
    .map((button) => button.props.accessibilityLabel as string)
    .filter((label) => label !== "Auswahl abbrechen");
  await fireEvent.press(dialog.getByRole("button", { name: option }));
  await waitFor(() => expect(screen.queryByTestId("dropdown-modal-content")).toBeNull());
  return choices;
}
