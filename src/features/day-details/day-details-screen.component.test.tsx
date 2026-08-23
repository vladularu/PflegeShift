import { fireEvent, render } from "@testing-library/react-native";
import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { router } from "expo-router";

import { DayDetailsScreen } from "@/features/day-details/day-details-screen";
import { SCREEN_LAYOUT } from "@/theme/tokens";

jest.mock("expo-router", () => ({
  router: { back: jest.fn(), push: jest.fn() },
  Stack: { Screen: () => null },
  useLocalSearchParams: () => ({ date: "2026-08-04" }),
}));

jest.mock("@/application/pflegeshift-provider", () => ({
  usePflegeShiftEntries: () => ({ entries: [] }),
  usePflegeShiftProfile: () => ({
    profile: {
      federalState: "NW",
      weeklyMinutes: 2_400,
      timeZone: "Europe/Berlin",
      tariff: null,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    },
  }),
  usePflegeShiftStatus: () => ({ error: null, ready: true, reload: jest.fn() }),
}));

describe("DayDetailsScreen", () => {
  beforeEach(() => {
    jest.mocked(router.push).mockClear();
  });

  it("uses the shared screen rhythm and keeps one clear primary action", async () => {
    const screen = await render(<DayDetailsScreen />);

    expect(screen.getByTestId("day-details-screen").props.contentContainerStyle).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          gap: SCREEN_LAYOUT.contentGap,
          paddingHorizontal: SCREEN_LAYOUT.horizontalPadding,
          paddingTop: SCREEN_LAYOUT.contentTopPadding,
          paddingBottom: SCREEN_LAYOUT.contentBottomPadding,
        }),
      ]),
    );

    await fireEvent.press(screen.getByRole("button", { name: "Schicht hinzufügen" }));
    expect(router.push).toHaveBeenLastCalledWith({
      pathname: "/quick-add",
      params: { date: "2026-08-04" },
    });

    await fireEvent.press(screen.getByRole("button", { name: "Termin hinzufügen" }));
    expect(router.push).toHaveBeenLastCalledWith({
      pathname: "/appointment-editor",
      params: { date: "2026-08-04", mode: "APPOINTMENT" },
    });
  });
});
