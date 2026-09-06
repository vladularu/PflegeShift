import { act, fireEvent, render } from "@testing-library/react-native";
import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { router } from "expo-router";
import * as MockReact from "react";
import { Pressable as MockPressable, Text as MockText, View as MockView } from "react-native";

import { addMonths, today } from "@/engine/calendar";
import { CalendarScreen } from "@/features/calendar/calendar-screen";
import {
  BUNDLED_HOLIDAY_RULES,
  BUNDLED_LEGAL_RULES,
  BUNDLED_TARIFF_RULES,
} from "@/rules/bundled-rules";
import { bundledRuleResolver, createRuleResolver, type RuleResolver } from "@/rules/rule-resolver";

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
let mockRuleResolver: RuleResolver = bundledRuleResolver;
let mockReady = true;
let mockCalendarRange: { startDate: string; endDate: string } | null = null;

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
      holidayRegion: "NONE",
      timeZone: "Europe/Berlin",
    },
  }),
  usePflegeShiftStatus: () => ({
    error: null,
    ready: mockReady,
    calendarRange: mockCalendarRange,
    reload: jest.fn(),
  }),
  usePflegeShiftTemplates: () => ({ templates: [] }),
  usePflegeShiftTestData: () => ({ testMonths: [] }),
}));

jest.mock("@/application/rule-catalog-runtime-provider", () => {
  return { useRuleCatalogRuntime: () => ({ resolver: mockRuleResolver }) };
});

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
    mockRuleResolver = bundledRuleResolver;
    mockReady = true;
    mockCalendarRange = null;
    mockPreferences.viewMode = "MONTH";
    jest.mocked(router.push).mockClear();
    mockActiveMonthCoordinator.completeTodayRequest.mockClear();
    mockActiveMonthCoordinator.setMonth.mockClear();
    mockPreferences.setViewMode.mockClear();
    jest.spyOn(global, "requestAnimationFrame").mockImplementation((callback) => {
      callback(0);
      return 1;
    });
  });

  it.each([-36, 36])(
    "returns from a distant year (%s months) without publishing animation pages",
    async (distance) => {
      const month = today("Europe/Berlin").slice(0, 7);
      mockActiveMonth = addMonths(month, distance);
      const screen = await render(<CalendarScreen />);
      await act(async () =>
        fireEvent(screen.getByTestId("calendar-month-pager-shell"), "layout", {
          nativeEvent: { layout: { height: 700 } },
        }),
      );
      mockActiveMonthCoordinator.setMonth.mockClear();
      await act(async () => {
        mockTodayRequestRevision = 1;
        await screen.rerender(<CalendarScreen />);
      });
      expect(mockActiveMonthCoordinator.setMonth).toHaveBeenCalledTimes(1);
      expect(mockActiveMonthCoordinator.setMonth).toHaveBeenLastCalledWith(month);
      const targetIndex = distance < 0 ? 28 : 20;
      await act(async () => {
        const nativeEvent = { contentOffset: { y: 700 * (distance < 0 ? 25 : 23) } };
        await fireEvent.scroll(screen.getByTestId("calendar-month-pager"), { nativeEvent });
        await fireEvent(screen.getByTestId("calendar-month-pager"), "momentumScrollEnd", {
          nativeEvent,
        });
      });
      expect(mockActiveMonthCoordinator.setMonth).toHaveBeenCalledTimes(1);
      expect(mockActiveMonthCoordinator.completeTodayRequest).not.toHaveBeenCalled();
      await act(async () =>
        fireEvent(screen.getByTestId("calendar-month-pager"), "momentumScrollEnd", {
          nativeEvent: { contentOffset: { y: 700 * targetIndex } },
        }),
      );
      expect(mockActiveMonthCoordinator.completeTodayRequest).toHaveBeenCalledWith(1);
      expect(mockActiveMonth).toBe(month);
      expect(screen.getByTestId("calendar-month-pager").props.scrollEnabled).toBe(true);
    },
  );

  it.each(["momentumScrollEnd", "scrollEndDrag"])(
    "keeps the December/January pager mounted after %s while entries refresh",
    async (completion) => {
      mockActiveMonth = "2026-12";
      const screen = await render(<CalendarScreen />);
      await act(async () =>
        fireEvent(screen.getByTestId("calendar-month-pager-shell"), "layout", {
          nativeEvent: { layout: { height: 700 } },
        }),
      );
      const pager = screen.getByTestId("calendar-month-pager");
      await act(async () =>
        fireEvent.scroll(pager, { nativeEvent: { contentOffset: { y: 700 * 25 } } }),
      );
      expect(mockActiveMonth).toBe("2026-12");
      await act(async () =>
        fireEvent(pager, completion, {
          nativeEvent: { contentOffset: { y: 700 * 25 }, velocity: { y: 0 } },
        }),
      );
      expect(mockActiveMonth).toBe("2027-01");
      await act(async () => {
        mockReady = false;
        mockCalendarRange = { startDate: "2025-01-01", endDate: "2027-12-31" };
        await screen.rerender(<CalendarScreen />);
      });
      expect(screen.getByTestId("calendar-month-pager")).toBe(pager);
    },
  );

  it("keeps a covered year overview visible while its surrounding range refreshes", async () => {
    mockActiveMonth = "2027-08";
    mockPreferences.viewMode = "YEAR";
    mockReady = false;
    mockCalendarRange = { startDate: "2025-01-01", endDate: "2027-12-31" };

    const screen = await render(<CalendarScreen />);

    expect(screen.getByTestId("calendar-year-overview-shell")).toBeTruthy();
    expect(screen.queryByTestId("calendar-month-pager-shell")).toBeNull();
  });

  it("mounts distinct transition scenes for month and year views", async () => {
    const screen = await render(<CalendarScreen />);
    expect(screen.getByTestId("calendar-month-pager-shell")).toBeTruthy();

    await act(async () => {
      mockPreferences.viewMode = "YEAR";
      await screen.rerender(<CalendarScreen />);
    });

    expect(screen.queryByTestId("calendar-month-pager-shell")).toBeNull();
    expect(screen.getByTestId("calendar-year-overview-shell")).toBeTruthy();
  });

  it("warns when December's visible grid reaches beyond holiday coverage", async () => {
    const holidayPackage = BUNDLED_HOLIDAY_RULES[0];
    mockActiveMonth = "2026-12";
    mockRuleResolver = createRuleResolver({
      tariff: BUNDLED_TARIFF_RULES,
      legal: BUNDLED_LEGAL_RULES,
      holiday: [{ ...holidayPackage, validTo: "2026-12-31" }],
    });

    const screen = await render(<CalendarScreen />);

    expect(
      screen.getByText("Feiertagsregeln für diesen Zeitraum noch nicht verfügbar."),
    ).toBeTruthy();
    expect(screen.queryByText("LUNA Shift konnte nicht angezeigt werden")).toBeNull();
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
