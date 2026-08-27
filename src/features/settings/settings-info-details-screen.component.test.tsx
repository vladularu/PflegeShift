import { render } from "@testing-library/react-native";
import { describe, expect, it, jest } from "@jest/globals";

import { SettingsInfoDetailsScreen } from "@/features/settings/settings-info-details-screen";

jest.mock("expo-router", () => ({
  router: { back: jest.fn() },
  Stack: { Screen: () => null },
  useLocalSearchParams: () => ({ section: "STORAGE" }),
}));

describe("SettingsInfoDetailsScreen storage disclosure", () => {
  it("makes the local deletion retention visible", async () => {
    const screen = await render(<SettingsInfoDetailsScreen />);

    expect(screen.getByText("Löschen")).toBeTruthy();
    expect(
      screen.getByText(/Der verschlüsselte Datensatz bleibt 90 Tage lokal gespeichert/),
    ).toBeTruthy();
    expect(screen.getByText(/Gelöschte Vorlagen bleiben länger erhalten/)).toBeTruthy();
  });
});
