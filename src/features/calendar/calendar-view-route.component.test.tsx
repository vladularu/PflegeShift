import { render } from "@testing-library/react-native";
import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { Stack } from "expo-router";

import CalendarViewRoute from "../../../app/calendar-view";
import { CalendarViewScreen } from "@/features/calendar/calendar-view-screen";
import { DARK_PALETTE, LIGHT_PALETTE, type Palette } from "@/theme/palette-values";

const mockUsePalette = jest.fn<() => Palette>();

jest.mock("expo-router", () => ({
  Stack: { Screen: jest.fn(() => null) },
}));

jest.mock("@/features/calendar/calendar-view-screen", () => ({
  CalendarViewScreen: jest.fn(() => null),
}));

jest.mock("@/theme/palette", () => ({
  usePalette: () => mockUsePalette(),
}));

describe("CalendarViewRoute", () => {
  const mockCalendarViewScreen = jest.mocked(CalendarViewScreen);
  const mockStackScreen = jest.mocked(Stack.Screen);

  beforeEach(() => {
    mockCalendarViewScreen.mockClear();
    mockStackScreen.mockClear();
    mockUsePalette.mockReset();
  });

  it("uses a light native header in light mode", async () => {
    mockUsePalette.mockReturnValue(LIGHT_PALETTE);

    await render(<CalendarViewRoute />);

    expect(mockStackScreen).toHaveBeenCalledWith(
      expect.objectContaining({
        options: expect.objectContaining({
          headerStyle: { backgroundColor: LIGHT_PALETTE.background },
          headerTintColor: LIGHT_PALETTE.text,
          headerTitleStyle: { color: LIGHT_PALETTE.text },
          statusBarStyle: "dark",
        }),
      }),
      undefined,
    );
    expect(mockCalendarViewScreen).toHaveBeenCalledTimes(1);
  });

  it("keeps the native header dark in dark mode", async () => {
    mockUsePalette.mockReturnValue(DARK_PALETTE);

    await render(<CalendarViewRoute />);

    expect(mockStackScreen).toHaveBeenCalledWith(
      expect.objectContaining({
        options: expect.objectContaining({
          headerStyle: { backgroundColor: DARK_PALETTE.background },
          headerTintColor: DARK_PALETTE.text,
          headerTitleStyle: { color: DARK_PALETTE.text },
          statusBarStyle: "light",
        }),
      }),
      undefined,
    );
  });
});
