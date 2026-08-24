import { act, fireEvent, render } from "@testing-library/react-native";
import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { router } from "expo-router";
import * as MockReact from "react";
import { Pressable as MockPressable, Text as MockText, View as MockView } from "react-native";

import { addMonths, today } from "@/engine/calendar";
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

let mockActiveMonth = "2026-08";
let mockTodayRequestRevision = 0;
let mockCompletedTodayRequestRevision = 0;

const mockActiveMonthCoordinator = {
  completeTodayRequest: jest.fn((revision: number) => {
    mockCompletedTodayRequestRevision = Math.max(mockCompletedTodayRequestRevision, revision);
  }),
  getMonth: () => mockActiveMonth,
  hasPendingTodayRequest: (revision: number) => revision > mockCompletedTodayRequestRevision,
  setMonth: jest.fn((month: string) => {
    mockActiveMonth = month;
    return month;
  }),
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
  useActiveMonthCoordinator: () => mockActiveMonthCoordinator,
  useCalendarTodayRequestRevision: () => mockTodayRequestRevision,
}));

jest.mock("@/features/calendar/calendar-header", () => ({ CalendarHeader: () => null }));

jest.mock("@/features/calendar/month-card", () => ({
  MonthCard: ({
    month,
    onSelectDate,
    selectedDate,
  }: {
    month: string;
    onSelectDate: (date: string, anchor: object) => void;
    selectedDate: string | null;
  }) => {
    return MockReact.createElement(
      MockView,
      { testID: `month-card-${month}` },
      MockReact.createElement(
        MockText,
        { testID: `month-card-selection-${month}` },
        selectedDate ?? "none",
      ),
      MockReact.createElement(
        MockPressable,
        {
          onPress: () => onSelectDate("2026-08-14", { height: 40, width: 40, x: 20, y: 120 }),
          testID: "calendar-day",
        },
        MockReact.createElement(MockText, null, "14"),
      ),
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
    mockActiveMonth = "2026-08";
    mockTodayRequestRevision = 0;
    mockCompletedTodayRequestRevision = 0;
    jest.mocked(router.push).mockClear();
    mockActiveMonthCoordinator.completeTodayRequest.mockClear();
    mockActiveMonthCoordinator.setMonth.mockClear();
    mockPreferences.setViewMode.mockClear();
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
    expect(screen.getByTestId("calendar-month-pager").props).toMatchObject({
      decelerationRate: "fast",
      disableIntervalMomentum: true,
      pagingEnabled: true,
      snapToInterval: 700,
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

  it("keeps Today selected after a calendar tab reselect settles", async () => {
    const currentDate = today("Europe/Berlin");
    const currentMonth = currentDate.slice(0, 7);
    const scrollStartMonth = addMonths(currentMonth, -4);
    mockActiveMonth = scrollStartMonth;
    const screen = await render(<CalendarScreen />);
    const pagerShell = screen.getByTestId("calendar-month-pager-shell");

    await act(async () => {
      fireEvent(pagerShell, "layout", { nativeEvent: { layout: { height: 700 } } });
    });

    await act(async () => {
      mockTodayRequestRevision = 1;
      screen.rerender(<CalendarScreen />);
    });

    expect(mockPreferences.setViewMode).toHaveBeenCalledWith("MONTH");
    expect(mockActiveMonthCoordinator.completeTodayRequest).not.toHaveBeenCalled();

    await act(async () => {
      fireEvent.scroll(screen.getByTestId("calendar-month-pager"), {
        nativeEvent: { contentOffset: { y: 700 * 25 } },
      });
    });

    expect(mockPreferences.setViewMode).toHaveBeenCalledTimes(1);
    expect(mockActiveMonthCoordinator.completeTodayRequest).not.toHaveBeenCalled();

    await act(async () => {
      fireEvent(screen.getByTestId("calendar-month-pager"), "momentumScrollEnd", {
        nativeEvent: { contentOffset: { y: 700 * 28 } },
      });
    });

    expect(mockActiveMonthCoordinator.setMonth).toHaveBeenLastCalledWith(currentMonth);
    expect(mockActiveMonthCoordinator.completeTodayRequest).toHaveBeenCalledWith(1);
    expect(screen.getByTestId(`month-card-selection-${scrollStartMonth}`).props.children).toBe(
      currentDate,
    );

    await act(async () => {
      fireEvent(screen.getByTestId("calendar-month-pager"), "momentumScrollEnd", {
        nativeEvent: { contentOffset: { y: 700 * 28 } },
      });
    });

    expect(screen.getByTestId(`month-card-selection-${scrollStartMonth}`).props.children).toBe(
      currentDate,
    );
  });
});
