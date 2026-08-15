import { render, within } from "@testing-library/react-native";
import { describe, expect, it, jest } from "@jest/globals";
import { useSharedValue } from "react-native-reanimated";

import type { Appointment, ShiftEntry, UserProfile } from "@/domain/types";
import { createMonthGrid, formatDateTitle } from "@/engine/calendar";
import { MonthCard } from "@/features/calendar/month-card";
import { LIGHT_PALETTE } from "@/theme/palette-values";

const PROFILE: UserProfile = {
  federalState: "NW",
  weeklyMinutes: 2_400,
  timeZone: "Europe/Berlin",
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

function shift(date: string): ShiftEntry {
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
    expect(weekNumber).toHaveStyle({ left: 1 });
  });

  it("keeps interactive days outside the month at full contrast", async () => {
    const outsideDate = createMonthGrid("2026-08")[0].date;
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

    const outsideDay = screen.getByRole("button", {
      name: new RegExp(formatDateTitle(outsideDate)),
    });
    expect(outsideDay).toHaveStyle({
      backgroundColor: LIGHT_PALETTE.outsideMonth,
    });
    expect(outsideDay).not.toHaveStyle({ opacity: 0.3 });
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
    });
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
        showShiftTimes
      />,
    );

    const day = screen.getByRole("button", { name: new RegExp(formatDateTitle(date)) });
    expect(within(day).getByText("D")).toHaveStyle({
      color: "#FFFFFF",
      fontSize: 12,
    });
    expect(within(day).getByText("06:00")).toHaveStyle({
      color: "#FFFFFF",
      fontSize: 12,
    });
    expect(within(day).getByText("A")).toHaveStyle({
      color: "#FFFFFF",
      fontSize: 12,
    });
    expect(within(day).getByText("Z")).toHaveStyle({
      color: "#FFFFFF",
      fontSize: 12,
    });
    expect(within(day).queryByText(/^\+/)).toBeNull();
  });

  it("uses a dark appointment surface in light mode so white labels stay readable", async () => {
    const date = "2026-09-18";
    const screen = await render(
      <MonthCard
        bottomReserve={55}
        entriesByDate={new Map([[date, [appointment(date, "appointment-1", "Arzttermin")]]])}
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
      height: 19,
      backgroundColor: LIGHT_PALETTE.calendarToday,
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
      minHeight: 19,
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
