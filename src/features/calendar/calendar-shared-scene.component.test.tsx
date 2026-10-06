import { act, fireEvent, render, within } from "@testing-library/react-native";
import { afterEach, describe, expect, it, jest } from "@jest/globals";
import { AppState } from "react-native";
import { getAnimatedStyle } from "react-native-reanimated";
import { CalendarBackgroundContext } from "@/features/settings/calendar-background-context";
import type { CalendarEntry, CalendarViewMode, UserProfile } from "@/domain/types";
import { bundledRuleResolver } from "@/rules/rule-resolver";
import { SharedCalendarMonth, SharedCalendarScene } from "./calendar-shared-scene";

import {
  CALENDAR_IMAGE_STRENGTH_OPTIONS,
  DEFAULT_CALENDAR_IMAGE_STRENGTH,
  type CalendarImageStrength,
} from "@/theme/calendar-image";
import { LIGHT_PALETTE } from "@/theme/palette";

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
function BackgroundTree({
  uri,
  mode = "MONTH",
  strength = DEFAULT_CALENDAR_IMAGE_STRENGTH,
}: {
  uri: string | null;
  mode?: CalendarViewMode;
  strength?: CalendarImageStrength;
}) {
  return (
    <CalendarBackgroundContext
      value={{
        uri,
        strength,
        setStrength: async () => {},
        ready: true,
        busy: false,
        error: null,
        supported: true,
        choose: async () => {},
        remove: async () => {},
        canUndoRemoval: false,
        undoRemove: async () => {},
        reset: async () => true,
        retry: () => {},
      }}
    >
      <Tree mode={mode} />
    </CalendarBackgroundContext>
  );
}

describe("shared live calendar scene", () => {
  it("keeps selected day accessible but removes its full-cell outline", async () => {
    const screen = await render(<Tree />);
    expect(screen.getByTestId("calendar-day-2026-01-08")).toHaveStyle({ borderWidth: 0 });
    expect(screen.getByTestId("calendar-day-2026-01-08").props.accessibilityState).toEqual({
      selected: true,
    });
  });
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
  it("shows a saved photo in the real calendar and updates it without remounting the month", async () => {
    const hidden = { includeHiddenElements: true };
    const screen = await render(<BackgroundTree uri={null} />);
    const month = screen.getByTestId("shared-month-2026-01");
    const marker = screen.getByTestId("calendar-date-marker-2026-01-08", hidden);
    expect(screen.queryByTestId("calendar-custom-background", hidden)).toBeNull();
    await screen.rerender(<BackgroundTree uri="file:///documents/calendar-first.jpg" />);
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
    expect(screen.getByTestId("calendar-custom-background", hidden)).toBeTruthy();
    expect(screen.getByTestId("calendar-custom-background-image", hidden).props.source).toEqual({
      uri: "file:///documents/calendar-first.jpg",
    });
    expect(screen.getByTestId("calendar-month-custom-background", hidden).props.pointerEvents).toBe(
      "none",
    );
    await screen.rerender(<BackgroundTree uri="file:///documents/calendar-second.jpg" />);
    expect(screen.getByTestId("calendar-custom-background-image", hidden).props.source).toEqual({
      uri: "file:///documents/calendar-second.jpg",
    });
    await screen.rerender(<BackgroundTree uri={null} />);
    expect(screen.queryByTestId("calendar-custom-background", hidden)).toBeNull();
    expect(screen.getByTestId("shared-month-2026-01")).toBe(month);
    expect(screen.getByTestId("calendar-date-marker-2026-01-08", hidden)).toBe(marker);
  });
  it("applies every saved strength to the live month without remounting its photo or date glyphs", async () => {
    const hidden = { includeHiddenElements: true };
    const uri = "file:///documents/calendar-first.jpg";
    const screen = await render(<BackgroundTree uri={uri} />);
    const photo = screen.getByTestId("calendar-custom-background-image", hidden);
    const marker = screen.getByTestId("calendar-date-marker-2026-01-08", hidden);
    for (const option of CALENDAR_IMAGE_STRENGTH_OPTIONS) {
      await screen.rerender(<BackgroundTree uri={uri} strength={option.value} />);
      expect(screen.getByTestId("calendar-custom-background-overlay", hidden)).toHaveStyle({
        opacity: option.overlayOpacity,
      });
      const weekday = within(screen.getByTestId("calendar-month-weekdays", hidden)).getAllByText(
        "M",
        hidden,
      )[0];
      expect(weekday).toHaveStyle({
        color: option.value === "subtle" ? LIGHT_PALETTE.textMuted : LIGHT_PALETTE.text,
      });
      expect(screen.getByTestId("calendar-custom-background-image", hidden)).toBe(photo);
      expect(screen.getByTestId("calendar-date-marker-2026-01-08", hidden)).toBe(marker);
    }
  });
  it("fades the photo out in the year view and retains it when returning to the month", async () => {
    jest.useFakeTimers();
    const hidden = { includeHiddenElements: true };
    const uri = "file:///documents/calendar-first.jpg";
    const screen = await render(<BackgroundTree uri={uri} />);
    const photo = screen.getByTestId("calendar-custom-background", hidden);
    expect(
      getAnimatedStyle(screen.getByTestId("calendar-month-custom-background", hidden)),
    ).toMatchObject({
      opacity: 1,
    });
    await screen.rerender(<BackgroundTree uri={uri} mode="YEAR" />);
    await act(async () => jest.advanceTimersByTime(500));
    expect(
      getAnimatedStyle(screen.getByTestId("calendar-month-custom-background", hidden)),
    ).toMatchObject({
      opacity: 0,
    });
    expect(screen.getByTestId("calendar-year-overview-shell", hidden)).toHaveStyle({ opacity: 1 });
    await screen.rerender(<BackgroundTree uri={uri} />);
    await act(async () => jest.advanceTimersByTime(500));
    expect(
      getAnimatedStyle(screen.getByTestId("calendar-month-custom-background", hidden)),
    ).toMatchObject({
      opacity: 1,
    });
    expect(screen.getByTestId("calendar-custom-background", hidden)).toBe(photo);
  });
});
