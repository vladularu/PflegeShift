import { render } from "@testing-library/react-native";
import { describe, expect, it, jest } from "@jest/globals";

import { SettingsInfoDetailsScreen } from "@/features/settings/settings-info-details-screen";

jest.mock("expo-router", () => ({
  router: { back: jest.fn() },
  Stack: { Screen: () => null },
  useLocalSearchParams: () => ({ section: "STORAGE" }),
}));

describe("SettingsInfoDetailsScreen location disclosure", () => {
  it("names the external providers and the no-tracking boundary", async () => {
    const screen = await render(<SettingsInfoDetailsScreen />);

    expect(
      screen.getByText(/auf iOS über Apple, auf Android über den systemseitigen Geocoder/),
    ).toBeTruthy();
    expect(screen.getByText(/nicht deine aktuelle GPS-Position/)).toBeTruthy();
    expect(
      screen.getByText(/auf iOS Kartendaten von Apple und auf Android von Google/),
    ).toBeTruthy();
    expect(screen.getByText(/nicht an einen PflegeShift-Server/)).toBeTruthy();
  });
});
