import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { fireEvent, render, waitFor } from "@testing-library/react-native";
import { router } from "expo-router";
import { SafeAreaProvider } from "react-native-safe-area-context";

import type { SaveProfileInput } from "@/domain/types";
import { OnboardingScreen } from "@/features/onboarding/onboarding-screen";
import { LIGHT_PALETTE } from "@/theme/palette-values";
import { CONTROL_HEIGHT } from "@/theme/tokens";

const mockUpdateProfile = jest.fn<(input: SaveProfileInput) => Promise<void>>();
jest.mock("@/application/pflegeshift-provider", () => ({
  usePflegeShiftProfile: () => ({ updateProfile: mockUpdateProfile }),
}));

jest.mock("expo-router", () => ({
  router: { replace: jest.fn() },
}));

const mockReplace = jest.mocked(router.replace);

const SAFE_AREA_METRICS = {
  frame: { x: 0, y: 0, width: 430, height: 932 },
  insets: { top: 59, right: 0, bottom: 34, left: 0 },
};

function onboarding() {
  return (
    <SafeAreaProvider initialMetrics={SAFE_AREA_METRICS}>
      <OnboardingScreen />
    </SafeAreaProvider>
  );
}

type OnboardingRender = Awaited<ReturnType<typeof render>>;

async function openSalaryStep(screen: OnboardingRender, industry = "Pflege & Gesundheitswesen") {
  await fireEvent.press(screen.getByRole("button", { name: "Los geht’s" }));
  expect(screen.getByLabelText("Schritt 2 von 5")).toBeTruthy();
  expect(screen.getByRole("button", { name: "Weiter" })).not.toBeDisabled();
  await fireEvent.press(screen.getByRole("button", { name: "Weiter" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Bitte wähle deinen Berufsbereich aus.",
  );
  await fireEvent.press(screen.getByRole("radio", { name: industry }));
  await fireEvent.press(screen.getByRole("button", { name: "Weiter" }));
  expect(screen.getByText("Wie möchtest du dein Gehalt einrichten?")).toBeTruthy();
}

async function openGuestStep(screen: OnboardingRender, weeklyHours = "38,5") {
  await fireEvent.press(screen.getByRole("button", { name: "Weiter" }));
  expect(screen.getByText("Wie sieht deine Arbeitszeit aus?")).toBeTruthy();
  await fireEvent.changeText(screen.getByTestId("onboarding-weekly-hours"), weeklyHours);
  await fireEvent.press(screen.getByRole("button", { name: "Weiter" }));
  expect(screen.getByText("Bereit für deinen Dienstplan?")).toBeTruthy();
}

describe("OnboardingScreen", () => {
  beforeEach(() => {
    mockUpdateProfile.mockReset();
    mockReplace.mockReset();
    mockUpdateProfile.mockResolvedValue(undefined);
  });

  it("starts with the approved LUNA welcome and no preselected industry", async () => {
    const screen = await render(onboarding());

    expect(screen.getByText("Willkommen bei LUNA Shift")).toBeTruthy();
    expect(screen.getByLabelText("LUNA Shift Logo")).toBeTruthy();
    expect(screen.getByLabelText("Schritt 1 von 5")).toBeTruthy();
    expect(screen.getByTestId("onboarding-primary-action")).toHaveStyle({
      width: "100%",
      minHeight: CONTROL_HEIGHT.large,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: LIGHT_PALETTE.primary,
      opacity: 1,
    });
    expect(screen.getByText("Los geht’s")).toHaveStyle({ color: LIGHT_PALETTE.onPrimary });
  });

  it("persists an explicitly selected TVöD-P guest profile", async () => {
    const screen = await render(onboarding());
    await openSalaryStep(screen);

    expect(screen.getByRole("button", { name: "Weiter" })).not.toBeDisabled();
    await fireEvent.press(screen.getByRole("button", { name: "Weiter" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Bitte wähle eine Gehaltsgrundlage aus.",
    );
    await fireEvent.press(screen.getByRole("radio", { name: /TVöD-P/ }));
    await openGuestStep(screen);

    expect(screen.getByText("Ohne Konto starten")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Konto erstellen/ })).toBeNull();
    await fireEvent.press(screen.getByRole("button", { name: "LUNA Shift öffnen" }));

    await waitFor(() => {
      expect(mockUpdateProfile).toHaveBeenCalledWith({
        federalState: "NW",
        holidayRegion: "NONE",
        weeklyMinutes: 2_310,
        timeZone: "Europe/Berlin",
        industry: "HEALTHCARE",
        manualMonthlyGrossCents: null,
        tariff: {
          payGroup: "P8",
          payLevel: 4,
          sector: "BT_K",
          tariffRegion: "OTHER",
          fullTimeWeeklyMinutes: 2_310,
        },
      });
      expect(mockReplace).toHaveBeenCalledWith("/");
    });
  });

  it("persists a manual monthly gross without tariff data", async () => {
    const screen = await render(onboarding());
    await openSalaryStep(screen);

    await fireEvent.press(screen.getByRole("radio", { name: /Monatsbrutto selbst eintragen/ }));
    await fireEvent.changeText(screen.getByTestId("onboarding-manual-gross"), "3450,50");
    await openGuestStep(screen, "40");
    await fireEvent.press(screen.getByRole("button", { name: "LUNA Shift öffnen" }));

    await waitFor(() => {
      expect(mockUpdateProfile).toHaveBeenCalledWith({
        federalState: "NW",
        holidayRegion: "NONE",
        weeklyMinutes: 2_400,
        timeZone: "Europe/Berlin",
        industry: "HEALTHCARE",
        manualMonthlyGrossCents: 345_050,
        tariff: null,
      });
    });
  });

  it("allows salary setup to be deferred without inventing a default", async () => {
    const screen = await render(onboarding());
    await openSalaryStep(screen, "Soziale Dienste");

    await fireEvent.press(screen.getByRole("radio", { name: "Später einrichten" }));
    await openGuestStep(screen);
    await fireEvent.press(screen.getByRole("button", { name: "LUNA Shift öffnen" }));

    await waitFor(() => {
      expect(mockUpdateProfile).toHaveBeenCalledWith(
        expect.objectContaining({
          industry: "SOCIAL_SERVICES",
          manualMonthlyGrossCents: null,
          tariff: null,
        }),
      );
    });
  });

  it("keeps invalid manual salary and weekly hours on their respective steps", async () => {
    const screen = await render(onboarding());
    await openSalaryStep(screen);

    await fireEvent.press(screen.getByRole("radio", { name: /Monatsbrutto selbst eintragen/ }));
    await fireEvent.changeText(screen.getByTestId("onboarding-manual-gross"), "ungültig");
    await fireEvent.press(screen.getByRole("button", { name: "Weiter" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Bitte ein Monatsbrutto zwischen 0,01 € und 100.000 € angeben.",
    );

    await fireEvent.changeText(screen.getByTestId("onboarding-manual-gross"), "3000");
    await fireEvent.press(screen.getByRole("button", { name: "Weiter" }));
    await fireEvent.changeText(screen.getByTestId("onboarding-weekly-hours"), "ungültig");
    await fireEvent.press(screen.getByRole("button", { name: "Weiter" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Bitte gültige Wochenstunden angeben.",
    );
    expect(mockUpdateProfile).not.toHaveBeenCalled();
  });
});
