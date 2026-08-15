import { act, fireEvent, render } from "@testing-library/react-native";
import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { router } from "expo-router";
import * as MockReact from "react";
import { Pressable as MockPressable, Text as MockText, View as MockView } from "react-native";

import { CalendarScreen } from "@/features/calendar/calendar-screen";

const mockPreferences = {
  error: null,
  labelMode: "FULL",
  retry: jest.fn(),
  saving: false,
  setViewMode: jest.fn(),
  showAppointments: true,
  showHolidays: true,
  showShiftDuration: false,
  showShifts: true,
  showShiftTimes: false,
  viewMode: "MONTH",
};

const mockActiveMonthCoordinator = {
  getMonth: () => "2026-08",
  setMonth: jest.fn(),
};

jest.mock("expo-router", () => ({
  router: { push: jest.fn(), replace: jest.fn() },
  Stack: { Screen: () => null },
  useFocusEffect: (effect: () => void) => effect(),
  useIsFocused: () => true,
  useLocalSearchParams: () => ({}),
  useNavigation: () => ({ getParent: () => null }),
}));

jest.mock("@/application/pflegeshift-provider", () => ({
  usePflegeShiftEntries: () => ({
    entries: [],
    removeEntry: jest.fn(),
    upsertShift: jest.fn(),
  }),
  usePflegeShiftProfile: () => ({
    profile: {
      federalState: "HE",
      timeZone: "Europe/Berlin",
    },
  }),
  usePflegeShiftStatus: () => ({ error: null, ready: true, reload: jest.fn() }),
  usePflegeShiftTemplates: () => ({ templates: [] }),
  usePflegeShiftTestData: () => ({ testMonths: [] }),
}));

jest.mock("@/features/calendar/calendar-preferences", () => ({
  useCalendarPreferences: () => mockPreferences,
}));

jest.mock("@/navigation/active-month", () => ({
  calendarTabShouldOpenToday: () => false,
  useActiveMonthCoordinator: () => mockActiveMonthCoordinator,
}));

jest.mock("@/features/calendar/calendar-header", () => ({ CalendarHeader: () => null }));

jest.mock("@/features/calendar/month-card", () => ({
  MonthCard: ({ onSelectDate }: { onSelectDate: (date: string, anchor: object) => void }) => {
    return MockReact.createElement(
      MockPressable,
      {
        onPress: () => onSelectDate("2026-08-14", { height: 40, width: 40, x: 20, y: 120 }),
        testID: "calendar-day",
      },
      MockReact.createElement(MockText, null, "14"),
    );
  },
}));

jest.mock("@/features/calendar/quick-planner-dock", () => ({
  QuickPlannerDock: () => MockReact.createElement(MockView, { testID: "quick-planner-dock" }),
}));
jest.mock("@/features/calendar/quick-entry-popup", () => ({
  QuickEntryPopup: ({
    date,
    onOpenShiftPicker,
  }: {
    date: string;
    onOpenShiftPicker: (date: string) => void;
  }) =>
    MockReact.createElement(
      MockView,
      { testID: "mounted-quick-entry-popup" },
      MockReact.createElement(
        MockPressable,
        {
          accessibilityLabel: "Schicht öffnen",
          accessibilityRole: "button",
          onPress: () => onOpenShiftPicker(date),
        },
        MockReact.createElement(MockText, null, "Schicht"),
      ),
    ),
}));
jest.mock("@/features/calendar/year-overview", () => ({ YearOverview: () => null }));
jest.mock("@/features/calendar/use-quick-stamp-action", () => ({
  useQuickStampAction: () => jest.fn(),
}));
jest.mock("@/ui/use-theme-status-bar", () => ({ useThemeStatusBar: () => undefined }));

describe("CalendarScreen quick-entry navigation", () => {
  beforeEach(() => {
    jest.mocked(router.push).mockClear();
    jest.spyOn(global, "requestAnimationFrame").mockImplementation((callback) => {
      callback(0);
      return 1;
    });
  });

  it("keeps the compact popup mounted beneath the root shift screen", async () => {
    const screen = await render(<CalendarScreen />);
    const pager = screen.getByTestId("calendar-month-pager-shell");

    await act(async () => {
      fireEvent(pager, "layout", { nativeEvent: { layout: { height: 700 } } });
    });
    expect(screen.getByTestId("quick-planner-dock")).toBeTruthy();
    await fireEvent.press(screen.getByTestId("calendar-day"));
    expect(screen.getByTestId("mounted-quick-entry-popup")).toBeTruthy();
    expect(screen.queryByTestId("quick-planner-dock")).toBeNull();

    await fireEvent.press(screen.getByRole("button", { name: "Schicht öffnen" }));
    expect(router.push).toHaveBeenCalledWith({
      pathname: "/shift-selection",
      params: { date: "2026-08-14" },
    });
    expect(screen.getByTestId("mounted-quick-entry-popup")).toBeTruthy();
  });
});
