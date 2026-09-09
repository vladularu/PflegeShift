import { act, fireEvent, render } from "@testing-library/react-native";
import { afterEach, describe, expect, it, jest } from "@jest/globals";
import { AppState } from "react-native";
import type { CalendarEntry, CalendarViewMode, UserProfile } from "@/domain/types";
import { bundledRuleResolver } from "@/rules/rule-resolver";
import { SharedCalendarMonth, SharedCalendarScene } from "./calendar-shared-scene";

const profile = {
  federalState: "HE",
  holidayRegion: "NONE",
  timeZone: "Europe/Berlin",
} as UserProfile;
const display = { labelMode: "FULL" as const, showShiftTimes: true, showShiftDuration: false };
const onSelectDate = jest.fn();
const onSelectMonth = jest.fn();
const onStart = jest.fn();
const onComplete = jest.fn();
const appointment: CalendarEntry = {
  kind: "APPOINTMENT",
  id: "live",
  date: "2026-01-08",
  title: "Termin alt",
  allDay: true,
  startTime: null,
  endTime: null,
  color: "#334455",
  note: null,
  revision: 1,
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
  deletedAt: null,
};
function Tree({
  mode = "MONTH",
  entries = [],
  active = true,
}: {
  mode?: CalendarViewMode;
  entries?: CalendarEntry[];
  active?: boolean;
}) {
  return (
    <SharedCalendarScene
      month="2026-01"
      viewMode={mode}
      active={active}
      bottomReserve={55}
      onSelectMonth={onSelectMonth}
      onTransitionStart={onStart}
      onTransitionComplete={onComplete}
    >
      <SharedCalendarMonth
        month="2026-01"
        pageHeight={700}
        entriesByDate={new Map([["2026-01-08", entries]])}
        display={display}
        profile={profile}
        ruleResolver={bundledRuleResolver}
        showHolidays
        selectedDate="2026-01-08"
        onSelectDate={onSelectDate}
        accessibilityVisible
        testData={false}
      />
    </SharedCalendarScene>
  );
}
describe("shared live calendar scene", () => {
  afterEach(() => {
    jest.restoreAllMocks();
    jest.clearAllMocks();
    jest.useRealTimers();
  });
  it("keeps the month mounted across year transitions and cancels on background", async () => {
    jest.useFakeTimers();
    const listener = jest.spyOn(AppState, "addEventListener");
    const screen = await render(<Tree />);
    await act(async () => listener.mock.calls[0][1]("active"));
    await fireEvent(screen.getByTestId("calendar-shared-scene"), "layout", {
      nativeEvent: { layout: { width: 430, height: 700 } },
    });
    const month = screen.getByTestId("shared-month-2026-01");
    await screen.rerender(<Tree mode="YEAR" />);
    await act(async () => jest.advanceTimersByTime(500));
    expect(screen.getByTestId("shared-month-2026-01", { includeHiddenElements: true })).toBe(month);
    await fireEvent.press(screen.getByRole("button", { name: "September 2026 öffnen" }));
    expect(onSelectMonth).toHaveBeenCalledWith("2026-09");
    await screen.rerender(<Tree />);
    await act(async () => listener.mock.calls[0][1]("background"));
    expect(onComplete).toHaveBeenCalled();
    expect(screen.getByTestId("shared-month-2026-01")).toBe(month);
    expect(
      screen.getByTestId("calendar-year-overview-shell", { includeHiddenElements: true }),
    ).not.toBeVisible();
  });
  it("opens the tapped date with its anchor without a measurement callback", async () => {
    const screen = await render(<Tree entries={[appointment]} />);
    await fireEvent(screen.getByTestId("calendar-shared-scene"), "layout", {
      nativeEvent: { layout: { width: 420, height: 700 } },
    });
    await fireEvent.press(screen.getByTestId("calendar-day-2026-01-08"), {
      nativeEvent: { pageX: 220, pageY: 350, locationX: 10, locationY: 20 },
    });
    expect(onSelectDate).toHaveBeenCalledWith("2026-01-08", {
      x: 210,
      y: 330,
      width: 60,
      height: (700 - 55 - 32) / 6,
    });
    expect(screen.getByTestId("calendar-day-2026-01-08").props.accessibilityState.selected).toBe(
      true,
    );
  });
  it("shows edits and deletion on the same mounted month without a reload", async () => {
    const screen = await render(<Tree entries={[appointment]} />);
    await fireEvent(screen.getByTestId("calendar-shared-scene"), "layout", {
      nativeEvent: { layout: { width: 420, height: 700 } },
    });
    const month = screen.getByTestId("shared-month-2026-01");
    expect(screen.getByText("• Termin alt", { includeHiddenElements: true })).toBeTruthy();
    await screen.rerender(
      <Tree entries={[{ ...appointment, title: "Termin neu", revision: 2 }]} />,
    );
    expect(screen.queryByText("• Termin alt", { includeHiddenElements: true })).toBeNull();
    expect(screen.getByText("• Termin neu", { includeHiddenElements: true })).toBeTruthy();
    await screen.rerender(<Tree entries={[]} />);
    expect(screen.queryByText("• Termin neu", { includeHiddenElements: true })).toBeNull();
    expect(screen.getByTestId("shared-month-2026-01")).toBe(month);
  });
});
