import { fireEvent, render, within } from "@testing-library/react-native";
import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import * as ReactNative from "react-native";
import { AppearanceContext, type AppearanceValue } from "@/theme/appearance-context";
import { resolvePalette } from "@/theme/theme-catalog";
import { AppearanceScreen } from "./appearance-screen";
import { CalendarBackgroundContext } from "./calendar-background-context";
import type { ShiftEntry } from "@/domain/types";
import { bundledRuleResolver as mockResolver } from "@/rules/rule-resolver";
import { calendarChipPalette } from "@/theme/color-contrast";
import type { CalendarImageStrength } from "@/theme/calendar-image";

const preferences: AppearanceValue = {
  themeId: "mint",
  mode: "system",
  ready: true,
  saving: false,
  error: null,
  setTheme: jest.fn(),
  setMode: jest.fn(),
  retry: jest.fn(),
  reset: jest.fn(),
};

const mockDisplay = {
  labelMode: "SHORT",
  showShiftTimes: false,
  showShiftDuration: false,
  showAppointments: true,
  showShifts: true,
  showHolidays: true,
};
const mockEntries: ShiftEntry[] = [
  {
    kind: "SHIFT",
    id: "own",
    date: "2026-10-06",
    templateId: null,
    title: "Früh",
    type: "EARLY",
    startTime: "06:00",
    endTime: "14:00",
    breakMinutes: 30,
    color: "#7E57C2",
    symbol: "F",
    note: "",
    overtimeMinutes: 0,
    holidayPremiumMode: "WITH_TIME_OFF",
    revision: 1,
    createdAt: "2026-10-01T00:00:00Z",
    updatedAt: "2026-10-01T00:00:00Z",
    deletedAt: null,
  },
];
jest.mock("@/navigation/active-month", () => ({ useActiveMonth: () => "2026-10" }));
jest.mock("@/features/calendar/calendar-preferences", () => ({
  useCalendarPreferences: () => mockDisplay,
}));
jest.mock("@/application/pflegeshift-provider", () => ({
  usePflegeShiftEntries: () => ({ entries: mockEntries }),
  usePflegeShiftProfile: () => ({
    profile: { federalState: "HE", holidayRegion: "NONE", timeZone: "Europe/Berlin" },
  }),
}));
jest.mock("@/application/rule-catalog-runtime-provider", () => ({
  useRuleCatalogRuntime: () => ({ resolver: mockResolver }),
}));
const setStrength = jest
  .fn<(_strength: CalendarImageStrength) => Promise<void>>()
  .mockResolvedValue();
const background = {
  uri: null as string | null,
  strength: "medium" as CalendarImageStrength,
  setStrength,
  ready: true,
  busy: false,
  error: null as string | null,
  supported: true,
  choose: jest.fn<() => Promise<void>>().mockResolvedValue(),
  remove: jest.fn<() => Promise<void>>().mockResolvedValue(),
  undoRemove: jest.fn<() => Promise<void>>().mockResolvedValue(),
  reset: jest.fn<() => Promise<boolean>>().mockResolvedValue(true),
  canUndoRemoval: false,
  retry: jest.fn(),
};
function screenWith(
  overrides: Partial<AppearanceValue> = {},
  image: Partial<typeof background> = {},
) {
  return (
    <CalendarBackgroundContext value={{ ...background, ...image }}>
      <AppearanceContext value={{ ...preferences, ...overrides }}>
        <AppearanceScreen />
      </AppearanceContext>
    </CalendarBackgroundContext>
  );
}
function pictureScreen() {
  return screenWith({}, { uri: "file:///photo.jpg" });
}
async function layoutPreview(screen: Awaited<ReturnType<typeof render>>) {
  await fireEvent(screen.getByTestId("appearance-preview-month"), "layout", {
    nativeEvent: { layout: { width: 288, height: 400 } },
  });
}
describe("appearance controls", () => {
  beforeEach(() => {
    mockDisplay.showShiftTimes = false;
    mockDisplay.showShiftDuration = false;
    jest.spyOn(ReactNative, "useWindowDimensions").mockReturnValue({
      width: 390,
      height: 844,
      scale: 3,
      fontScale: 1,
    });
  });

  it("keeps the appearance mode and offers a custom calendar image without extra themes", async () => {
    const screen = await render(screenWith());
    expect(screen.getByRole("radio", { name: "System", checked: true })).toBeTruthy();
    for (const name of ["Minzbrise", "Lavendelruhe", "Rosenleinen", "Meeresluft"]) {
      expect(screen.queryByRole("button", { name })).toBeNull();
    }
    expect(screen.getByRole("button", { name: "Foto auswählen" })).toBeTruthy();
    expect(screen.queryByLabelText("Bildsichtbarkeit")).toBeNull();
    await fireEvent.press(screen.getByRole("radio", { name: "Dunkel" }));
    expect(preferences.setMode).toHaveBeenCalledWith("dark");
    expect(preferences.setTheme).not.toHaveBeenCalled();
  });

  it("offers exactly the three chosen image strengths for a saved photo", async () => {
    const screen = await render(pictureScreen());
    for (const name of ["Dezent", "Mittel", "Kräftig"])
      expect(screen.getByRole("radio", { name })).toBeTruthy();
    expect(screen.getByRole("radio", { name: "Mittel", checked: true })).toBeTruthy();
    await fireEvent.press(screen.getByRole("radio", { name: "Kräftig" }));
    expect(setStrength).toHaveBeenCalledWith("strong");
  });
  it("stacks image strengths with usable touch targets when text is large", async () => {
    jest
      .spyOn(ReactNative, "useWindowDimensions")
      .mockReturnValue({ width: 320, height: 640, scale: 2, fontScale: 2 });
    const screen = await render(pictureScreen());
    expect(screen.getByLabelText("Bildsichtbarkeit")).toHaveStyle({
      flexDirection: "column",
    });
    for (const name of ["Dezent", "Mittel", "Kräftig"])
      expect(screen.getByRole("radio", { name })).toHaveStyle({ minHeight: 48 });
  });
  it("does not write again when the selected mode is pressed", async () => {
    const screen = await render(screenWith());
    await fireEvent.press(screen.getByRole("radio", { name: "System" }));
    expect(preferences.setMode).not.toHaveBeenCalled();
    expect(preferences.setTheme).not.toHaveBeenCalled();
  });
  it("stacks the choices for large text and preserves usable touch targets", async () => {
    jest.spyOn(ReactNative, "useWindowDimensions").mockReturnValue({
      width: 320,
      height: 640,
      scale: 2,
      fontScale: 2,
    });
    const screen = await render(screenWith({ mode: "light" }));
    expect(screen.getByLabelText("Erscheinungsbild")).toHaveStyle({
      flexDirection: "column",
    });
    for (const name of ["Hell", "Dunkel", "System"]) {
      expect(screen.getByRole("radio", { name })).toHaveStyle({ minHeight: 48 });
    }
  });

  it("keeps medium enlarged labels out of cramped horizontal segments", async () => {
    jest.spyOn(ReactNative, "useWindowDimensions").mockReturnValue({
      width: 375,
      height: 812,
      scale: 3,
      fontScale: 1.3,
    });
    const screen = await render(screenWith());
    expect(screen.getByLabelText("Erscheinungsbild")).toHaveStyle({ flexDirection: "column" });
  });

  it("uses a neutral track and raised selection in both modes", async () => {
    const screen = await render(screenWith({ mode: "light" }));
    for (const mode of ["light", "dark"] as const) {
      await screen.rerender(screenWith({ mode }));
      const palette = resolvePalette("mint", mode === "dark");
      expect(screen.getByLabelText("Erscheinungsbild")).toHaveStyle({
        backgroundColor: palette.surfaceMuted,
      });
      expect(screen.getByRole("radio", { checked: true })).toHaveStyle({
        backgroundColor: palette.surfaceRaised,
      });
    }
  });

  it("keeps saving feedback, retry and resetting available", async () => {
    const screen = await render(screenWith({ saving: true }));
    expect(screen.getByText("Wird gespeichert …")).toBeTruthy();
    await screen.rerender(screenWith({ error: "Darstellung konnte nicht gespeichert werden." }));
    expect(screen.getByText("Die bisherige Auswahl bleibt erhalten.")).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Erneut versuchen" }));
    expect(preferences.retry).toHaveBeenCalled();
    const alert = jest.spyOn(ReactNative.Alert, "alert");
    await fireEvent.press(screen.getByRole("button", { name: "Darstellung zurücksetzen" }));
    expect(preferences.reset).not.toHaveBeenCalled();
    await alert.mock.calls[0][2]?.find((button) => button.text === "Zurücksetzen")?.onPress?.();
    expect(background.reset).toHaveBeenCalled();
    expect(preferences.reset).toHaveBeenCalled();
  });
  it("renders live calendar entries, stored shift colors and date markers above settings", async () => {
    const screen = await render(pictureScreen());
    await layoutPreview(screen);
    const preview = screen.getByTestId("appearance-calendar-preview");
    expect(within(preview).getByText("Oktober 2026")).toBeTruthy();
    expect(within(preview).getByLabelText("2026-10-06, Früh")).toBeTruthy();
    const chip = within(within(preview).getByLabelText("2026-10-06, Früh")).getByText("F");
    expect(chip.parent).toHaveStyle({
      backgroundColor: calendarChipPalette("#7E57C2", false).main,
    });
    expect(
      within(preview).getByTestId("calendar-date-marker-2026-10-06", {
        includeHiddenElements: true,
      }),
    ).toBeTruthy();
    const root = screen.toJSON();
    expect(JSON.stringify(root).indexOf("appearance-calendar-preview")).toBeLessThan(
      JSON.stringify(root).indexOf("appearance-settings"),
    );
  });
  it("updates the real preview for each saved strength and mode without replacing its date nodes", async () => {
    const screen = await render(pictureScreen());
    await layoutPreview(screen);
    const marker = screen.getByTestId("calendar-date-marker-2026-10-06", {
      includeHiddenElements: true,
    });
    for (const mode of ["light", "dark"] as const) {
      for (const [strength, opacity] of [
        ["subtle", 0.9],
        ["medium", 0.75],
        ["strong", 0.6],
      ] as const) {
        await screen.rerender(screenWith({ mode }, { uri: "file:///photo.jpg", strength }));
        expect(
          screen.getByTestId("calendar-custom-background-overlay", { includeHiddenElements: true }),
        ).toHaveStyle({
          opacity,
          backgroundColor: resolvePalette("mint", mode === "dark").calendarBackground,
        });
        expect(
          screen.getByTestId("calendar-date-marker-2026-10-06", { includeHiddenElements: true }),
        ).toBe(marker);
      }
    }
  });
  it.each([null, "file:///photo.jpg"])(
    "shows a read-only background status with one direct photo picker (photo=%s)",
    async (uri) => {
      const alert = jest.spyOn(ReactNative.Alert, "alert");
      const screen = await render(screenWith({}, { uri }));
      const status = uri ? "Eigenes Foto" : "LUNA Standard";
      expect(screen.getByLabelText(`Hintergrund, ${status}`)).toBeTruthy();
      expect(screen.queryByRole("button", { name: /Hintergrund/ })).toBeNull();
      await fireEvent.press(
        screen.getByRole("button", { name: uri ? "Foto ändern" : "Foto auswählen" }),
      );
      expect(background.choose).toHaveBeenCalledTimes(1);
      expect(background.remove).not.toHaveBeenCalled();
      expect(alert).not.toHaveBeenCalled();
    },
  );
  it.each([false, true])(
    "limits the real preview to two accessible weeks (times=%s)",
    async (times) => {
      mockDisplay.showShiftTimes = times;
      const screen = await render(pictureScreen());
      await layoutPreview(screen);
      const hidden = { includeHiddenElements: true };
      const dates = screen.getAllByTestId(/^calendar-date-marker-/, hidden);
      const adjacentDates = screen.getAllByTestId(/^calendar-adjacent-\d{4}/, hidden);
      expect(dates.length + adjacentDates.length).toBe(14);
      expect(screen.queryByTestId("calendar-date-marker-2026-10-12", hidden)).toBeNull();
      expect(screen.queryByLabelText(/2026-10-12/, hidden)).toBeNull();
      expect(screen.getByLabelText("2026-10-06, Früh")).toBeTruthy();
      expect(screen.getByTestId("appearance-preview-month").props.style.height).toBeLessThan(300);
    },
  );
  it("uses a red text row for removing only the photo and provides undo", async () => {
    const screen = await render(pictureScreen());
    expect(screen.getByText("Foto entfernen")).toHaveStyle({
      color: resolvePalette("mint", false).danger,
    });
    await fireEvent.press(screen.getByRole("button", { name: "Foto entfernen" }));
    expect(background.remove).toHaveBeenCalled();
    expect(preferences.reset).not.toHaveBeenCalled();
    expect(preferences.setMode).not.toHaveBeenCalled();
    expect(setStrength).not.toHaveBeenCalled();
    await screen.rerender(screenWith({}, { canUndoRemoval: true }));
    expect(screen.getByText("LUNA Standard")).toBeTruthy();
    expect(screen.queryByLabelText("Bildsichtbarkeit")).toBeNull();
    await fireEvent.press(screen.getByRole("button", { name: "Rückgängig" }));
    expect(background.undoRemove).toHaveBeenCalled();
  });
  it("leaves settings and photos unchanged when resetting is canceled", async () => {
    const alert = jest.spyOn(ReactNative.Alert, "alert");
    const screen = await render(pictureScreen());
    await fireEvent.press(screen.getByRole("button", { name: "Darstellung zurücksetzen" }));
    await alert.mock.calls[0][2]?.find((button) => button.text === "Abbrechen")?.onPress?.();
    expect(preferences.reset).not.toHaveBeenCalled();
    expect(background.reset).not.toHaveBeenCalled();
  });
  it("keeps the mode when the confirmed background reset cannot be saved", async () => {
    background.reset.mockResolvedValueOnce(false);
    const alert = jest.spyOn(ReactNative.Alert, "alert");
    const screen = await render(pictureScreen());
    await fireEvent.press(screen.getByRole("button", { name: "Darstellung zurücksetzen" }));
    await alert.mock.calls[0][2]?.find((button) => button.text === "Zurücksetzen")?.onPress?.();
    expect(preferences.reset).not.toHaveBeenCalled();
  });
  it("keeps mode and photo rows operable with large type on a small iPhone", async () => {
    jest
      .spyOn(ReactNative, "useWindowDimensions")
      .mockReturnValue({ width: 320, height: 568, scale: 2, fontScale: 3 });
    const screen = await render(pictureScreen());
    for (const name of ["Hell", "Dunkel", "System", "Dezent", "Mittel", "Kräftig"])
      expect(screen.getByRole("radio", { name })).toHaveStyle({ minHeight: 48 });
    for (const name of ["Foto ändern", "Foto entfernen"])
      expect(screen.getByRole("button", { name })).toHaveStyle({ minHeight: 56 });
    expect(screen.getByRole("button", { name: "Darstellung zurücksetzen" })).toHaveStyle({
      minHeight: 48,
    });
    expect(screen.getByText("Änderungen werden automatisch gespeichert.")).toBeTruthy();
  });
});
