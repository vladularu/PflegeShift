import { render } from "@testing-library/react-native";
import { beforeEach, describe, expect, it, jest } from "@jest/globals";

import { SettingsInfoDetailsScreen } from "@/features/settings/settings-info-details-screen";

let mockParams: { section: string; tariff?: string } = { section: "STORAGE" };

jest.mock("expo-router", () => ({
  router: { back: jest.fn() },
  Stack: { Screen: () => null },
  useLocalSearchParams: () => mockParams,
}));

describe("SettingsInfoDetailsScreen storage disclosure", () => {
  beforeEach(() => {
    mockParams = { section: "STORAGE" };
  });
  it("shows the TV-L care allowance source through the existing information route", async () => {
    mockParams = { section: "CARE_ALLOWANCE", tariff: "TVL" };
    const screen = await render(<SettingsInfoDetailsScreen />);
    expect(screen.getByText(/Die allgemeine Pflegezulage für Pflegepersonen/)).toBeTruthy();
    expect(screen.getByText(/TV-L Entgeltordnung Anlage A/)).toBeTruthy();
    expect(screen.queryByText(/unterstütztes TVöD-P-Profil/)).toBeNull();
  });
  it("makes the local deletion retention visible", async () => {
    const screen = await render(<SettingsInfoDetailsScreen />);

    expect(screen.getByText("Löschen")).toBeTruthy();
    expect(
      screen.getByText(/Der verschlüsselte Datensatz bleibt 90 Tage lokal gespeichert/),
    ).toBeTruthy();
    expect(screen.getByText(/Gelöschte Vorlagen bleiben länger erhalten/)).toBeTruthy();
    expect(screen.getByText(/vor dem Wiederherstellen prüfen/)).toBeTruthy();
  });
});
