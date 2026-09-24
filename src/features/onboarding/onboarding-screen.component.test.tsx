import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { act, fireEvent, render, waitFor, within } from "@testing-library/react-native";
import { router } from "expo-router";
import { SafeAreaProvider } from "react-native-safe-area-context";
import type { SaveProfileInput } from "@/domain/types";
import { DARK_PALETTE, LIGHT_PALETTE } from "@/theme/palette-values";
import { OnboardingScreen, normalizeOnboardingGross, parseWeeklyHours } from "./onboarding-screen";

const mockUpdateProfile = jest.fn<(input: SaveProfileInput) => Promise<void>>();
let mockProfile: object | null = null;
let mockPalette = LIGHT_PALETTE;
jest.mock("@/theme/palette", () => ({ usePalette: () => mockPalette }));
jest.mock("@/application/pflegeshift-provider", () => ({
  usePflegeShiftProfile: () => ({ profile: mockProfile, updateProfile: mockUpdateProfile }),
}));
jest.mock("expo-router", () => ({ router: { replace: jest.fn(), back: jest.fn() } }));
const metrics = {
  frame: { x: 0, y: 0, width: 430, height: 932 },
  insets: { top: 59, right: 0, bottom: 34, left: 0 },
};
function onboarding(preview = false) {
  return (
    <SafeAreaProvider initialMetrics={metrics}>
      <OnboardingScreen preview={preview} />
    </SafeAreaProvider>
  );
}
type Screen = Awaited<ReturnType<typeof render>>;
const press = (screen: Screen, name: string | RegExp) =>
  fireEvent.press(screen.getByRole("button", { name }));
async function select(screen: Screen, field: string, option: string) {
  await press(screen, new RegExp(`^${field}:`));
  await fireEvent.press(screen.getByRole("radio", { name: option }));
}
async function salary(screen: Screen, industry = "Pflege & Gesundheitswesen") {
  await press(screen, "Los geht’s");
  await fireEvent.press(screen.getByRole("radio", { name: industry }));
  await press(screen, "Weiter");
}
async function work(screen: Screen) {
  await fireEvent.press(screen.getByRole("radio", { name: "Später einrichten" }));
  await press(screen, "Weiter");
}
async function summary(screen: Screen, hours = "38,5") {
  await fireEvent.changeText(screen.getByTestId("onboarding-weekly-hours"), hours);
  await select(screen, "Bundesland deines Arbeitsorts", "Nordrhein-Westfalen");
  await press(screen, "Weiter");
  expect(screen.getByText("Dein Überblick ist bereit.")).toBeTruthy();
}

describe("LUNA onboarding", () => {
  it.each(["P5", "P6"])("saves %s stage 1 through onboarding", async (payGroup) => {
    const screen = await render(onboarding());
    await salary(screen);
    await fireEvent.press(screen.getByRole("radio", { name: "TVöD-P" }));
    await select(screen, "Entgeltgruppe", payGroup);
    await select(screen, "Stufe", "Stufe 1");
    await select(screen, "Tarifbereich", "Krankenhäuser · BT-K");
    await press(screen, "Weiter");
    await summary(screen);
    await press(screen, "Ohne Konto starten");
    await waitFor(() =>
      expect(mockUpdateProfile).toHaveBeenCalledWith(
        expect.objectContaining({ tariff: expect.objectContaining({ payGroup, payLevel: 1 }) }),
      ),
    );
  });

  it("requires a new stage after switching from P5/1 to P7", async () => {
    const screen = await render(onboarding());
    await salary(screen);
    await fireEvent.press(screen.getByRole("radio", { name: "TVöD-P" }));
    await select(screen, "Entgeltgruppe", "P5");
    await select(screen, "Stufe", "Stufe 1");
    await select(screen, "Entgeltgruppe", "P7");
    await select(screen, "Tarifbereich", "Krankenhäuser · BT-K");
    await press(screen, "Weiter");
    expect(screen.getByText("Bitte wähle deine Stufe.")).toBeTruthy();
    await press(screen, /^Stufe:/);
    expect(screen.queryByRole("radio", { name: "Stufe 1" })).toBeNull();
    await fireEvent.press(screen.getByRole("radio", { name: "Stufe 2" }));
    await press(screen, "Weiter");
    await summary(screen);
    await press(screen, "Ohne Konto starten");
    await waitFor(() =>
      expect(mockUpdateProfile).toHaveBeenCalledWith(
        expect.objectContaining({
          tariff: expect.objectContaining({ payGroup: "P7", payLevel: 2 }),
        }),
      ),
    );
  });

  it("keeps the main action outside the scroll area and uses the centered blueprint welcome", async () => {
    const screen = await render(onboarding());
    expect(screen.getByText("Dein Dienstplan.\nDein Rhythmus.")).toHaveStyle({
      textAlign: "center",
    });
    expect(screen.getByText("F")).toBeTruthy();
    expect(screen.getByText("S")).toBeTruthy();
    expect(screen.getByText("N")).toBeTruthy();
    expect(screen.getByText("1 / 5")).toBeTruthy();
    expect(
      within(screen.getByTestId("onboarding-scroll-content")).queryByTestId(
        "onboarding-primary-action",
      ),
    ).toBeNull();
    expect(
      within(screen.getByTestId("onboarding-fixed-footer")).getByRole("button", {
        name: "Los geht’s",
      }),
    ).toBeTruthy();
    await salary(screen);
    await work(screen);
    expect(screen.queryByRole("button", { name: "20 Wochenstunden auswählen" })).toBeNull();
  });
  it("preserves real hours and the percentage baseline through summary editing in preview", async () => {
    const screen = await render(onboarding(true));
    await salary(screen);
    await work(screen);
    await select(screen, "100 % entsprechen", "40 h");
    const slider = screen.getByTestId("onboarding-percentage-slider");
    await fireEvent(slider, "layout", { nativeEvent: { layout: { width: 90 } } });
    await fireEvent(slider, "responderGrant", { nativeEvent: { locationX: 65, pageX: 65 } });
    await fireEvent(slider, "responderRelease", {});
    expect(screen.getByTestId("onboarding-weekly-hours")).toHaveDisplayValue("30");
    await select(screen, "100 % entsprechen", "38,5 h");
    expect(screen.getByTestId("onboarding-weekly-hours")).toHaveDisplayValue("30");
    expect(screen.getByTestId("onboarding-percentage-value")).toHaveTextContent("77,9 %");
    await fireEvent.changeText(screen.getByTestId("onboarding-weekly-hours"), "19,25");
    expect(screen.getByTestId("onboarding-percentage-value")).toHaveTextContent("50 %");
    await select(screen, "Bundesland deines Arbeitsorts", "Berlin");
    await press(screen, "Weiter");
    await press(screen, "Arbeitszeit bearbeiten");
    expect(screen.getByRole("button", { name: "100 % entsprechen: 38,5 h" })).toBeTruthy();
    expect(screen.getByTestId("onboarding-weekly-hours")).toHaveDisplayValue("19,25");
    await press(screen, "Übernehmen");
    await press(screen, "Ohne Konto starten");
    expect(mockUpdateProfile).not.toHaveBeenCalled();
  });
  beforeEach(() => {
    mockPalette = LIGHT_PALETTE;
    mockProfile = null;
    jest.clearAllMocks();
    mockUpdateProfile.mockReset();
    mockUpdateProfile.mockResolvedValue(undefined);
  });
  it("keeps the same red action and entered choices through a live theme change", async () => {
    const screen = await render(onboarding(true));
    await salary(screen);
    await work(screen);
    await fireEvent.changeText(screen.getByTestId("onboarding-weekly-hours"), "32");
    for (const palette of [DARK_PALETTE, LIGHT_PALETTE]) {
      mockPalette = palette;
      await screen.rerender(onboarding(true));
      expect(screen.getByTestId("onboarding-primary-action")).toHaveStyle({
        backgroundColor: "#C93443",
      });
      expect(screen.getByText("Weiter")).toHaveStyle({ color: "#FFFFFF" });
      expect(screen.getByTestId("onboarding-weekly-hours")).toHaveDisplayValue("32");
      expect(screen.getByTestId("onboarding-percentage-value")).toHaveStyle({
        color: palette.primary,
      });
    }
    expect(mockUpdateProfile).not.toHaveBeenCalled();
  });
  it("shows the brand and requires a deliberate industry and salary choice", async () => {
    const screen = await render(onboarding());
    expect(screen.getByText("Dein Dienstplan.\nDein Rhythmus.")).toBeTruthy();
    expect(screen.getByLabelText("LUNA Shift Logo")).toBeTruthy();
    expect(screen.getByTestId("onboarding-primary-action")).toHaveStyle({
      backgroundColor: "#C93443",
      minHeight: 52,
    });
    await press(screen, "Los geht’s");
    screen.getAllByRole("radio").forEach((radio) => expect(radio).not.toBeChecked());
    await press(screen, "Weiter");
    expect(screen.getByRole("alert")).toHaveTextContent("Bitte wähle deinen Berufsbereich aus.");
    await fireEvent.press(screen.getByRole("radio", { name: "Rettungsdienst" }));
    await press(screen, "Weiter");
    await press(screen, "Weiter");
    expect(screen.getByRole("alert")).toHaveTextContent("Bitte wähle eine Gehaltsgrundlage aus.");
    expect(mockUpdateProfile).not.toHaveBeenCalled();
  });
  it("requires all tariff fields and saves explicitly chosen values", async () => {
    const screen = await render(onboarding());
    await salary(screen);
    await fireEvent.press(screen.getByRole("radio", { name: "TVöD-P" }));
    await press(screen, "Weiter");
    expect(screen.getAllByRole("alert")).toHaveLength(3);
    await select(screen, "Entgeltgruppe", "P8");
    await select(screen, "Stufe", "Stufe 4");
    await select(screen, "Tarifbereich", "Krankenhäuser · BT-K");
    await press(screen, "Weiter");
    await summary(screen);
    await press(screen, "Ohne Konto starten");
    await waitFor(() =>
      expect(mockUpdateProfile).toHaveBeenCalledWith({
        industry: "HEALTHCARE",
        federalState: "NW",
        holidayRegion: "NONE",
        weeklyMinutes: 2310,
        timeZone: "Europe/Berlin",
        manualMonthlyGrossCents: null,
        tariff: {
          payGroup: "P8",
          payLevel: 4,
          sector: "BT_K",
          tariffRegion: "OTHER",
          fullTimeWeeklyMinutes: 2310,
        },
      }),
    );
    expect(router.replace).toHaveBeenCalledWith("/");
  });
  it("accepts grouped German gross and saves manual salary without tariff", async () => {
    const screen = await render(onboarding());
    await salary(screen);
    await fireEvent.press(screen.getByRole("radio", { name: "Monatsbrutto eintragen" }));
    await fireEvent.changeText(screen.getByTestId("onboarding-manual-gross"), "3.450,50");
    await press(screen, "Weiter");
    await summary(screen, "40");
    expect(screen.getByText("3.450,50 € brutto / Monat")).toBeTruthy();
    await press(screen, "Ohne Konto starten");
    await waitFor(() =>
      expect(mockUpdateProfile).toHaveBeenCalledWith(
        expect.objectContaining({
          manualMonthlyGrossCents: 345050,
          tariff: null,
          weeklyMinutes: 2400,
        }),
      ),
    );
  });
  it("rejects scientific, overprecision and out-of-range manual salary", async () => {
    const screen = await render(onboarding());
    await salary(screen);
    await fireEvent.press(screen.getByRole("radio", { name: "Monatsbrutto eintragen" }));
    for (const value of ["1e3", "3.450,501", "0", "100.000,01", "3.45,00"]) {
      await fireEvent.changeText(screen.getByTestId("onboarding-manual-gross"), value);
      await press(screen, "Weiter");
      expect(screen.getByTestId("onboarding-manual-gross")).toHaveProp("aria-invalid", true);
      expect(screen.getByRole("alert")).toBeTruthy();
    }
    expect(mockUpdateProfile).not.toHaveBeenCalled();
  });
  it.each([false, true])("starts with 38.5 hours at 100 percent (preview: %s)", async (preview) => {
    const screen = await render(onboarding(preview));
    await salary(screen);
    await work(screen);
    expect(screen.getByTestId("onboarding-weekly-hours")).toHaveDisplayValue("38,5");
    expect(screen.getByRole("button", { name: "100 % entsprechen: 38,5 h" })).toBeTruthy();
    expect(screen.getByTestId("onboarding-percentage-value")).toHaveTextContent("100 %");
    expect(screen.getByTestId("onboarding-percentage-slider")).toHaveProp("accessibilityValue", {
      min: 10,
      max: 100,
      now: 100,
      text: "100 %",
    });
    await select(screen, "Bundesland deines Arbeitsorts", "Berlin");
    await press(screen, "Weiter");
    expect(screen.getByText("38,5 h / Woche")).toBeTruthy();
    await press(screen, "Ohne Konto starten");
    if (preview) {
      expect(mockUpdateProfile).not.toHaveBeenCalled();
    } else {
      await waitFor(() =>
        expect(mockUpdateProfile).toHaveBeenCalledWith(
          expect.objectContaining({ weeklyMinutes: 2310 }),
        ),
      );
    }
  });
  it("requires a state and rejects cleared, scientific and out-of-range hours", async () => {
    const screen = await render(onboarding());
    await salary(screen);
    await work(screen);
    await press(screen, "Weiter");
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Bitte wähle das Bundesland deines Arbeitsorts.",
    );
    await select(screen, "Bundesland deines Arbeitsorts", "Berlin");
    for (const value of ["", "1e1", "0,99", "80,01"]) {
      await fireEvent.changeText(screen.getByTestId("onboarding-weekly-hours"), value);
      await press(screen, "Weiter");
      expect(screen.getByTestId("onboarding-weekly-hours")).toHaveProp("aria-invalid", true);
    }
  });
  it("resets regional holiday selection after changing state", async () => {
    const screen = await render(onboarding());
    await salary(screen);
    await work(screen);
    await fireEvent.changeText(screen.getByTestId("onboarding-weekly-hours"), "30");
    await select(screen, "Bundesland deines Arbeitsorts", "Bayern");
    await press(screen, "Weiter");
    expect(screen.getByRole("alert")).toHaveTextContent(/Feiertagsregion/);
    await select(screen, "Regionale Feiertage am Arbeitsort", "Stadt Augsburg");
    await select(screen, "Bundesland deines Arbeitsorts", "Sachsen");
    await press(screen, "Weiter");
    expect(screen.getByRole("alert")).toHaveTextContent(/Feiertagsregion/);
    await select(screen, "Regionale Feiertage am Arbeitsort", "Keine regionale Sonderregel");
    await press(screen, "Weiter");
    await press(screen, "Ohne Konto starten");
    await waitFor(() =>
      expect(mockUpdateProfile).toHaveBeenCalledWith(
        expect.objectContaining({ federalState: "SN", holidayRegion: "NONE" }),
      ),
    );
  });
  it("preserves inputs on back and supports editing the summary", async () => {
    const screen = await render(onboarding());
    await salary(screen, "Soziale Dienste");
    await work(screen);
    await summary(screen);
    await press(screen, "Arbeitszeit bearbeiten");
    expect(screen.getByTestId("onboarding-weekly-hours")).toHaveDisplayValue("38,5");
    await fireEvent.changeText(screen.getByTestId("onboarding-weekly-hours"), "20");
    await press(screen, "Übernehmen");
    expect(screen.getByText("20 h / Woche")).toBeTruthy();
    await press(screen, "Gehalt bearbeiten");
    expect(screen.getByRole("radio", { name: "Später einrichten" })).toBeChecked();
    await press(screen, "Übernehmen");
    await press(screen, "Ohne Konto starten");
    await waitFor(() =>
      expect(mockUpdateProfile).toHaveBeenCalledWith(
        expect.objectContaining({
          industry: "SOCIAL_SERVICES",
          tariff: null,
          manualMonthlyGrossCents: null,
          weeklyMinutes: 1200,
        }),
      ),
    );
  });
  it.each(["preview", "existing"])("never writes data in %s mode", async (mode) => {
    mockProfile = mode === "existing" ? { federalState: "BY" } : null;
    const screen = await render(onboarding(mode === "preview"));
    expect(screen.getByTestId("onboarding-preview-hint")).toBeTruthy();
    await salary(screen);
    await work(screen);
    await summary(screen);
    await press(screen, "Ohne Konto starten");
    expect(mockUpdateProfile).not.toHaveBeenCalled();
    expect(router.back).toHaveBeenCalledTimes(1);
    expect(router.replace).not.toHaveBeenCalled();
  });
  it("can close the test flow before completing fields", async () => {
    const screen = await render(onboarding(true));
    await press(screen, "Los geht’s");
    await press(screen, "Testmodus schließen");
    expect(router.back).toHaveBeenCalledTimes(1);
    expect(mockUpdateProfile).not.toHaveBeenCalled();
  });
  it("locks duplicate saves, retains values on failure and allows retry", async () => {
    let rejectSave: (error: Error) => void = () => {};
    mockUpdateProfile.mockImplementationOnce(
      () =>
        new Promise<void>((_resolve, reject) => {
          rejectSave = reject;
        }),
    );
    const screen = await render(onboarding());
    await salary(screen);
    await work(screen);
    await summary(screen);
    await press(screen, "Ohne Konto starten");
    expect(screen.getByTestId("onboarding-primary-action")).toBeDisabled();
    await fireEvent.press(screen.getByTestId("onboarding-primary-action"));
    expect(mockUpdateProfile).toHaveBeenCalledTimes(1);
    await act(async () => rejectSave(new Error("Speicher nicht erreichbar")));
    expect(screen.getByRole("alert")).toBeTruthy();
    expect(screen.getByText("38,5 h / Woche")).toBeTruthy();
    await press(screen, "Ohne Konto starten");
    await waitFor(() => expect(mockUpdateProfile).toHaveBeenCalledTimes(2));
  });
  it("keeps the existing weekly-hours export compatible", () => {
    expect(parseWeeklyHours("38,5")).toBe(2310);
    expect(parseWeeklyHours("38.5")).toBe(2310);
    expect(normalizeOnboardingGross("3.450,50")).toBe("3450,50");
  });
});
