import { fireEvent, render } from "@testing-library/react-native";
import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { Stack, Redirect, router } from "expo-router";
import CalendarDesignRoute from "../../../app/calendar-design";
import CalendarViewRoute from "../../../app/calendar-view";
import AppearanceRoute from "../../../app/appearance";
import { CalendarDesignScreen } from "@/features/settings/calendar-design-screen";
import { DARK_PALETTE, LIGHT_PALETTE, type Palette } from "@/theme/palette-values";

const mockUsePalette = jest.fn<() => Palette>();
let mockParams: { origin?: string | string[]; notice?: string | string[] } = {};
jest.mock("expo-router", () => ({
  Stack: { Screen: jest.fn(() => null) },
  Redirect: jest.fn(() => null),
  router: { back: jest.fn(), replace: jest.fn(), canGoBack: jest.fn(() => true) },
  useLocalSearchParams: () => mockParams,
}));
jest.mock("@/features/settings/calendar-design-screen", () => ({
  CalendarDesignScreen: jest.fn(() => null),
}));
jest.mock("@/theme/palette", () => ({ usePalette: () => mockUsePalette() }));

describe("shared calendar design navigation", () => {
  beforeEach(() => {
    mockUsePalette.mockReturnValue(LIGHT_PALETTE);
    mockParams = {};
    jest.mocked(router.canGoBack).mockReturnValue(true);
  });
  it.each([LIGHT_PALETTE, DARK_PALETTE])(
    "uses a readable native header in both modes",
    async (palette) => {
      mockUsePalette.mockReturnValue(palette);
      await render(<CalendarDesignRoute />);
      expect(Stack.Screen).toHaveBeenCalledWith(
        expect.objectContaining({
          options: expect.objectContaining({
            title: "Kalender gestalten",
            headerStyle: { backgroundColor: palette.groupedBackground },
            headerTintColor: palette.text,
            headerTitleStyle: { color: palette.text },
            statusBarStyle: palette.dark ? "light" : "dark",
          }),
        }),
        undefined,
      );
      expect(CalendarDesignScreen).toHaveBeenCalledTimes(1);
    },
  );
  it.each(["holidays", "loading", "unknown", ["holidays"]])(
    "only displays recognized notice codes: %s",
    async (notice) => {
      mockParams = { notice };
      await render(<CalendarDesignRoute />);
      expect(CalendarDesignScreen).toHaveBeenCalledWith(
        expect.objectContaining({
          notice: notice === "holidays" || notice === "loading" ? expect.any(String) : undefined,
        }),
        undefined,
      );
    },
  );
  it.each(["calendar", "settings"])(
    "returns to the actual entry via history: %s",
    async (origin) => {
      mockParams = { origin };
      const screen = await render(<CalendarDesignRoute />);
      await fireEvent.press(
        screen.getByRole("button", {
          name: origin === "settings" ? "Zurück zu Mehr" : "Zurück zum Kalender",
        }),
      );
      expect(router.back).toHaveBeenCalledTimes(1);
      expect(router.replace).not.toHaveBeenCalled();
    },
  );
  it.each([
    ["calendar", "/"],
    ["settings", "/more"],
    ["unknown", "/"],
    [["settings"], "/"],
  ] as [string | string[], string][])(
    "handles direct links without a navigation history: %s",
    async (origin, destination) => {
      mockParams = { origin: Array.isArray(origin) ? [...origin] : (origin as string) };
      jest.mocked(router.canGoBack).mockReturnValue(false);
      const screen = await render(<CalendarDesignRoute />);
      await fireEvent.press(
        screen.getByRole("button", {
          name: origin === "settings" ? "Zurück zu Mehr" : "Zurück zum Kalender",
        }),
      );
      expect(router.replace).toHaveBeenCalledWith(destination);
      expect(router.back).not.toHaveBeenCalled();
    },
  );
  it("replaces the old appearance route with the same page", async () => {
    await render(<AppearanceRoute />);
    expect(Redirect).toHaveBeenCalledWith(
      { href: { pathname: "/calendar-design", params: { origin: "settings" } } },
      undefined,
    );
  });
  it.each(["holidays", "loading", "unknown", ["holidays"]])(
    "replaces the old display route and sanitizes its notice: %s",
    async (notice) => {
      mockParams = { notice };
      await render(<CalendarViewRoute />);
      expect(Redirect).toHaveBeenCalledWith(
        {
          href: {
            pathname: "/calendar-design",
            params: {
              origin: "calendar",
              ...(notice === "holidays" || notice === "loading" ? { notice } : {}),
            },
          },
        },
        undefined,
      );
    },
  );
});
