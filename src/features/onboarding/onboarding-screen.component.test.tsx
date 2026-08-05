import { fireEvent, render, waitFor } from "@testing-library/react-native";
import { describe, expect, it, jest } from "@jest/globals";
import { router } from "expo-router";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { OnboardingScreen } from "@/features/onboarding/onboarding-screen";

const mockUpdateProfile =
  jest.fn<
    (input: { federalState: string; weeklyMinutes: number; timeZone: string }) => Promise<void>
  >();
jest.mock("@/application/pflegeshift-provider", () => ({
  usePflegeShiftProfile: () => ({ updateProfile: mockUpdateProfile }),
}));

jest.mock("expo-router", () => ({
  router: { replace: jest.fn() },
}));

const mockReplace = jest.mocked(router.replace);

const SAFE_AREA_METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, right: 0, bottom: 34, left: 0 },
};

function onboarding() {
  return (
    <SafeAreaProvider initialMetrics={SAFE_AREA_METRICS}>
      <OnboardingScreen />
    </SafeAreaProvider>
  );
}

describe("OnboardingScreen", () => {
  it("persists valid profile data and opens the calendar", async () => {
    mockUpdateProfile.mockResolvedValue(undefined);
    const screen = await render(onboarding());

    await fireEvent.changeText(screen.getByLabelText("Stunden pro Woche"), "40");
    await fireEvent.press(screen.getByRole("button", { name: "PflegeShift starten" }));

    await waitFor(() => {
      expect(mockUpdateProfile).toHaveBeenCalledWith({
        federalState: "NW",
        weeklyMinutes: 2_400,
        timeZone: "Europe/Berlin",
      });
      expect(mockReplace).toHaveBeenCalledWith("/");
    });
  });

  it("keeps validation failures in the form", async () => {
    const screen = await render(onboarding());

    await fireEvent.changeText(screen.getByLabelText("Stunden pro Woche"), "ungültig");
    await fireEvent.press(screen.getByRole("button", { name: "PflegeShift starten" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Bitte gültige Wochenstunden angeben.",
    );
    expect(mockUpdateProfile).not.toHaveBeenCalled();
  });
});
