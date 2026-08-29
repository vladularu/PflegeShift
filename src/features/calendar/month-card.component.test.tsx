import { render, within } from "@testing-library/react-native";
import { describe, expect, it, jest } from "@jest/globals";
import { useSharedValue } from "react-native-reanimated";

import type { Appointment, CalendarLabelMode, ShiftEntry, UserProfile } from "@/domain/types";
import { createMonthGrid, formatDateTitle, today } from "@/engine/calendar";
import { MonthCard } from "@/features/calendar/month-card";
import {
  BUNDLED_HOLIDAY_RULES,
  BUNDLED_LEGAL_RULES,
  BUNDLED_TARIFF_RULES,
} from "@/rules/bundled-rules";
import { createRuleResolver } from "@/rules/rule-resolver";
import { DARK_PALETTE, LIGHT_PALETTE } from "@/theme/palette-values";

jest.mock("@/ui/shift-symbol", () => {
  const React = jest.requireActual<typeof import("react")>("react");
  const { Text } = jest.requireActual<typeof import("react-native")>("react-native");
  return {
    ShiftSymbol: ({
      color,
      size,
      value,
    }: {
      readonly color: string;
      readonly size: number;
      readonly value: string;
    }) =>
      React.createElement(
        Text,
        { style: { color, fontSize: size }, testID: `shift-symbol-${value}` },
        value,
      ),
  };
});

const SHORT_LABEL_MODE: CalendarLabelMode = "SHORT";

const PROFILE: UserProfile = {
  federalState: "NW",
  holidayRegion: "NONE",
  weeklyMinutes: 2_400,
  timeZone: "Europe/Berlin",
  regularRotatingNightWork: false,
  sundayHolidayWorkEligible: true,
  allEmploymentWorkRecorded: true,
  tariff: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

const ENTRY_META = {
  revision: 1,
  createdAt: "2026-09-01T00:00:00.000Z",
  updatedAt: "2026-09-01T00:00:00.000Z",
  deletedAt: null,
} as const;

function shift(date: string, overrides: Partial<ShiftEntry> = {}): ShiftEntry {
  return {
    ...ENTRY_META,
    kind: "SHIFT",
    id: `${date}-shift`,
    date,
    templateId: null,
    title: "Frühdienst",
    type: "EARLY",
    allDay: false,
    startTime: "06:00",
    endTime: "14:00",
    breakMinutes: 30,
    color: "#62B94C",
    symbol: "D",
    note: null,
    overtimeMinutes: 0,
    holidayPremiumMode: "WITH_TIME_OFF",
    ...overrides,
  };
}

function appointment(date: string, id: string, title: string): Appointment {
  return {
    ...ENTRY_META,
    kind: "APPOINTMENT",
    id,
    date,
    title,
    allDay: true,
    startTime: null,
    endTime: null,
    color: "#2F80ED",
    note: null,
  };
}

function resolverWithRenamedNewYear() {
  const holidayPackage = BUNDLED_HOLIDAY_RULES[0];
  return createRuleResolver({
    tariff: BUNDLED_TARIFF_RULES,
    legal: BUNDLED_LEGAL_RULES,
    holiday: [
      {
        ...holidayPackage,
        rules: {
          ...holidayPackage.rules,
          holidays: holidayPackage.rules.holidays.map((holiday) =>
            holiday.id === "new-year" ? { ...holiday, name: "Neujahr aus Runtime" } : holiday,
          ) as typeof holidayPackage.rules.holidays,
        },
      },
    ],
  });
}

function MonthCardWithTransition({ progress }: { readonly progress: number }) {
  const stampTransitionProgress = useSharedValue(progress);
  return (
    <MonthCard
      bottomReserve={80}
      entriesByDate={new Map()}
      month="2026-08"
      onSelectDate={jest.fn()}
      pageHeight={700}
      profile={PROFILE}
      selectedDate={null}
      stampMode
      stampTransitionProgress={stampTransitionProgress}
      stampToolLabel={null}
    />
  );
}

describe("MonthCard", () => {
  it("renders holiday labels from the injected resolver", async () => {
    const screen = await render(
      <MonthCard
        bottomReserve={80}
        entriesByDate={new Map()}
        month="2026-01"
        onSelectDate={jest.fn()}
        pageHeight={700}
        profile={PROFILE}
        ruleResolver={resolverWithRenamedNewYear()}
        selectedDate={null}
      />,
    );

    expect(
      screen.getByRole("button", { name: /1\. Januar 2026.*Neujahr aus Runtime/ }),
    ).toBeTruthy();
  });

  it("places the ISO week number inside the Monday cell instead of a separate grid column", async () => {
    const screen = await render(
      <MonthCard
        bottomReserve={80}
        entriesByDate={new Map()}
        month="2026-08"
        onSelectDate={jest.fn()}
        pageHeight={700}
        profile={PROFILE}
        selectedDate={null}
      />,
    );

    const monday = screen.getByRole("button", {
      name: new RegExp(formatDateTitle("2026-08-03")),
    });
    const weekNumber = within(monday).getByText("32");
    expect(weekNumber).toBeTruthy();
    expect(monday).toHaveProp("testID", "calendar-day-current-2026-08-03");
    expect(weekNumber).toHaveStyle({ left: 1 });
    expect(monday).toHaveStyle({ marginHorizontal: 0.25 });
  });

  it("fades adjacent-month day cells together with their content", async () => {
    const outsideDate = createMonthGrid("2026-08")[0].date;
    const screen = await render(
      <MonthCard
        bottomReserve={80}
        entriesByDate={new Map([[outsideDate, [shift(outsideDate)]]])}
        month="2026-08"
        onSelectDate={jest.fn()}
        pageHeight={700}
        profile={PROFILE}
        selectedDate={null}
      />,
    );

    const outsideDay = screen.getByRole("button", {
      name: new RegExp(formatDateTitle(outsideDate)),
    });
    expect(outsideDay).toHaveStyle({
      backgroundColor: LIGHT_PALETTE.outsideMonth,
      opacity: 1,
    });
    expect(within(outsideDay).getByTestId(`calendar-entry-layer-${outsideDate}`)).toHaveStyle({
      opacity: 0.2,
    });
    expect(within(outsideDay).getByText("Frühdienst")).toBeTruthy();
  });

  it("uses a subtle dedicated surface for in-month weekends only", async () => {
    const screen = await render(
      <MonthCard
        bottomReserve={80}
        entriesByDate={new Map()}
        month="2026-08"
        onSelectDate={jest.fn()}
        pageHeight={700}
        profile={PROFILE}
        selectedDate="2026-08-01"
      />,
    );

    const saturday = screen.getByRole("button", {
      name: new RegExp(formatDateTitle("2026-08-01")),
    });
    const monday = screen.getByRole("button", {
      name: new RegExp(formatDateTitle("2026-08-03")),
    });

    expect(saturday).toHaveStyle({ backgroundColor: LIGHT_PALETTE.weekend });
    expect(monday).toHaveStyle({ backgroundColor: "transparent" });
    expect(within(saturday).getByText("1").parent).toHaveStyle({
      backgroundColor: LIGHT_PALETTE.calendarSelection,
    });
  });

  it("keeps weekend surfaces subtle but distinct in both color schemes", () => {
    for (const palette of [LIGHT_PALETTE, DARK_PALETTE]) {
      expect(palette.weekend).not.toBe(palette.surface);
      expect(palette.weekend).not.toBe(palette.outsideMonth);
    }
  });

  it("keeps today above the weekend and selection hierarchy", async () => {
    const currentDate = today(PROFILE.timeZone);
    const currentCell = createMonthGrid(currentDate.slice(0, 7)).find(
      (cell) => cell.date === currentDate,
    );
    const screen = await render(
      <MonthCard
        bottomReserve={80}
        entriesByDate={
          new Map([[currentDate, [appointment(currentDate, "today", "Termin heute")]]])
        }
        month={currentDate.slice(0, 7)}
        onSelectDate={jest.fn()}
        pageHeight={700}
        profile={PROFILE}
        selectedDate={currentDate}
      />,
    );

    const currentDay = screen.getByRole("button", {
      name: new RegExp(formatDateTitle(currentDate)),
    });
    const dateNumber = within(currentDay).getByText(String(Number(currentDate.slice(-2))));
    const todayAppointment = within(currentDay).getByText("Termin heute");

    expect(currentCell).toBeDefined();
    expect(currentDay).toHaveStyle({
      backgroundColor: currentCell?.weekend ? LIGHT_PALETTE.weekend : "transparent",
    });
    expect(dateNumber.parent).toHaveStyle({ backgroundColor: LIGHT_PALETTE.calendarToday });
    expect(dateNumber).toHaveStyle({ color: LIGHT_PALETTE.onCalendarToday });
    expect(todayAppointment).toHaveStyle({ color: LIGHT_PALETTE.text });
  });

  it("renders a muted sixth week for a five-week month", async () => {
    const screen = await render(
      <MonthCard
        bottomReserve={55}
        entriesByDate={new Map()}
        month="2026-09"
        onSelectDate={jest.fn()}
        pageHeight={795}
        profile={PROFILE}
        selectedDate={null}
      />,
    );

    const sixthWeekDay = screen.getByRole("button", {
      name: new RegExp(formatDateTitle("2026-10-05")),
    });
    expect(screen.getByTestId("calendar-week-6")).toHaveStyle({ height: 114 });
    expect(sixthWeekDay).toHaveStyle({
      backgroundColor: LIGHT_PALETTE.outsideMonth,
      opacity: 1,
    });
    expect(within(sixthWeekDay).getByTestId("calendar-entry-layer-2026-10-05")).toHaveStyle({
      opacity: 0.2,
    });
  });

  it("renders the full shift title in full-name mode", async () => {
    const date = "2026-09-18";
    const entry = shift(date, { symbol: "rise" });
    const screen = await render(
      <MonthCard
        bottomReserve={55}
        entriesByDate={new Map([[date, [entry]]])}
        labelMode="FULL"
        month="2026-09"
        onSelectDate={jest.fn()}
        pageHeight={795}
        profile={PROFILE}
        selectedDate={null}
      />,
    );
    const day = within(screen.getByRole("button", { name: new RegExp(formatDateTitle(date)) }));
    const shrinkProp = ["adjusts", "FontSizeToFit"].join("");

    expect(day.getByText("Frühdienst")).toBeTruthy();
    expect(day.getByText("Frühdienst")).toHaveProp(shrinkProp, true);
    expect(day.getByText("Frühdienst")).toHaveProp("minimumFontScale", 0.72);
    expect(day.queryByTestId("shift-symbol-rise")).toBeNull();
  });

  it("renders the first title letter in short-label mode", async () => {
    const date = "2026-09-18";
    const entry = shift(date, { symbol: "rise" });
    const screen = await render(
      <MonthCard
        bottomReserve={55}
        entriesByDate={new Map([[date, [entry]]])}
        labelMode={SHORT_LABEL_MODE}
        month="2026-09"
        onSelectDate={jest.fn()}
        pageHeight={795}
        profile={PROFILE}
        selectedDate={null}
      />,
    );
    const day = within(screen.getByRole("button", { name: new RegExp(formatDateTitle(date)) }));

    expect(day.getByText("F")).toBeTruthy();
    expect(day.queryByTestId("shift-symbol-rise")).toBeNull();
  });

  it("renders the stored ShiftSymbol in symbol mode", async () => {
    const date = "2026-09-18";
    const entry = shift(date, { symbol: "rise" });
    const screen = await render(
      <MonthCard
        bottomReserve={55}
        entriesByDate={new Map([[date, [entry]]])}
        labelMode="SYMBOL"
        month="2026-09"
        onSelectDate={jest.fn()}
        pageHeight={795}
        profile={PROFILE}
        selectedDate={null}
      />,
    );
    const day = within(screen.getByRole("button", { name: new RegExp(formatDateTitle(date)) }));

    expect(day.getByTestId("shift-symbol-rise")).toBeTruthy();
    expect(day.queryByText("Frühdienst")).toBeNull();
  });

  it("shows a detailed shift with two airy appointment rows in the same day", async () => {
    const date = "2026-09-18";
    const screen = await render(
      <MonthCard
        bottomReserve={55}
        entriesByDate={
          new Map([
            [
              date,
              [
                shift(date),
                appointment(date, "appointment-1", "Arzttermin"),
                appointment(date, "appointment-2", "Zahnarzt"),
              ],
            ],
          ])
        }
        month="2026-09"
        onSelectDate={jest.fn()}
        pageHeight={795}
        profile={PROFILE}
        selectedDate={null}
        labelMode="SYMBOL"
        showShiftTimes
      />,
    );

    const day = screen.getByRole("button", { name: new RegExp(formatDateTitle(date)) });
    expect(within(day).getByText("D")).toHaveStyle({
      color: "#FFFFFF",
      fontSize: 12,
    });
    expect(within(day).getByText("06:00")).toHaveStyle({
      color: "#171719",
      fontSize: 12,
    });
    expect(within(day).getByText("A")).toHaveStyle({
      color: LIGHT_PALETTE.text,
      fontSize: 12,
    });
    expect(within(day).getByText("Z")).toHaveStyle({
      color: LIGHT_PALETTE.text,
      fontSize: 12,
    });
    expect(within(day).queryByText(/^\+/)).toBeNull();
  });

  it("keeps appointments on the calendar surface like the visual reference", async () => {
    const date = "2026-09-18";
    const screen = await render(
      <MonthCard
        bottomReserve={55}
        entriesByDate={new Map([[date, [appointment(date, "appointment-1", "Arzttermin")]]])}
        labelMode={SHORT_LABEL_MODE}
        month="2026-09"
        onSelectDate={jest.fn()}
        pageHeight={795}
        profile={PROFILE}
        selectedDate={null}
      />,
    );

    const day = screen.getByRole("button", { name: new RegExp(formatDateTitle(date)) });
    const appointmentLabel = within(day).getByText("A");
    expect(appointmentLabel.parent).toHaveStyle({
      height: 17,
      backgroundColor: "transparent",
    });
  });

  it("describes the active stamp action on every calendar day", async () => {
    const screen = await render(
      <MonthCard
        bottomReserve={80}
        entriesByDate={new Map()}
        month="2026-08"
        onSelectDate={jest.fn()}
        pageHeight={700}
        profile={PROFILE}
        selectedDate={null}
        stampMode
        stampToolLabel="Frühdienst"
      />,
    );

    const day = screen.getByRole("button", {
      name: new RegExp(formatDateTitle("2026-08-04")),
    });
    expect(day.props.accessibilityHint).toContain("Frühdienst");
    expect(day.props.accessibilityHint).toContain("entfernt");
  });

  it("shows an outlined insertion slot on empty days while stamp mode is active", async () => {
    const screen = await render(
      <MonthCard
        bottomReserve={80}
        entriesByDate={new Map()}
        month="2026-08"
        onSelectDate={jest.fn()}
        pageHeight={700}
        profile={PROFILE}
        selectedDate={null}
        stampMode
        stampToolLabel={null}
      />,
    );

    const slot = screen.getByTestId("quick-stamp-slot-2026-08-04");
    expect(slot).toHaveStyle({
      minHeight: 17,
      borderWidth: 1,
      borderColor: LIGHT_PALETTE.border,
      borderRadius: 4,
      backgroundColor: LIGHT_PALETTE.overlaySubtle,
      opacity: 1,
    });
  });

  it("keeps insertion fields invisible at the beginning of the shared transition", async () => {
    const screen = await render(<MonthCardWithTransition progress={0} />);

    expect(screen.getByTestId("quick-stamp-slot-2026-08-04")).toHaveStyle({ opacity: 0 });
  });

  it("keeps the cell surface stable in stamp mode and only marks the date number", async () => {
    const screen = await render(
      <MonthCard
        bottomReserve={80}
        entriesByDate={new Map()}
        month="2026-08"
        onSelectDate={jest.fn()}
        pageHeight={700}
        profile={PROFILE}
        selectedDate="2026-08-04"
        stampMode
        stampToolLabel="Frühdienst"
      />,
    );

    const day = screen.getByRole("button", {
      name: new RegExp(formatDateTitle("2026-08-04")),
    });
    const dateNumber = within(day).getByText("4");

    expect(day).not.toHaveStyle({ backgroundColor: LIGHT_PALETTE.primarySoft });
    expect(dateNumber.parent).toHaveStyle({
      backgroundColor: LIGHT_PALETTE.calendarSelection,
    });
  });
});
