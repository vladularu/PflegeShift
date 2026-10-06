import { fireEvent, render, within } from "@testing-library/react-native";
import { describe, expect, it, jest } from "@jest/globals";
import { Keyboard, StyleSheet, Text } from "react-native";
import { SafeAreaInsetsContext } from "react-native-safe-area-context";
import { LIGHT_PALETTE } from "@/theme/palette-values";
import { ProfilePage } from "./profile-page";
const mockPalette = LIGHT_PALETTE;
jest.mock("@/theme/palette", () => ({ usePalette: () => mockPalette }));
describe("profile page one-handed footer", () => {
  it("keeps the return action outside the scrolling content and above the home indicator", async () => {
    const screen = await render(
      <SafeAreaInsetsContext.Provider value={{ top: 47, bottom: 34, left: 0, right: 0 }}>
        <ProfilePage title="Arbeitszeit" backLabel="Zurück zum Arbeitsprofil" onBack={() => {}}>
          <Text>Entwurf</Text>
        </ProfilePage>
      </SafeAreaInsetsContext.Provider>,
    );
    const footer = screen.getByTestId("profile-back-footer");
    expect(
      within(screen.getByTestId("profile-scroll-content")).queryByRole("button", {
        name: "Zurück zum Arbeitsprofil",
      }),
    ).toBeNull();
    expect(footer.props.style.paddingBottom).toBeGreaterThanOrEqual(34);
    const button = within(footer).getByRole("button", { name: "Zurück zum Arbeitsprofil" });
    expect(StyleSheet.flatten(button.props.style).minHeight).toBeGreaterThanOrEqual(44);
    expect(screen.getByText("Entwurf")).toBeTruthy();
  });
  it("dismisses the keyboard and invokes the parent return action", async () => {
    const onBack = jest.fn();
    const dismiss = jest.spyOn(Keyboard, "dismiss");
    const screen = await render(
      <ProfilePage title="Arbeitszeit" backLabel="Zurück zum Arbeitsprofil" onBack={onBack} />,
    );
    await fireEvent.press(screen.getByRole("button", { name: "Zurück zum Arbeitsprofil" }));
    expect(dismiss).toHaveBeenCalled();
    expect(onBack).toHaveBeenCalledTimes(1);
    dismiss.mockRestore();
  });
  it("prevents return while the whole draft is being saved", async () => {
    const onBack = jest.fn();
    const screen = await render(
      <ProfilePage
        title="Arbeitszeit"
        backLabel="Zurück zum Arbeitsprofil"
        onBack={onBack}
        backDisabled
      />,
    );
    const button = screen.getByRole("button", { name: "Zurück zum Arbeitsprofil" });
    expect(button.props.accessibilityState.disabled).toBe(true);
    await fireEvent.press(button);
    expect(onBack).not.toHaveBeenCalled();
  });
});
